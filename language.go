package main

import (
	"browser-mac/internal/web"
	_ "embed"
	"encoding/json"
	"os"
	"path/filepath"
)

// The frontend and native shell share one translation catalogue.
//
//go:embed frontend/src/locales/en.json
var englishMessages []byte

var englishLabels = func() map[string]string {
	var labels map[string]string
	_ = json.Unmarshal(englishMessages, &labels)
	return labels
}()

func (a *App) englishUI() bool {
	if a.st != nil {
		return a.st.Prefs()["englishUI"]
	}
	// Wails constructs the initial menu before startup opens the store.
	dir, err := userProfileRoot()
	if err != nil {
		return false
	}
	data, err := os.ReadFile(filepath.Join(dir, "prefs.json"))
	if err != nil {
		return false
	}
	var prefs map[string]bool
	_ = json.Unmarshal(data, &prefs)
	return prefs["englishUI"]
}

func (a *App) label(german string) string {
	if a.englishUI() {
		if english, ok := englishLabels[german]; ok {
			return english
		}
	}
	return german
}

func (a *App) applyNativeLanguage() {
	translations := "{}"
	if a.englishUI() {
		translations = string(englishMessages)
	}
	web.SetLanguage(translations)
}
