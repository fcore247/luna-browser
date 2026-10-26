// Package extensions installs reviewed WebExtension packages into Luna's own profile.
package extensions

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const maxPackage = 64 << 20
const maxExpanded = 256 << 20

var validID = regexp.MustCompile(`^[a-p]{32}$`)
var tokenID = regexp.MustCompile(`^[a-f0-9]{32}$`)

type Entry struct {
	CompatibilityLevel string   `json:"compatibilityLevel,omitempty"`
	Compatibility      string   `json:"compatibility,omitempty"`
	Unsupported        bool     `json:"unsupported,omitempty"`
	Icon               string   `json:"icon,omitempty"`
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Version            string   `json:"version"`
	Permissions        []string `json:"permissions"`
	Enabled            bool     `json:"enabled"`
	RuntimeID          string   `json:"runtimeID,omitempty"`
	Error              string   `json:"error,omitempty"`
}
type Manifest struct {
	Name            string            `json:"name"`
	Version         string            `json:"version"`
	ManifestVersion int               `json:"manifest_version"`
	DefaultLocale   string            `json:"default_locale"`
	Permissions     []json.RawMessage `json:"permissions"`
	Hosts           []string          `json:"host_permissions"`
	Content         []struct {
		Matches []string `json:"matches"`
	} `json:"content_scripts"`
}
type Engine func(op string, args map[string]any) (string, error)
type Manager struct {
	mu      sync.Mutex
	root    string
	entries []Entry
	pending map[string]Entry
	engine  Engine
}

