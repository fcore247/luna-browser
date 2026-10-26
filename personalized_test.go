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
