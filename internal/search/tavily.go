package search

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Tavily uses the same sanitized result contract as the existing Luna renderer.
// Keys stay in the backend and are sent only in the Authorization header.
type TavilyClient struct {
	Key      func() (string, error)
	Endpoint string
	HTTP     *http.Client
}

func NewTavilyClient(key func() (string, error)) *TavilyClient {
	return &TavilyClient{Key: key, Endpoint: "https://api.tavily.com/search", HTTP: &http.Client{Timeout: 12 * time.Second}}
}

func (c *TavilyClient) Search(ctx context.Context, query, language string) (*Page, error) {
	key, err := c.Key()
	if err != nil {
		return nil, errors.New("Der Tavily-Schlüssel konnte nicht gelesen werden.")
	}
	if key == "" {
		return nil, errors.New("Kein Tavily-API-Schlüssel hinterlegt. Öffne die Sucheinstellungen.")
	}
	if language != "en" {
		language = "de"
	}
	// Explicit basic depth avoids auto-selection of more expensive advanced search.
	payload, _ := json.Marshal(map[string]any{
		"query": query, "search_depth": "basic", "auto_parameters": false,
		"max_results": 20, "topic": "general", "language": language,
		"include_answer": false, "include_raw_content": false,
		"include_images": false, "include_favicon": true, "safe_search": true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	started := time.Now()
	response, err := c.HTTP.Do(req)
	if err != nil {
		return nil, errors.New("Tavily ist nicht erreichbar. Prüfe deine Internetverbindung.")
	}
	defer response.Body.Close()
	// Never include provider error bodies: they may echo credentials or queries.
	switch response.StatusCode {
	case 401, 403:
		return nil, errors.New("Tavily hat den API-Schlüssel abgelehnt. Prüfe ihn in den Einstellungen.")
	case 429:
		return nil, errors.New("Zu viele Tavily-Anfragen. Bitte warte einen Moment.")
	case 432, 433:
		return nil, errors.New("Dein Tavily-Kontingent ist aufgebraucht. Prüfe dein Tavily-Dashboard.")
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Tavily antwortete mit HTTP %d.", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, (8<<20)+1))
	if err != nil || len(body) > 8<<20 {
		return nil, errors.New("Die Tavily-Antwort ist zu groß oder unvollständig.")
	}
	var result struct {
		Results []struct{ Title, URL, Content, Favicon string }
	}
	if json.Unmarshal(body, &result) != nil {
		return nil, errors.New("Unerwartete Antwort von Tavily.")
	}
	page := &Page{Query: query, Provider: "Tavily", Results: []Result{}, Millis: time.Since(started).Milliseconds()}
	for _, item := range result.Results {
		u, err := url.Parse(item.URL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.User != nil {
			continue
		}
		page.Results = append(page.Results, Result{Title: plain(item.Title), URL: u.String(),
			Host: strings.TrimPrefix(u.Hostname(), "www."), Path: crumb(u.EscapedPath()),
			Desc: sanitize(item.Content), Favicon: safeImg(item.Favicon)})
	}
	// Tavily has no offset pagination. Never repeat a request to fake another page.
	return page, nil
}
