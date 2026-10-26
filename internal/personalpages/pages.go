// Package personalpages stores declarative, theme-bound page layouts. It never
// stores or executes agent-supplied HTML, CSS or JavaScript.
package personalpages

import (
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Field struct {
	Title    string `json:"title"`
	Selector string `json:"selector"`
	Kind     string `json:"kind"`
	Icon     string `json:"icon,omitempty"`
}
type Page struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Subtitle string  `json:"subtitle"`
	URL      string  `json:"url"`
	Scope    string  `json:"scope"`
	Enabled  bool    `json:"enabled"`
	Fields   []Field `json:"fields"`
}
type Manager struct {
	mu    sync.Mutex
	file  string
	pages []Page
}

func New(dir string) (*Manager, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	m := &Manager{file: filepath.Join(dir, "personalized-pages.json"), pages: []Page{}}
	data, err := os.ReadFile(m.file)
	if err == nil {
		err = json.Unmarshal(data, &m.pages)
	}
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	for _, page := range m.pages {
		if err := Validate(page); err != nil {
			return nil, err
		}
	}
	return m, nil
}
func Validate(page Page) error {
	u, err := url.Parse(page.URL)
	if err != nil || u.Hostname() == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil {
		return errors.New("Eine gültige HTTP(S)-Quellseite ist erforderlich")
	}
	if page.ID == "" || len(page.ID) > 80 || strings.ContainsAny(page.ID, "/\\") {
		return errors.New("Ungültige Seiten-ID")
	}
	if strings.TrimSpace(page.Title) == "" || len(page.Title) > 200 || len(page.Subtitle) > 1000 {
		return errors.New("Titel oder Untertitel ungültig")
	}
	if page.Scope != "path" && page.Scope != "site" {
		return errors.New("scope muss path oder site sein")
	}
	if len(page.Fields) == 0 || len(page.Fields) > 24 {
		return errors.New("Eine Ansicht braucht 1 bis 24 Felder")
	}
	for _, f := range page.Fields {
		if len(f.Title) > 150 || len(f.Icon) > 24 || f.Selector == "" || len(f.Selector) > 1000 {
			return errors.New("Feld oder Quellselektor ungültig")
		}
		if f.Kind != "metric" && f.Kind != "text" && f.Kind != "list" {
			return errors.New("Feldtyp muss metric, text oder list sein")
		}
	}
	return nil
}
func (m *Manager) List() []Page {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]Page{}, m.pages...)
	for i := range out {
		out[i].Fields = append([]Field{}, out[i].Fields...)
	}
	return out
}
func (m *Manager) change(apply func([]Page) ([]Page, error)) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	next, err := apply(append([]Page{}, m.pages...))
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return err
	}
	if err = os.WriteFile(m.file+".tmp", data, 0600); err != nil {
		return err
	}
	if err = os.Rename(m.file+".tmp", m.file); err != nil {
		return err
	}
	m.pages = next
	return nil
}
func (m *Manager) Save(page Page) error {
	if err := Validate(page); err != nil {
		return err
	}
	return m.change(func(pages []Page) ([]Page, error) {
		for i, p := range pages {
			if p.ID == page.ID {
				pages[i] = page
				return pages, nil
			}
		}
		if len(pages) >= 100 {
			return nil, errors.New("Maximal 100 personalisierte Seiten")
		}
		return append(pages, page), nil
	})
}
func (m *Manager) Remove(id string) error {
	return m.change(func(pages []Page) ([]Page, error) {
		for i, p := range pages {
			if p.ID == id {
				return append(pages[:i], pages[i+1:]...), nil
			}
		}
		return nil, errors.New("Seite nicht gefunden")
	})
}
func (m *Manager) Enable(id string, enabled bool) error {
	return m.change(func(pages []Page) ([]Page, error) {
		for i, p := range pages {
			if p.ID == id {
				pages[i].Enabled = enabled
				return pages, nil
			}
		}
		return nil, errors.New("Seite nicht gefunden")
	})
}
