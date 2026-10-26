// Package personalpages stores declarative, theme-bound page layouts. It never
// stores or executes agent-supplied HTML, CSS or JavaScript.
package personalpages

import (
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

type Source struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}
type Format struct {
	Attribute string `json:"attribute,omitempty"`
	Pattern   string `json:"pattern,omitempty"`
	Group     int    `json:"group,omitempty"`
	Unit      string `json:"unit,omitempty"`
}
type Threshold struct {
	Op    string  `json:"op"`
	Value float64 `json:"value"`
	Tone  string  `json:"tone"`
}
type Column struct {
	Title    string  `json:"title"`
	Selector string  `json:"selector"`
	Format   *Format `json:"format,omitempty"`
}
type Field struct {
	Title          string      `json:"title"`
	Selector       string      `json:"selector"`
	Kind           string      `json:"kind"`
	Icon           string      `json:"icon,omitempty"`
	Width          string      `json:"width,omitempty"`
	Group          string      `json:"group,omitempty"`
	Tone           string      `json:"tone,omitempty"`
	Max            float64     `json:"max,omitempty"`
	Limit          int         `json:"limit,omitempty"`
	Source         string      `json:"source,omitempty"`
	Format         *Format     `json:"format,omitempty"`
	Columns        []Column    `json:"columns,omitempty"`
	Thresholds     []Threshold `json:"thresholds,omitempty"`
	FirstRowHeader bool        `json:"firstRowHeader,omitempty"`
	// Open makes the rows of a repeated block clickable: clicking a row in the Luna view clicks that
	// row (or Target inside it) on the source page, and the page's Detail view shows what opened.
	Open *Open `json:"open,omitempty"`
}

// Open is the click binding of a repeated block.
type Open struct {
	Target string `json:"target,omitempty"`
}

