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

// StorePage contains plain text and locally decoded images only. Store HTML and
// scripts never execute in the trusted Luna UI.
type StorePage struct {
	ID          string   `json:"id"`
	URL         string   `json:"url"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	Screenshots []string `json:"screenshots"`
}

func (a *App) ExtensionStorePage(source string) (StorePage, error) {
	id, err := extensions.StoreID(source)
	if err != nil {
		return StorePage{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	address := "https://chromewebstore.google.com/detail/" + id
	data, err := storeResource(ctx, address, false, 4<<20)
	if err != nil {
		return StorePage{}, err
	}
	page, images, err := parseStorePage(data, id)
	if err != nil {
		return StorePage{}, err
	}
	page.URL = address
	all := append([]string{page.Icon}, images...)
	results := make([]string, len(all))
	var workers sync.WaitGroup
	slots := make(chan struct{}, 3)
	for i, address := range all {
		workers.Add(1)
		go func(i int, address string) {
			defer workers.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			if address == "" {
				return
			}
			image, e := storeResource(ctx, address, true, 2<<20)
			if e == nil {
				results[i] = extensions.ImageData(image)
			}
		}(i, address)
	}
	workers.Wait()
	page.Icon = results[0]
	page.Screenshots = []string{}
	for _, image := range results[1:] {
		if image != "" {
			page.Screenshots = append(page.Screenshots, image)
		}
	}
	return page, nil
}
func parseStorePage(data []byte, id string) (StorePage, []string, error) {
	page := StorePage{ID: id}
	doc, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		return page, nil, err
	}
	attrs := func(node *html.Node) map[string]string {
		values := map[string]string{}
		for _, attr := range node.Attr {
			values[attr.Key] = attr.Val
		}
		return values
	}
	var text func(*html.Node) string
	text = func(node *html.Node) string {
		if node.Type == html.TextNode {
			return node.Data
		}
		if node.Type == html.ElementNode && (node.Data == "script" || node.Data == "style") {
			return ""
		}
		var result strings.Builder
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			result.WriteString(text(child))
			if child.Data == "p" || child.Data == "br" || child.Data == "li" {
				result.WriteString("\n")
			}
		}
		return result.String()
	}
	images := []string{}
	seen := map[string]bool{}
	canonical := ""
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			a := attrs(node)
			if node.Data == "link" && a["rel"] == "canonical" {
				canonical = a["href"]
			}
			if node.Data == "meta" {
				switch a["property"] {
				case "og:title":
					page.Name = strings.TrimSpace(strings.TrimSuffix(a["content"], " - Chrome Web Store"))
				case "og:image":
					page.Icon = a["content"]
				case "og:description":
					page.Description = a["content"]
				}
			}
			if node.Data == "section" {
				for child := node.FirstChild; child != nil; child = child.NextSibling {
					heading := strings.TrimSpace(text(child))
					if heading == "Overview" || heading == "Übersicht" {
						description := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(text(node)), heading))
						if description != "" {
							page.Description = description
						}
						break
					}
				}
			}
			if address := a["data-media-url"]; address != "" && a["data-is-video"] == "false" && !seen[address] && len(images) < 6 {
				seen[address] = true
				if !strings.Contains(address, "=") {
					address += "=w1000"
				}
				images = append(images, address)
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	if canonical != "" {
		canonicalID, e := extensions.StoreID(canonical)
		if e != nil || canonicalID != id {
			return StorePage{}, nil, errors.New("Store-Seite stimmt nicht mit der Erweiterung überein")
		}
	}
	if page.Name == "" || page.Description == "" {
		return StorePage{}, nil, errors.New("Store-Details konnten nicht zuverlässig gelesen werden")
	}
	if len(page.Description) > 24000 {
		page.Description = page.Description[:24000]
	}
	return page, images, nil
}
