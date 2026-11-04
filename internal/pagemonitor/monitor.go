// Package pagemonitor checks public HTTP pages without opening tabs or using cookies.
package pagemonitor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/net/html"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Watch struct {
	AutoRefresh *bool     `json:"auto_refresh,omitempty"`
	Source      string    `json:"source"`
	Selector    string    `json:"selector,omitempty"`
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Interval    int       `json:"interval_minutes"`
	Enabled     bool      `json:"enabled"`
	Hash        string    `json:"hash,omitempty"`
	Checked     time.Time `json:"last_checked"`
	Changed     time.Time `json:"last_changed"`
	Error       string    `json:"error,omitempty"`
}
type Manager struct {
	Updated     func()
	BrowserRead func(context.Context, Watch) (string, error)
	mu          sync.Mutex
	path        string
	watches     []Watch
	client      *http.Client
	notify      func(Watch)
}

func (w Watch) RefreshEnabled() bool {
	return w.Source == "browser" && (w.AutoRefresh == nil || *w.AutoRefresh)
}

func (m *Manager) Edit(id string, interval int, refresh bool) ([]Watch, error) {
	if interval < 1 || interval > 10080 {
		return nil, errors.New("Intervall: 1 bis 10080 Minuten")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.watches {
		if m.watches[i].ID == id {
			previous := m.watches[i]
			m.watches[i].Interval = interval
			m.watches[i].AutoRefresh = &refresh
			if err := m.save(); err != nil {
				m.watches[i] = previous
				return nil, err
			}
			if m.Updated != nil {
				m.Updated()
			}
			return append([]Watch{}, m.watches...), nil
		}
	}
	return nil, errors.New("Überwachung nicht gefunden")
}

func New(path string, notify func(Watch)) (*Manager, error) {
	m := &Manager{path: path, notify: notify}
	transport := &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		for _, ip := range ips {
			if !ip.IP.IsGlobalUnicast() || ip.IP.IsPrivate() || ip.IP.IsLoopback() || ip.IP.IsLinkLocalUnicast() {
				return nil, errors.New("Nur öffentliche Webseiten werden unterstützt")
			}
		}
		if len(ips) == 0 {
			return nil, errors.New("Keine öffentliche Adresse")
		}
		return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}}
	m.client = &http.Client{Transport: transport, Timeout: 25 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("Zu viele Weiterleitungen")
		}
		return validate(req.URL.String())
	}}
	b, err := os.ReadFile(path)
	if err == nil {
		err = json.Unmarshal(b, &m.watches)
	}
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	return m, nil
}
func validate(raw string) error {
	u, e := url.Parse(raw)
	if e != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
		return errors.New("Öffentliche HTTP/HTTPS-URL ohne Zugangsdaten erforderlich")
	}
	return nil
}
func (m *Manager) save() error {
	b, e := json.MarshalIndent(m.watches, "", "  ")
	if e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Dir(m.path), 0700); e != nil {
		return e
	}
	tmp := m.path + ".tmp"
	if e = os.WriteFile(tmp, b, 0600); e != nil {
		return e
	}
	return os.Rename(tmp, m.path)
}
func (m *Manager) List() []Watch {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]Watch{}, m.watches...)
}
func (m *Manager) Add(raw string, interval int) (Watch, error) {
	return m.AddSource(raw, interval, "public", "")
}
func (m *Manager) AddSource(raw string, interval int, source, selector string) (Watch, error) {
	if source == "" {
		source = "public"
	}
	if source != "public" && source != "browser" {
		return Watch{}, errors.New("source muss public oder browser sein")
	}
	if source == "browser" && (strings.TrimSpace(selector) == "" || len(selector) > 1000) {
		return Watch{}, errors.New("Für Login-Seiten ist ein Selektor für den angemeldeten Inhaltsbereich erforderlich")
	}
	if e := validate(raw); e != nil {
		return Watch{}, e
	}
	if interval == 0 {
		interval = 5
	}
	if interval < 1 || interval > 10080 {
		return Watch{}, errors.New("Intervall: 1 bis 10080 Minuten")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.watches {
		if w.URL == raw && w.Source == source && w.Selector == selector {
			return w, nil
		}
	}
	if len(m.watches) >= 100 {
		return Watch{}, errors.New("Maximal 100 Überwachungen")
	}
	sum := sha256.Sum256([]byte(raw + "\n" + source + "\n" + selector))
	w := Watch{ID: hex.EncodeToString(sum[:12]), URL: raw, Interval: interval, Enabled: true, Source: source, Selector: selector}
	m.watches = append(m.watches, w)
	if e := m.save(); e != nil {
		m.watches = m.watches[:len(m.watches)-1]
		return Watch{}, e
	}
	if m.Updated != nil {
		m.Updated()
	}
	return w, nil
}
func (m *Manager) Update(id, action string) ([]Watch, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	old := append([]Watch{}, m.watches...)
	found := false
	for i := range m.watches {
		if m.watches[i].ID != id {
			continue
		}
		found = true
		switch action {
		case "remove":
			m.watches = append(m.watches[:i], m.watches[i+1:]...)
		case "pause":
			m.watches[i].Enabled = false
		case "resume":
			m.watches[i].Enabled = true
			m.watches[i].Checked = time.Time{}
		case "check":
			if !m.watches[i].Enabled {
				return nil, errors.New("Überwachung ist pausiert")
			}
			m.watches[i].Checked = time.Time{}
		default:
			return nil, errors.New("Ungültige Aktion")
		}
		break
	}
	if !found {
		return nil, errors.New("Überwachung nicht gefunden")
	}
	if e := m.save(); e != nil {
		m.watches = old
		return nil, e
	}
	if m.Updated != nil {
		m.Updated()
	}
	return append([]Watch{}, m.watches...), nil
}
func (m *Manager) Run(ctx context.Context) {
	m.check(ctx)
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			m.check(ctx)
		}
	}
}
func (m *Manager) check(ctx context.Context) {
	for _, w := range m.List() {
		if ctx.Err() != nil {
			return
		}
		delay := time.Duration(w.Interval) * time.Minute
		if w.Source == "browser" && w.Error != "" {
			delay = 15 * time.Second
		}
		if !w.Enabled || time.Since(w.Checked) < delay {
			continue
		}
		var hash string
		var err error
		if w.Source == "browser" {
			if m.BrowserRead == nil {
				err = errors.New("Warte auf Browserseite")
			} else {
				readContext, cancel := context.WithTimeout(ctx, 35*time.Second)
				var content string
				content, err = m.BrowserRead(readContext, w)
				cancel()
				if err == nil {
					if strings.TrimSpace(content) == "" {
						err = errors.New("Warte auf angemeldeten Inhalt")
					} else {
						sum := sha256.Sum256([]byte(strings.Join(strings.Fields(content), " ")))
						hash = hex.EncodeToString(sum[:])
					}
				}
			}
		} else {
			hash, err = m.fetch(ctx, w.URL)
		}
		m.mu.Lock()
		for i := range m.watches {
			v := &m.watches[i]
			if v.ID != w.ID || !v.Enabled {
				continue
			}
			previous := *v
			v.Checked = time.Now().UTC()
			v.Error = ""
			changed := false
			if err != nil {
				v.Error = err.Error()
			} else {
				changed = v.Hash != "" && v.Hash != hash
				v.Hash = hash
				if changed {
					v.Changed = v.Checked
				}
			}
			if e := m.save(); e != nil {
				*v = previous
				v.Checked = time.Now().UTC()
				v.Error = "Vergleich konnte nicht gespeichert werden: " + e.Error()
			} else if changed && m.notify != nil {
				m.notify(*v)
			}
			if m.Updated != nil {
				m.Updated()
			}
			break
		}
		m.mu.Unlock()
	}
}
func (m *Manager) fetch(ctx context.Context, raw string) (string, error) {
	req, e := http.NewRequestWithContext(ctx, "GET", raw, nil)
	if e != nil {
		return "", e
	}
	req.Header.Set("User-Agent", "Luna-PageMonitor/1.0")
	res, e := m.client.Do(req)
	if e != nil {
		return "", e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", fmt.Errorf("HTTP %d", res.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, 2*1024*1024+1))
	if e != nil {
		return "", e
	}
	if len(b) > 2*1024*1024 {
		return "", errors.New("Seite größer als 2 MiB")
	}
	ct := res.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/html") && !strings.Contains(ct, "text/plain") {
		return "", errors.New("Nur HTML und Text werden unterstützt")
	}
	text := string(b)
	if strings.Contains(ct, "text/html") {
		doc, e := html.Parse(strings.NewReader(text))
		if e != nil {
			return "", e
		}
		var out strings.Builder
		var visit func(*html.Node)
		visit = func(n *html.Node) {
			if n.Type == html.ElementNode {
				switch n.Data {
				case "script", "style", "noscript", "template", "head":
					return
				}
				for _, a := range n.Attr {
					if a.Key == "hidden" || (a.Key == "aria-hidden" && a.Val == "true") {
						return
					}
				}
			}
			if n.Type == html.TextNode {
				out.WriteString(n.Data)
				out.WriteByte(' ')
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				visit(c)
			}
		}
		visit(doc)
		text = out.String()
	}
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return "", errors.New("Kein lesbarer Text; JavaScript-Seiten werden nicht gerendert")
	}
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:]), nil
}
