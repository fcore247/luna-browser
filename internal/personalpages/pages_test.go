package personalpages

import "testing"

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