func New(root string, engine Engine) (*Manager, error) {
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	m := &Manager{root: root, engine: engine, pending: map[string]Entry{}, entries: []Entry{}}
	b, e := os.ReadFile(filepath.Join(root, "installed.json"))
	if e == nil {
		if e = json.Unmarshal(b, &m.entries); e != nil {
			return nil, e
		}
	} else if !os.IsNotExist(e) {
		return nil, e
	}
	for _, e := range m.entries {
		if !tokenID.MatchString(e.ID) {
			return nil, errors.New("Ungültiges Erweiterungsprofil")
		}
	}
	os.RemoveAll(filepath.Join(root, "pending"))
	return m, nil
}
func (m *Manager) save() error {
	b, e := json.MarshalIndent(m.entries, "", "  ")
	if e != nil {
		return e
	}
	p := filepath.Join(m.root, "installed.json")
	if e = os.WriteFile(p+".tmp", b, 0600); e != nil {
		return e
	}
	return os.Rename(p+".tmp", p)
}
func (m *Manager) load(e *Entry) error {
	id, err := m.engine("load", map[string]any{"id": e.ID, "path": filepath.Join(m.root, e.ID)})
	if err != nil {
		e.Error = err.Error()
		return err
	}
	e.RuntimeID = id
	e.Error = ""
	return nil
}
func (m *Manager) Restore() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.entries {
		if m.entries[i].Enabled {
			m.load(&m.entries[i])
		}
	}
}
func (m *Manager) List() []Entry {
	m.mu.Lock()
	defer m.mu.Unlock()
	entries := append([]Entry{}, m.entries...)
	for i := range entries {
		entries[i].Icon = packageIcon(filepath.Join(m.root, entries[i].ID))
	}
	return entries
}
func StoreID(input string) (string, error) {
	input = strings.TrimSpace(input)
	if validID.MatchString(input) {
		return input, nil
	}
	u, err := url.Parse(input)
	if err == nil && u.Scheme == "https" && (u.Host == "chromewebstore.google.com" || u.Host == "chrome.google.com") {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) > 1 && validID.MatchString(parts[len(parts)-1]) {
			return parts[len(parts)-1], nil
		}
	}
	return "", errors.New("Bitte einen Chrome-Web-Store-Link oder eine Erweiterungs-ID mit 32 Zeichen eingeben.")
}
func (m *Manager) PrepareStore(ctx context.Context, input string) (Entry, error) {
	id, e := StoreID(input)
	if e != nil {
		return Entry{}, e
	}
	q := url.Values{"response": {"redirect"}, "prodversion": {"140.0.0.0"}, "acceptformat": {"crx3"}, "x": {"id=" + id + "&uc"}}
	req, e := http.NewRequestWithContext(ctx, "GET", "https://clients2.google.com/service/update2/crx?"+q.Encode(), nil)
	if e != nil {
		return Entry{}, e
	}
	client := &http.Client{Timeout: 60 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 8 || req.URL.Scheme != "https" {
			return errors.New("Unsichere Download-Weiterleitung")
		}
		return nil
	}}
	r, e := client.Do(req)
	if e != nil {
		return Entry{}, e
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return Entry{}, fmt.Errorf("Chrome Web Store: Download nicht verfügbar (%d). ZIP oder CRX importieren.", r.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(r.Body, maxPackage+1))
	if e != nil {
		return Entry{}, e
	}
	if len(b) > maxPackage {
		return Entry{}, errors.New("Erweiterung ist zu groß")
	}
	payload, e := VerifyCRX(b, id)
	if e != nil {
		return Entry{}, e
	}
	return m.prepareWithKey(payload, verifiedKey(b))
}
func (m *Manager) PrepareFile(path string) (Entry, error) {
	f, e := os.Open(path)
	if e != nil {
		return Entry{}, e
	}
	defer f.Close()
	b, e := io.ReadAll(io.LimitReader(f, maxPackage+1))
	if e != nil {
		return Entry{}, e
	}
	if len(b) > maxPackage {
		return Entry{}, errors.New("Erweiterung ist zu groß")
	}
	var key []byte
	if bytes.HasPrefix(b, []byte("Cr24")) {
		original := b
		b, e = VerifyCRX(b, "")
		if e == nil {
			key = verifiedKey(original)
		}
		if e != nil {
			return Entry{}, e
		}
	}
	return m.prepareWithKey(b, key)
}
func (m *Manager) prepare(b []byte) (Entry, error) { return m.prepareWithKey(b, nil) }
func (m *Manager) prepareWithKey(b []byte, key []byte) (Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var nonce [16]byte
	if _, e := rand.Read(nonce[:]); e != nil {
		return Entry{}, e
	}
	id := hex.EncodeToString(nonce[:])
	dest := filepath.Join(m.root, "pending", id)
	if e := extract(b, dest); e != nil {
		os.RemoveAll(dest)
		return Entry{}, e
	}
	if len(key) > 0 {
		p := filepath.Join(dest, "manifest.json")
		data, err := os.ReadFile(p)
		var manifest map[string]any
		if err == nil {
			err = json.Unmarshal(data, &manifest)
			if err == nil && manifest == nil {
				err = errors.New("Ungültiges Erweiterungsmanifest")
			}
		}
		if err != nil {
			os.RemoveAll(dest)
			return Entry{}, err
		}
		manifest["key"] = base64.StdEncoding.EncodeToString(key)
		data, err = json.Marshal(manifest)
		if err == nil {
			err = os.WriteFile(p, data, 0600)
		}
		if err != nil {
			os.RemoveAll(dest)
			return Entry{}, err
		}
	}
	entry, e := readManifest(dest)
	if e != nil {
		os.RemoveAll(dest)
		return Entry{}, e
	}
	entry.ID = id
	m.pending[id] = entry
	entry.Icon = packageIcon(dest)
	return entry, nil
}
func (m *Manager) Cancel(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.pending[id]; !ok {
		return nil
	}
	delete(m.pending, id)
	return os.RemoveAll(filepath.Join(m.root, "pending", id))
}
func (m *Manager) Install(id string) (Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	entry, ok := m.pending[id]
	if !ok {
		return Entry{}, errors.New("Vorschau abgelaufen. Erweiterung erneut auswählen.")
	}
	dest := filepath.Join(m.root, id)
	if e := os.Rename(filepath.Join(m.root, "pending", id), dest); e != nil {
		return Entry{}, e
	}
	delete(m.pending, id)
	entry.Enabled = true
	if e := m.load(&entry); e != nil {
		os.RemoveAll(dest)
		return Entry{}, e
	}
	m.entries = append(m.entries, entry)
	if e := m.save(); e != nil {
		m.entries = m.entries[:len(m.entries)-1]
		m.engine("remove", map[string]any{"id": entry.ID, "runtimeID": entry.RuntimeID})
		os.RemoveAll(dest)
		return Entry{}, e
	}
	return entry, nil
}
func (m *Manager) Enable(id string, on bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i := range m.entries {
		e := &m.entries[i]
		if e.ID != id {
			continue
		}
		old := *e
		if on {
			if err := m.load(e); err != nil {
				return err
			}
		} else {
			if _, err := m.engine("unload", map[string]any{"id": id, "runtimeID": e.RuntimeID}); err != nil {
				return err
			}
		}
		e.Enabled = on
		e.Error = ""
		if err := m.save(); err != nil {
			*e = old
			if old.Enabled {
				m.load(e)
			} else {
				m.engine("unload", map[string]any{"id": id, "runtimeID": e.RuntimeID})
			}
			return err
		}
		return nil
	}
	return errors.New("Erweiterung nicht gefunden")
}
func (m *Manager) Remove(id string) error {
	if err := m.Enable(id, false); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, e := range m.entries {
		if e.ID == id {
			if _, err := m.engine("remove", map[string]any{"id": id, "runtimeID": e.RuntimeID}); err != nil {
				return err
			}
			old := append([]Entry{}, m.entries...)
			m.entries = append(m.entries[:i], m.entries[i+1:]...)
			if err := m.save(); err != nil {
				m.entries = old
				return err
			}
			return os.RemoveAll(filepath.Join(m.root, id))
		}
	}
	return nil
}
func (m *Manager) Open(id string, tab int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, e := range m.entries {
		if e.ID == id && e.Enabled && e.Error == "" {
			_, err := m.engine("open", map[string]any{"id": id, "runtimeID": e.RuntimeID, "path": filepath.Join(m.root, id), "tab": tab})
			return err
		}
	}
	return errors.New("Erweiterung ist nicht aktiv")
}
func extract(b []byte, dest string) error {
	z, e := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if e != nil {
		return errors.New("Keine gültige Erweiterungs-ZIP/CRX")
	}
	if len(z.File) > 10000 {
		return errors.New("Zu viele Dateien")
	}
	var size uint64
	for _, f := range z.File {
		name := f.Name
		if strings.ContainsAny(name, "\\:\x00") || !filepath.IsLocal(name) || f.Mode()&os.ModeSymlink != 0 || (!f.Mode().IsRegular() && !f.FileInfo().IsDir()) {
			return errors.New("Unsicherer Pfad im Erweiterungspaket")
		}
		size += f.UncompressedSize64
		if size > maxExpanded {
			return errors.New("Entpackte Erweiterung ist zu groß")
		}
		p := filepath.Join(dest, name)
		if f.FileInfo().IsDir() {
			if e = os.MkdirAll(p, 0700); e != nil {
				return e
			}
			continue
		}
		if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
			return e
		}
		r, e := f.Open()
		if e != nil {
			return e
		}
		w, e := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			r.Close()
			return e
		}
		n, err := io.Copy(w, io.LimitReader(r, int64(f.UncompressedSize64)+1))
		ce := w.Close()
		r.Close()
		if err != nil {
			return err
		}
		if ce != nil {
			return ce
		}
		if uint64(n) != f.UncompressedSize64 {
			return errors.New("Ungültige Dateigröße")
		}
	}
	return nil
}
func readManifest(dir string) (Entry, error) {
	b, e := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if e != nil {
		return Entry{}, errors.New("manifest.json muss direkt im ZIP liegen")
	}
	var v Manifest
	if e = json.Unmarshal(b, &v); e != nil {
		return Entry{}, e
	}
	if v.Name == "" || v.Version == "" || (v.ManifestVersion != 2 && v.ManifestVersion != 3) {
		return Entry{}, errors.New("Ungültiges WebExtension-Manifest (Version 2 oder 3 erforderlich)")
	}
	if strings.HasPrefix(v.Name, "__MSG_") && strings.HasSuffix(v.Name, "__") && regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(v.DefaultLocale) {
		var messages map[string]struct {
			Message string `json:"message"`
		}
		if data, e := os.ReadFile(filepath.Join(dir, "_locales", v.DefaultLocale, "messages.json")); e == nil && json.Unmarshal(data, &messages) == nil {
			if msg := messages[strings.TrimSuffix(strings.TrimPrefix(v.Name, "__MSG_"), "__")].Message; msg != "" {
				v.Name = msg
			}
		}
	}
	perms := map[string]bool{}
	for _, raw := range v.Permissions {
		var p string
		if json.Unmarshal(raw, &p) == nil {
			perms[p] = true
		} else {
			perms[string(raw)] = true
		}
	}
	for _, p := range v.Hosts {
		perms[p] = true
	}
	for _, c := range v.Content {
		for _, p := range c.Matches {
			perms[p] = true
		}
	}
	list := []string{}
	for p := range perms {
		list = append(list, p)
	}
	sort.Strings(list)
	return Entry{Name: v.Name, Version: v.Version, Permissions: list}, nil
}
