package personalpages

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestPersistenceManagementAndValidation(t *testing.T) {
	dir := t.TempDir()
	m, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	page := Page{ID: "weather", Title: "Mein Wetter", URL: "https://www.example.org/weather", Scope: "path", Enabled: true, Fields: []Field{{Title: "Temperatur", Selector: "#temperature", Kind: "metric"}}}
	if err = m.Save(page); err != nil {
		t.Fatal(err)
	}
	m, err = New(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.List()) != 1 || m.List()[0].Title != page.Title {
		t.Fatal("recipe not restored")
	}
	if err = m.Enable(page.ID, false); err != nil || m.List()[0].Enabled {
		t.Fatal("disable failed", err)
	}
	invalid := page
	invalid.URL = "javascript:alert(1)"
	if m.Save(invalid) == nil {
		t.Fatal("non-website accepted")
	}
	invalid = page
	invalid.Fields = []Field{{Title: "bad", Selector: "body", Kind: "script"}}
	if m.Save(invalid) == nil {
		t.Fatal("code widget accepted")
	}
	if len(m.List()) != 1 {
		t.Fatal("failed save changed data")
	}
	if err = m.Remove(page.ID); err != nil || len(m.List()) != 0 {
		t.Fatal("remove failed", err)
	}
}

func TestExpandedBuilderPersistsAndRejectsInvalidOptions(t *testing.T) {
	m, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	page := Page{ID: "builder", Title: "Mein Überblick", URL: "https://example.org", Scope: "site", Enabled: true}
	for _, kind := range []string{"metric", "text", "list", "heading", "divider", "notice", "badge", "progress", "gauge", "bars", "line", "table", "timeline", "image", "link", "accordion"} {
		field := Field{Title: kind, Kind: kind, Selector: "#source", Width: "wide", Group: "Heute", Tone: "neutral", Max: 100, Limit: 10, FirstRowHeader: true}
		if kind == "heading" || kind == "divider" {
			field.Selector = ""
		}
		page.Fields = append(page.Fields, field)
	}
	if err = m.Save(page); err != nil {
		t.Fatal(err)
	}
	reloaded, err := New(filepath.Dir(m.file))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(page, reloaded.List()[0]) {
		t.Fatal("builder configuration changed on reload")
	}
	for _, field := range []Field{{Kind: "html", Selector: "#x"}, {Kind: "metric"}, {Kind: "progress", Selector: "#x", Max: -1}, {Kind: "text", Selector: "#x", Width: "script"}, {Kind: "badge", Selector: "#x", Tone: "invented"}, {Kind: "list", Selector: "#x", Limit: 51}} {
		invalid := page
		invalid.Fields = []Field{field}
		if err = m.Save(invalid); err == nil {
			t.Fatalf("invalid field accepted: %+v", field)
		}
	}
}

func TestRepeatedMultipleSourcesAndFormattingValidation(t *testing.T) {
	page := Page{ID: "forecast", Title: "Wetter", URL: "https://example.org/", Scope: "path", Sources: []Source{{ID: "forecast", URL: "https://example.org/14-tage"}}, Fields: []Field{{Title: "Tage", Kind: "cards", Selector: ".day", Source: "forecast", Columns: []Column{{Title: "Min", Selector: ".min", Format: &Format{Pattern: `(\d+)`, Group: 1, Unit: "°C"}}}, Thresholds: []Threshold{{Op: "gt", Value: 30, Tone: "warning"}}}}}
	if err := Validate(page); err != nil {
		t.Fatal(err)
	}
	for _, format := range []*Format{{Attribute: "onclick"}, {Pattern: "("}, {Pattern: "x", Group: 2}, {Pattern: `(?=x)`}} {
		bad := page
		bad.Fields = append([]Field{}, page.Fields...)
		bad.Fields[0].Format = format
		if Validate(bad) == nil {
			t.Fatal("unsupported format accepted")
		}
	}
	bad := page
	bad.Sources = nil
	if Validate(bad) == nil {
		t.Fatal("unknown source accepted")
	}
}

func TestActivateWhenKeepsLoginPagesUsable(t *testing.T) {
	dir := t.TempDir()
	m, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	page := Page{ID: "schule", Title: "Schule", URL: "https://schule.example.org/start", Scope: "site", Enabled: true, ActivateWhen: "a[href*='logout']", Fields: []Field{{Title: "Stundenplan", Selector: "#plan", Kind: "text"}}}
	if err = m.Save(page); err != nil {
		t.Fatal(err)
	}
	if m, err = New(dir); err != nil || m.List()[0].ActivateWhen != "a[href*='logout']" {
		t.Fatal("activate_when not restored", err)
	}
	for _, bad := range []string{"   ", string(make([]byte, 1001))} {
		page.ActivateWhen = bad
		if err := Validate(page); err == nil {
			t.Fatalf("activate_when %q should be rejected", bad)
		}
	}
	page.ActivateWhen = ""
	if err := Validate(page); err != nil {
		t.Fatal("pages without activate_when stay valid", err)
	}
}

func TestInteractiveRowsAndDetailValidation(t *testing.T) {
	page := Page{ID: "mail", Title: "Post", URL: "https://mail.example.org/inbox", Scope: "path", Enabled: true,
		Fields: []Field{{Title: "Eingang", Selector: ".row", Kind: "list", Open: &Open{Target: "a.subject"}}},
		Detail: &Detail{When: ".open-mail", Title: "Nachricht", Fields: []Field{{Title: "Betreff", Selector: ".subject", Kind: "metric"}, {Title: "Text", Selector: ".body", Kind: "text"}}}}
	if err := Validate(page); err != nil {
		t.Fatal("a valid interactive page was rejected:", err)
	}
	cases := map[string]func(p *Page){
		"open on a metric":             func(p *Page) { p.Fields[0].Kind = "metric" },
		"open on a table without cols": func(p *Page) { p.Fields[0].Kind = "table" },
		"open on another source":       func(p *Page) { p.Sources = []Source{{ID: "s", URL: "https://x.example.org"}}; p.Fields[0].Source = "s" },
		"too long target":              func(p *Page) { p.Fields[0].Open.Target = string(make([]byte, 1001)) },
		"detail without when":          func(p *Page) { p.Detail.When = " " },
		"detail without fields":        func(p *Page) { p.Detail.Fields = nil },
		"nested open in detail":        func(p *Page) { p.Detail.Fields[0].Kind = "list"; p.Detail.Fields[0].Open = &Open{} },
		"detail from another source":   func(p *Page) { p.Detail.Fields[0].Source = "s" },
		"invalid detail field":         func(p *Page) { p.Detail.Fields[0].Kind = "script" },
	}
	for name, mutate := range cases {
		copy := page
		copy.Fields = append([]Field{}, page.Fields...)
		copy.Fields[0].Open = &Open{Target: "a.subject"}
		detail := *page.Detail
		detail.Fields = append([]Field{}, page.Detail.Fields...)
		copy.Detail = &detail
		mutate(&copy)
		if err := Validate(copy); err == nil {
			t.Errorf("%s should be rejected", name)
		}
	}
	table := page
	table.Fields = []Field{{Title: "Eingang", Selector: "tr", Kind: "table", Columns: []Column{{Title: "Betreff", Selector: ".s"}}, Open: &Open{}}}
	if err := Validate(table); err != nil {
		t.Fatal("a table with columns can be opened:", err)
	}
}
