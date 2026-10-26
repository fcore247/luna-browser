package main

import (
	"browser-mac/internal/personalpages"
	"testing"
)

func TestPersonalizedRecipesRejectExecutableContent(t *testing.T) {
	manager, err := personalpages.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	app := &App{personalized: manager}
	payload := `{"id":"weather","title":"Wetter","url":"https://example.org/","scope":"path","enabled":true,"fields":[{"title":"Temperatur","selector":"#temperature","kind":"metric"}],"html":"<script>alert(1)</script>"}`
	if app.PersonalizedSave(payload) == nil {
		t.Fatal("agent HTML accepted")
	}
	if len(app.PersonalizedPages()) != 0 {
		t.Fatal("invalid recipe persisted")
	}
}

func TestFormatActualSourceValues(t *testing.T) {
	for _, tc := range []struct {
		raw    string
		format *personalpages.Format
		want   string
	}{
		{"SW 3 Böen 36 km/h", &personalpages.Format{Pattern: `Böen\s+(\d+)`, Group: 1, Unit: "km/h"}, "36 km/h"},
		{"SW 3 Böen 36 km/h", &personalpages.Format{Pattern: `^([A-Z]+)`, Group: 1}, "SW"},
		{"Keine Angaben", &personalpages.Format{Pattern: `Böen\s+(\d+)`, Group: 1}, ""},
	} {
		if got := formatSourceText(tc.raw, tc.format); got != tc.want {
			t.Fatalf("got %q want %q", got, tc.want)
		}
	}
}
