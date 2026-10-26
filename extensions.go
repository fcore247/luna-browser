package main

import (
	"browser-mac/internal/extensions"
	"browser-mac/internal/web"
	"context"
	"errors"
	wr "github.com/wailsapp/wails/v2/pkg/runtime"
	"path/filepath"
	"time"
)

func (a *App) ExtensionsStatus() map[string]any {
	_, err := web.Extension("supported", nil)
	message := "Chrome-Web-Store-Link einfügen oder ZIP/CRX importieren. Nicht jede Chrome-API ist auf beiden Plattformen verfügbar."
	if err != nil {
		message = err.Error()
	}
	entries := []extensions.Entry{}
	if a.extensions != nil {
		entries = a.extensions.List()
	}
	return map[string]any{"supported": err == nil, "message": message, "entries": entries}
}
func (a *App) ExtensionPrepare(source string) (extensions.Entry, error) {
	if a.extensions == nil {
		return extensions.Entry{}, errors.New("Erweiterungsspeicher nicht verfügbar")
	}
	if _, err := web.Extension("supported", nil); err != nil {
		return extensions.Entry{}, err
	}
	if source == "" {
		p, err := wr.OpenFileDialog(a.ctx, wr.OpenDialogOptions{Title: "Chrome-Erweiterung importieren", Filters: []wr.FileFilter{{DisplayName: "Erweiterung (ZIP oder CRX3)", Pattern: "*.zip;*.crx"}}})
		if err != nil {
			return extensions.Entry{}, err
		}
		if p == "" {
			return extensions.Entry{}, nil
		}
		return a.extensions.PrepareFile(p)
	}
	ctx, cancel := context.WithTimeout(a.ctx, 65*time.Second)
	defer cancel()
	return a.extensions.PrepareStore(ctx, source)
}
func (a *App) ExtensionInstall(id string) (extensions.Entry, error) {
	if a.extensions == nil {
		return extensions.Entry{}, errors.New("Erweiterungsspeicher nicht verfügbar")
	}
	return a.extensions.Install(id)
}
func (a *App) ExtensionCancel(id string) error {
	if a.extensions == nil {
		return errors.New("Erweiterungsspeicher nicht verfügbar")
	}
	return a.extensions.Cancel(id)
}
func (a *App) ExtensionEnable(id string, on bool) error {
	if a.extensions == nil {
		return errors.New("Erweiterungsspeicher nicht verfügbar")
	}
	return a.extensions.Enable(id, on)
}
func (a *App) ExtensionRemove(id string) error {
	if a.extensions == nil {
		return errors.New("Erweiterungsspeicher nicht verfügbar")
	}
	return a.extensions.Remove(id)
}
func (a *App) ExtensionOpen(id string, tab int) error {
	if a.extensions == nil {
		return errors.New("Erweiterungsspeicher nicht verfügbar")
	}
	return a.extensions.Open(id, tab)
}
func (a *App) initExtensions(dir string) {
	manager, err := extensions.New(filepath.Join(dir, "browser-mac", "extensions"), web.Extension)
	if err != nil {
		return
	}
	a.extensions = manager
	go manager.Restore()
}
