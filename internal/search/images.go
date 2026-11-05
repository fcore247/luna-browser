package search

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const braveImageEndpoint = "https://api.search.brave.com/res/v1/images/search"

// Image ist ein Treffer der Bildersuche. Thumb ist die kleine Vorschau, Full das Originalbild
// (nur https), URL die Seite, auf der das Bild liegt.
type Image struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Host  string `json:"host"`
	Thumb string `json:"thumb"`
	Full  string `json:"full"`
	W     int    `json:"w"`
	H     int    `json:"h"`
}

type ImagePage struct {
	Provider string  `json:"provider,omitempty"`
	Query    string  `json:"query"`
	Images   []Image `json:"images"`
	Millis   int64   `json:"millis"`
}

type braveImages struct {
	Results []struct {
		Title     string `json:"title"`
		URL       string `json:"url"`
		Source    string `json:"source"`
		Thumbnail struct {
			Src    string `json:"src"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"thumbnail"`
		Properties struct {
			URL    string `json:"url"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"properties"`
		Meta meta `json:"meta_url"`
	} `json:"results"`
}

const imageCount = 40

// Images sucht Bilder bei Brave. Der Schlüssel verlässt das Paket nie.
func (c *Client) Images(ctx context.Context, q, language string) (*ImagePage, error) {
	key, err := c.Key()
	if err != nil {
		return nil, err
	}
	if key == "" {
		return nil, ErrNoKey
	}
	endpoint := c.ImageEndpoint
	if endpoint == "" {
		endpoint = braveImageEndpoint
	}
	v := url.Values{}
	v.Set("q", q)
	v.Set("count", strconv.Itoa(imageCount))
	v.Set("country", "DE")
	v.Set("search_lang", "de")
	if language == "en" {
		v.Set("search_lang", "en")
	}
	v.Set("safesearch", "strict")
	v.Set("spellcheck", "1")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+v.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Subscription-Token", key)
	t0 := time.Now()
	resp, err := c.HTTP.Do(req)
	if err == nil && resp.StatusCode == 429 {
		resp.Body.Close()
		select {
		case <-time.After(1100 * time.Millisecond):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		resp, err = c.HTTP.Do(req.Clone(ctx))
	}
	if err != nil {
		return nil, fmt.Errorf("Brave ist nicht erreichbar: %w", errors.Unwrap(err))
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	switch {
	case resp.StatusCode == 401 || resp.StatusCode == 403 || resp.StatusCode == 422:
		return nil, errors.New("Der API-Schlüssel wurde von Brave abgelehnt. Bitte in den Einstellungen prüfen.")
	case resp.StatusCode == 429:
		return nil, errors.New("Brave-Limit erreicht (Free-Plan: 1 Anfrage pro Sekunde, begrenzte Anfragen pro Monat). Bitte kurz warten.")
	case resp.StatusCode >= 400:
		return nil, fmt.Errorf("Brave antwortete mit Fehler %d.", resp.StatusCode)
	}
	var br braveImages
	if err := json.Unmarshal(body, &br); err != nil {
		return nil, errors.New("Unerwartete Antwort von Brave.")
	}
	p := &ImagePage{Query: q, Images: []Image{}, Millis: time.Since(t0).Milliseconds()}
	for _, r := range br.Results {
		thumb := safeImg(r.Thumbnail.Src)
		if thumb == "" {
			continue
		}
		full := safeImg(r.Properties.URL)
		if full == "" {
			full = thumb
		}
		w, h := r.Properties.Width, r.Properties.Height
		if w <= 0 || h <= 0 {
			w, h = r.Thumbnail.Width, r.Thumbnail.Height
		}
		page := r.URL
		if !strings.HasPrefix(page, "https://") && !strings.HasPrefix(page, "http://") {
			page = ""
		}
		p.Images = append(p.Images, Image{
			Title: plain(r.Title), URL: page, Host: hostOf(firstNonEmpty(r.Meta.Host, r.Source), page),
			Thumb: thumb, Full: full, W: w, H: h,
		})
	}
	return p, nil
}
