package main

import (
	"browser-mac/internal/extensions"
	"browser-mac/internal/web"
	"context"
	"encoding/json"
	"errors"
	wr "github.com/wailsapp/wails/v2/pkg/runtime"
	"net/url"
	"path/filepath"
	"strings"
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

// ExtensionStoreDetails reads display metadata only on an actual store detail page.
// This never downloads or installs a package.
func (a *App) ExtensionStoreDetails(tab int) (map[string]string, error) {
	raw, err := web.Evaluate(tab, extensionStoreDetailsScript)
	if err != nil {
		return nil, err
	}
	result := map[string]string{}
	if err = json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, err
	}
	if result["url"] == "" {
		return map[string]string{}, nil
	}
	id, err := extensions.StoreID(result["url"])
	if err != nil {
		return map[string]string{}, nil
	}
	result["id"] = id
	if len(result["name"]) > 512 {
		result["name"] = result["name"][:512]
	}
	icon, parseErr := url.Parse(result["icon"])
	if parseErr != nil || icon.Scheme != "https" || icon.User != nil || !(icon.Hostname() == "lh3.googleusercontent.com" || strings.HasSuffix(icon.Hostname(), ".googleusercontent.com")) || (icon.Port() != "" && icon.Port() != "443") {
		result["icon"] = ""
	}
	return result, nil
}

const extensionStoreDetailsScript = `(function(){
 const u=new URL(location.href);
 if(u.protocol!=='https:'||u.host!=='chromewebstore.google.com'||!/^\/detail\/(?:[^/]+\/)?[a-p]{32}\/?$/.test(u.pathname))return '{}';
 const canonical=document.querySelector('link[rel="canonical"]')?.href;
 if(canonical){try{const currentID=u.pathname.match(/([a-p]{32})\/?$/)?.[1];const canonicalID=new URL(canonical).pathname.match(/([a-p]{32})\/?$/)?.[1];if(canonicalID!==currentID)return '{}';}catch{return '{}';}}
 const heading=document.querySelector('h1');
 if(!heading)return '{}';
 const name=heading.textContent.trim().slice(0,256);
 const title=document.title.replace(/\s*[-–|]\s*Chrome Web Store.*$/i,'').trim();
 if(!name||name.toLowerCase()!==title.toLowerCase())return '{}';
 const images=[...document.images];
 const image=images.find(i=>/item logo image|symbolbild|logo.*(?:extension|erweiterung)/i.test(i.alt))||images.find(i=>i.alt===name)||images.find(i=>i.closest('section,header')?.contains(heading)&&/googleusercontent\.com/.test(i.src));
 const icon=image?.src||document.querySelector('meta[property="og:image"]')?.content||'';
 return JSON.stringify({url:location.href,name,icon});
})()`