// Detail is shown instead of the normal fields while the source page shows an opened item
// (for example one mail). When is a selector that exists only while an item is open.
type Detail struct {
	When   string  `json:"when"`
	Title  string  `json:"title,omitempty"`
	Fields []Field `json:"fields"`
}
type Page struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Subtitle string   `json:"subtitle"`
	URL      string   `json:"url"`
	Scope    string   `json:"scope"`
	Enabled  bool     `json:"enabled"`
	Fields   []Field  `json:"fields"`
	Sources  []Source `json:"sources,omitempty"`
	// ActivateWhen is a CSS selector that exists on the source page only while the user is logged in.
	// Until it appears Luna keeps showing the original page, so the login form stays usable.
	ActivateWhen string  `json:"activate_when,omitempty"`
	Detail       *Detail `json:"detail,omitempty"`
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
	if len(page.ActivateWhen) > 1000 || (page.ActivateWhen != "" && strings.TrimSpace(page.ActivateWhen) == "") {
		return errors.New("activate_when muss ein CSS-Selektor mit höchstens 1000 Zeichen sein")
	}
	if len(page.Fields) == 0 || len(page.Fields) > 60 {
		return errors.New("Eine Ansicht braucht 1 bis 60 Bausteine")
	}
	sources := map[string]bool{"": true}
	if len(page.Sources) > 8 {
		return errors.New("Maximal 8 zusätzliche Quellen")
	}
	for _, source := range page.Sources {
		u, err := url.Parse(source.URL)
		if source.ID == "" || len(source.ID) > 80 || sources[source.ID] || err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
			return errors.New("Ungültige oder doppelte Quelle")
		}
		sources[source.ID] = true
	}
	for _, f := range page.Fields {
		if err := validateField(f, sources, true); err != nil {
			return err
		}
	}
	if page.Detail != nil {
		d := page.Detail
		if strings.TrimSpace(d.When) == "" || len(d.When) > 1000 || len(d.Title) > 150 {
			return errors.New("detail braucht when (CSS-Selektor) und einen kurzen Titel")
		}
		if len(d.Fields) == 0 || len(d.Fields) > 30 {
			return errors.New("Die Detailansicht braucht 1 bis 30 Bausteine")
		}
		for _, f := range d.Fields {
			if f.Source != "" {
				return errors.New("Die Detailansicht liest nur aus der Hauptquelle")
			}
			if err := validateField(f, map[string]bool{"": true}, false); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateField(f Field, sources map[string]bool, allowOpen bool) error {
	{
		if !sources[f.Source] {
			return errors.New("Unbekannte Quelle für Baustein: " + f.Title)
		}
		if err := validateFormat(f.Format); err != nil {
			return err
		}
		if len(f.Columns) > 12 || len(f.Thresholds) > 6 {
			return errors.New("Zu viele Spalten oder Schwellenwerte")
		}
		for _, column := range f.Columns {
			if len(column.Title) > 150 || column.Selector == "" || len(column.Selector) > 1000 {
				return errors.New("Ungültige Spalte")
			}
			if err := validateFormat(column.Format); err != nil {
				return err
			}
		}
		for _, threshold := range f.Thresholds {
			if (threshold.Op != "gt" && threshold.Op != "gte" && threshold.Op != "lt" && threshold.Op != "lte") || (threshold.Tone != "positive" && threshold.Tone != "warning" && threshold.Tone != "critical") || math.IsNaN(threshold.Value) || math.IsInf(threshold.Value, 0) {
				return errors.New("Ungültiger Schwellenwert")
			}
		}

		if len(f.Title) > 150 || len(f.Icon) > 24 || (f.Selector == "" && f.Kind != "heading" && f.Kind != "divider") || len(f.Selector) > 1000 {
			return errors.New("Feld oder Quellselektor ungültig")
		}
		switch f.Kind {
		case "metric", "text", "list", "heading", "divider", "notice", "badge", "progress", "gauge", "bars", "line", "table", "timeline", "image", "link", "accordion", "hero", "cards", "grid":
		default:
			return errors.New("Unbekannter Bausteintyp")
		}
		if (f.Width != "" && f.Width != "normal" && f.Width != "wide" && f.Width != "full") || len(f.Group) > 80 {
			return errors.New("Ungültige Bausteinbreite oder Tabgruppe")
		}
		if f.Tone != "" && f.Tone != "neutral" && f.Tone != "positive" && f.Tone != "warning" && f.Tone != "critical" {
			return errors.New("Ungültiger Statusstil")
		}
		if math.IsNaN(f.Max) || math.IsInf(f.Max, 0) || f.Max < 0 || f.Max > 1e12 || f.Limit < 0 || f.Limit > 50 {
			return errors.New("Ungültige Skala oder Anzahl")
		}
		if f.Open != nil {
			if !allowOpen {
				return errors.New("Die Detailansicht kann keine weiteren Zeilen öffnen")
			}
			if f.Source != "" {
				return errors.New("open geht nur bei Bausteinen der Hauptquelle")
			}
			if len(f.Open.Target) > 1000 {
				return errors.New("Ungültiges Klickziel")
			}
			switch f.Kind {
			case "list", "timeline", "cards", "grid":
			case "table":
				if len(f.Columns) == 0 {
					return errors.New("Eine klickbare Tabelle braucht Spalten (columns)")
				}
			default:
				return errors.New("open geht nur bei list, timeline, table, cards und grid")
			}
		}
	}
	return nil
}
func (m *Manager) List() []Page {
	m.mu.Lock()
	defer m.mu.Unlock()
	raw, _ := json.Marshal(m.pages)
	out := []Page{}
	_ = json.Unmarshal(raw, &out)
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

func validateFormat(f *Format) error {
	if f == nil {
		return nil
	}
	switch f.Attribute {
	case "", "text", "alt", "title", "aria-label":
	default:
		return errors.New("Nicht unterstütztes Quellattribut")
	}
	if len(f.Pattern) > 300 || f.Group < 0 || f.Group > 12 || len(f.Unit) > 40 {
		return errors.New("Ungültiges Textformat")
	}
	if f.Pattern != "" {
		compiled, err := regexp.Compile(f.Pattern)
		if err != nil {
			return errors.New("Ungültiges Extraktionsmuster: " + err.Error())
		}
		if f.Group > compiled.NumSubexp() {
			return errors.New("Extraktionsgruppe existiert nicht")
		}
	}
	return nil
}
