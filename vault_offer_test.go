package main

import (
	"bytes"
	"strings"
	"testing"

	"browser-mac/internal/store"
	"browser-mac/internal/vault"
)

func TestStaleSaveAndDismissCannotChangeReplacementOffer(t *testing.T) {
	dir := t.TempDir()
	st, err := store.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	v, err := vault.New(dir, func() ([]byte, error) { return bytes.Repeat([]byte{4}, 32), nil })
	if err != nil {
		t.Fatal(err)
	}
	app := &App{st: st, out: make(chan [2]string, 8)}
	app.vaultData.vault = v
	app.vaultData.offers = map[int]vaultOffer{}
	const origin = "https://account.example.test"
	app.onCredential(9, origin, "old", "synthetic-old")
	old := app.vaultData.offers[9].ID
	app.onCredential(9, origin, "new", "synthetic-new")
	current := app.vaultData.offers[9].ID
	if old == "" || current == old {
		t.Fatal("replacement offer reused its id")
	}
	app.VaultDismissOffer(9, old)
	if _, err := app.VaultSaveOffer(9, old, true); err == nil {
		t.Fatal("stale confirmation saved a new account")
	}
	if _, err := app.VaultSaveOffer(10, current, true); err == nil {
		t.Fatal("saved an offer from another tab")
	}
	entry, err := app.VaultSaveOffer(9, current, true)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Origin != origin || entry.Username != "new" || !entry.AutoLogin || len(v.All()) != 1 {
		t.Fatalf("unexpected saved entry: %+v", entry)
	}
	app.onCredential(9, origin, "new", "synthetic-new")
	if _, ok := app.vaultData.offers[9]; ok {
		t.Fatal("unchanged credential created another save offer")
	}
	for len(app.out) > 0 {
		event := <-app.out
		if strings.Contains(event[1], "synthetic-") {
			t.Fatal("credential leaked in a UI event")
		}
	}
}
