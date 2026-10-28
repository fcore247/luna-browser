package main

import (
	"browser-mac/internal/store"
	"testing"
)

func TestLanguagePersistsAndSwitchesBothWays(t *testing.T) {
	dir := t.TempDir()
	s, err := store.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	a := &App{st: s}
	if got := a.label("Einstellungen"); got != "Einstellungen" {
		t.Fatal(got)
	}
	s.SetPref("englishUI", true)
	reopened, err := store.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	a.st = reopened
	if got := a.label("Einstellungen"); got != "Settings" {
		t.Fatal(got)
	}
	if got := a.label("Lesezeichen"); got != "Bookmarks" {
		t.Fatal(got)
	}
	reopened.SetPref("englishUI", false)
	if got := a.label("Einstellungen"); got != "Einstellungen" {
		t.Fatal(got)
	}
}
