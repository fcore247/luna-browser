package main

import (
	"browser-mac/internal/secret"
	"browser-mac/internal/store"
	"testing"
)

func TestSearchProviderPersistenceAndSeparateKeys(t *testing.T) {
	dir := t.TempDir()
	s, err := store.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	a := &App{st: s, secrets: secret.New(dir)}
	if !a.Prefs()["tavilySearch"] {
		t.Fatal("new profile should recommend Tavily")
	}
	if err := a.SearchKeySet("tvly-test"); err != nil {
		t.Fatal(err)
	}
	s.SetPref("tavilySearch", false)
	if a.SearchKeyStatus() {
		t.Fatal("Tavily key must not be used for Brave")
	}
	if err := a.SearchKeySet("brave-test"); err != nil {
		t.Fatal(err)
	}
	s.SetPref("tavilySearch", true)
	if !a.SearchKeyStatus() {
		t.Fatal("Tavily key lost")
	}
	reopened, _ := store.New(dir)
	a.st = reopened
	if !a.useTavily() {
		t.Fatal("provider preference lost after restart")
	}
	value, _, _ := a.secrets.Get(tavilyKeyFile)
	if value != "tvly-test" {
		t.Fatal("wrong Tavily key")
	}
	if err := a.SearchKeyClear(); err != nil {
		t.Fatal(err)
	}
	value, _, _ = a.secrets.Get(keyFile)
	if value != "brave-test" {
		t.Fatal("clearing Tavily key removed Brave key")
	}
}
