package main

import (
	"browser-mac/internal/extensions"
	"context"
	"errors"
	"golang.org/x/net/html"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

var storeMetadata sync.Map

// ExtensionStoreLookup binds metadata to an extension ID, independently of SPA loading.
func (a *App) ExtensionStoreLookup(source string) (map[string]string, error) {
	id, err := extensions.StoreID(source)
	if err != nil {
		return nil, err
	}
	if cached, ok := storeMetadata.Load(id); ok {
		return cached.(map[string]string), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	source = "https://chromewebstore.google.com/detail/" + id
	data, err := storeResource(ctx, source, false, 4<<20)
	if err != nil {
		return nil, err
	}
	info := map[string]string{"url": source, "id": id}
	tokenizer := html.NewTokenizer(strings.NewReader(string(data)))
	for {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			break
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			continue
		}
		token := tokenizer.Token()
		if token.Data != "meta" {
			continue
		}
		attrs := map[string]string{}
		for _, v := range token.Attr {
			attrs[v.Key] = v.Val
		}
		switch attrs["property"] {
		case "og:title":
			info["name"] = strings.TrimSpace(strings.TrimSuffix(attrs["content"], " - Chrome Web Store"))
		case "og:image":
			info["icon"] = attrs["content"]
		}
	}
	if info["icon"] != "" {
		image, e := storeResource(ctx, info["icon"], true, 2<<20)
		if e == nil {
			info["icon"] = extensions.ImageData(image)
		} else {
			info["icon"] = ""
		}
	}
	if info["name"] != "" && info["icon"] != "" {
		storeMetadata.Store(id, info)
	}
	return info, nil
}
func storeResource(ctx context.Context, address string, image bool, limit int64) ([]byte, error) {
	allowed := func(address string) bool {
		u, e := url.Parse(address)
		if e != nil || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
			return false
		}
		if image {
			return strings.HasSuffix(u.Hostname(), ".googleusercontent.com")
		}
		return u.Hostname() == "chromewebstore.google.com"
	}
	if !allowed(address) {
		return nil, errors.New("Ungültige Store-Ressource")
	}
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 5 || !allowed(req.URL.String()) {
			return errors.New("Ungültige Store-Weiterleitung")
		}
		return nil
	}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Language", "de,en;q=0.8")
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("Store-Ressource nicht verfügbar")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if int64(len(data)) > limit {
		return nil, errors.New("Store-Ressource zu groß")
	}
	return data, err
}
