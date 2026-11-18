package opennava

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sync"
	"time"

	"browser-mac/internal/secret"
)

const stateFile = "opennava-watchlist.json"

type target struct {
	Device
	Hardware string `json:"hardware"`
}
type state struct {
	Target  target `json:"target"`
	Pending []Item `json:"pending"`
}
type Status struct {
	Device  Device `json:"device"`
	Pending []Item `json:"pending"`
	Issue   string `json:"issue"`
}

type Manager struct {
	mu       sync.Mutex
	transfer sync.Mutex
	store    *secret.Store
	adb      adbCommand
	state    state
	loadErr  error
	issue    string
	wake     chan struct{}
}

func New(store *secret.Store) *Manager {
	m := &Manager{store: store, adb: runADB, wake: make(chan struct{}, 1)}
	s, ok, err := store.Get(stateFile)
	if err == nil && ok {
		err = json.Unmarshal([]byte(s), &m.state)
	}
	m.loadErr = err
	return m
}

func (m *Manager) persist(next state) error {
	if m.loadErr != nil {
		return m.loadErr
	}
	b, err := json.Marshal(next)
	if err != nil {
		return err
	}
	if err = m.store.Set(stateFile, string(b)); err != nil {
		return err
	}
	m.state = next
	return nil
}

func (m *Manager) Status() (Status, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Status{Device: m.state.Target.Device, Pending: slices.Clone(m.state.Pending), Issue: m.issue}, m.loadErr
}

func (m *Manager) Pair(ctx context.Context, serial string) error {
	m.transfer.Lock()
	defer m.transfer.Unlock()
	devices, err := m.Devices(ctx)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(devices, func(d Device) bool { return d.Serial == serial })
	if i < 0 {
		return errors.New("Wähle einen verbundenen und autorisierten Fernseher.")
	}
	id, err := m.hardwareID(ctx, serial)
	if err != nil {
		return err
	}
	out, err := m.adb(ctx, "-s", serial, "shell", "content", "call", "--uri", provider, "--method", "luna_status")
	if err != nil {
		return err
	}
	if !ack(out, "ready") {
		return errors.New("Installiere die OpenNava-Version mit Luna-Merkliste auf dem Fernseher.")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	next := m.state
	if len(next.Pending) > 0 && next.Target.Hardware != id {
		return errors.New("Entferne ausstehende Vormerkungen, bevor du den Fernseher wechselst.")
	}
	next.Target = target{Device: devices[i], Hardware: id}
	if err = m.persist(next); err == nil {
		m.issue = ""
		m.Retry()
	}
	return err
}

func (m *Manager) Forget() error {
	m.transfer.Lock()
	defer m.transfer.Unlock()
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.state.Pending) > 0 {
		return errors.New("Entferne ausstehende Vormerkungen, bevor du den Fernseher wechselst.")
	}
	if err := m.persist(state{}); err != nil {
		return err
	}
	m.issue = ""
	return nil
}

func (m *Manager) Add(raw, title string) error {
	item, err := programme(raw, title)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.loadErr != nil {
		return m.loadErr
	}
	if m.state.Target.Hardware == "" {
		return errors.New("Wähle zuerst deinen OpenNava-Fernseher.")
	}
	next := m.state
	if !slices.ContainsFunc(next.Pending, func(i Item) bool { return i.URL == item.URL }) {
		if len(next.Pending) >= 200 {
			return errors.New("Die Warteschlange ist voll.")
		}
		next.Pending = append(slices.Clone(next.Pending), item)
		if err = m.persist(next); err != nil {
			return err
		}
	}
	m.Retry()
	return nil
}

func (m *Manager) removeLocked(raw string) error {
	next := m.state
	i := slices.IndexFunc(next.Pending, func(e Item) bool { return e.URL == raw })
	if i < 0 {
		return nil
	}
	next.Pending = slices.Delete(slices.Clone(next.Pending), i, i+1)
	if err := m.persist(next); err != nil {
		return err
	}
	m.issue = ""
	return nil
}

func (m *Manager) Remove(raw string) error {
	m.transfer.Lock()
	defer m.transfer.Unlock()
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.removeLocked(raw)
}

func (m *Manager) Retry() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}

// Serialise acknowledgements, device changes and cancellations. Adding to the
// queue or reading the dialog state never waits for an offline TV.
func (m *Manager) deliver(ctx context.Context) bool {
	m.transfer.Lock()
	defer m.transfer.Unlock()
	m.mu.Lock()
	if len(m.state.Pending) == 0 || m.loadErr != nil || ctx.Err() != nil {
		m.mu.Unlock()
		return false
	}
	item, tv := m.state.Pending[0], m.state.Target
	m.mu.Unlock()
	err := m.verifyTarget(ctx, tv)
	if err == nil {
		err = m.send(ctx, tv.Serial, item)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if err == nil {
		err = m.removeLocked(item.URL)
	}
	if err != nil {
		m.issue = err.Error()
		return false
	}
	return len(m.state.Pending) > 0
}

func (m *Manager) Run(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		for m.deliver(ctx) {
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-m.wake:
		}
	}
}
