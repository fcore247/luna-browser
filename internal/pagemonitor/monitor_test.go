package pagemonitor

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func TestLifecycle(t *testing.T) {
	body := "<html><body>Version one<script>noise</script></body></html>"
	status := 200
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	defer srv.Close()
	changes := 0
	path := filepath.Join(t.TempDir(), "watches.json")
	m, e := New(path, func(Watch) { changes++ })
	if e != nil {
		t.Fatal(e)
	}
	// Test fixture only: production transport rejects loopback, tested separately.
	m.client = srv.Client()
	w, e := m.Add(srv.URL, 1)
	if e != nil {
		t.Fatal(e)
	}
	check := func() { m.mu.Lock(); m.watches[0].Checked = time.Time{}; m.mu.Unlock(); m.check(context.Background()) }
	check()
	if changes != 0 || m.List()[0].Hash == "" {
		t.Fatal("baseline should not notify")
	}
	body = "<html><body>Version   one<script>new noise</script></body></html>"
	check()
	if changes != 0 {
		t.Fatal("script/whitespace should not notify")
	}
	body = "<html><body>Version two</body></html>"
	check()
	if changes != 1 {
		t.Fatal("missing change notification")
	}
	check()
	if changes != 1 {
		t.Fatal("duplicate notification")
	}
	status = 503
	check()
	if m.List()[0].Error == "" || changes != 1 {
		t.Fatal("HTTP errors must preserve baseline")
	}
	restored, e := New(path, nil)
	if e != nil || restored.List()[0].Changed.IsZero() {
		t.Fatal("state not restored", e)
	}
	if _, e = m.Update(w.ID, "pause"); e != nil {
		t.Fatal(e)
	}
	status = 200
	body = "three"
	check()
	if changes != 1 {
		t.Fatal("paused watch checked")
	}
	m.Update(w.ID, "resume")
	check()
	if changes != 2 {
		t.Fatal("resume missing change")
	}
	m.Update(w.ID, "remove")
	if len(m.List()) != 0 {
		t.Fatal("remove failed")
	}
}

func TestPublicBoundary(t *testing.T) {
	m, _ := New(filepath.Join(t.TempDir(), "w.json"), nil)
	for _, raw := range []string{"file:///etc/passwd", "https://user:password@example.com", "javascript:alert(1)"} {
		if _, e := m.Add(raw, 5); e == nil {
			t.Fatal("accepted", raw)
		}
	}
	for _, raw := range []string{"http://127.0.0.1", "http://[::1]", "http://169.254.169.254", "http://10.0.0.1"} {
		if _, e := m.fetch(context.Background(), raw); e == nil {
			t.Fatal("private address accepted", raw)
		}
	}
}
