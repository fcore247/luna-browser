package search

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTavilySearchContract(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer tvly-private" {
			t.Error("authentication contract")
		}
		if strings.Contains(r.URL.String(), "private") {
			t.Error("key leaked in URL")
		}
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Fatal("invalid request")
		}
		if body["search_depth"] != "basic" || body["auto_parameters"] != false || body["language"] != "en" || body["max_results"] != float64(20) {
			t.Errorf("unexpected request: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"results":[{"title":"Example &amp; demo","url":"https://www.example.com/guide","content":"Hello <strong>world</strong><script>bad()</script>","favicon":"https://example.com/favicon.ico"},{"title":"Bad","url":"javascript:alert(1)","content":"unsafe"}]}`))
	}))
	defer srv.Close()
	c := NewTavilyClient(func() (string, error) { return "tvly-private", nil })
	c.Endpoint = srv.URL
	p, err := c.Search(context.Background(), "query", "en")
	if err != nil {
		t.Fatal(err)
	}
	if p.Provider != "Tavily" || p.More || len(p.Results) != 1 || p.Results[0].Host != "example.com" || p.Results[0].Title != "Example & demo" {
		t.Fatalf("bad results: %+v", p)
	}
	if strings.Contains(string(p.Results[0].Desc), "<script>") {
		t.Fatal("unsafe content")
	}
}

func TestTavilyErrorsDoNotExposeKeys(t *testing.T) {
	for _, status := range []int{401, 429, 432, 433, 500} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
			w.Write([]byte("tvly-private echoed by provider"))
		}))
		c := NewTavilyClient(func() (string, error) { return "tvly-private", nil })
		c.Endpoint = srv.URL
		_, err := c.Search(context.Background(), "test", "de")
		srv.Close()
		if err == nil || strings.Contains(err.Error(), "private") {
			t.Fatalf("unsafe/missing error: %v", err)
		}
	}
}
