package pagemonitor

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestBrowserLoginResumeAfterRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "watches.json")
	notices := 0
	m, _ := New(path, func(Watch) { notices++ })
	w, e := m.AddSource("https://example.com/private", 1, "browser", "#account-content")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = m.AddSource(w.URL, 1, "browser", ""); e == nil {
		t.Fatal("login-only region must be required")
	}
	text := "Account: old"
	waiting := false
	reader := func(context.Context, Watch) (string, error) {
		if waiting {
			return "", errors.New("Warte auf Anmeldung")
		}
		return text, nil
	}
	m.BrowserRead = reader
	check := func(manager *Manager) {
		manager.mu.Lock()
		manager.watches[0].Checked = time.Time{}
		manager.mu.Unlock()
		manager.check(context.Background())
	}
	check(m)
	baseline := m.List()[0].Hash
	waiting = true
	check(m)
	if m.List()[0].Hash != baseline || notices != 0 {
		t.Fatal("login screen replaced baseline")
	}
	m, e = New(path, func(Watch) { notices++ })
	if e != nil {
		t.Fatal(e)
	}
	m.BrowserRead = reader
	if m.List()[0].Selector != "#account-content" || m.List()[0].Source != "browser" {
		t.Fatal("task configuration not restored")
	}
	check(m)
	if notices != 0 {
		t.Fatal("closed/logged-out page notified")
	}
	waiting = false
	text = "Account: new"
	check(m)
	if notices != 1 || m.List()[0].Error != "" {
		t.Fatal("login after restart did not resume")
	}
	check(m)
	if notices != 1 {
		t.Fatal("duplicate change notification")
	}
}

func TestRefreshAndIntervalPersistWithoutResettingBaseline(t *testing.T) {
	path := filepath.Join(t.TempDir(), "watches.json")
	m, _ := New(path, nil)
	w, err := m.AddSource("https://example.com/private", 5, "browser", "#private")
	if err != nil || !w.RefreshEnabled() {
		t.Fatal("browser watches must reload by default", err)
	}
	m.BrowserRead = func(context.Context, Watch) (string, error) { return "initial server content", nil }
	m.check(context.Background())
	baseline := m.List()[0].Hash
	if _, err = m.Edit(w.ID, 2, false); err != nil {
		t.Fatal(err)
	}
	restored, err := New(path, nil)
	if err != nil {
		t.Fatal(err)
	}
	w = restored.List()[0]
	if w.RefreshEnabled() || w.Interval != 2 || w.Hash != baseline {
		t.Fatal("configuration or baseline was lost after restart")
	}
	if _, err = restored.Edit(w.ID, 0, true); err == nil {
		t.Fatal("invalid interval accepted")
	}
	if _, err = restored.Update(w.ID, "check"); err != nil {
		t.Fatal(err)
	}
	if !restored.List()[0].Checked.IsZero() {
		t.Fatal("check was not scheduled")
	}
	if _, err = restored.Update(w.ID, "pause"); err != nil {
		t.Fatal(err)
	}
	if _, err = restored.Update(w.ID, "check"); err == nil {
		t.Fatal("paused task scheduled")
	}
	if (Watch{Source: "public"}).RefreshEnabled() {
		t.Fatal("public fetch must not reload a browser tab")
	}
}
