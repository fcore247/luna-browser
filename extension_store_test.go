package main

import (
	"strings"
	"testing"
)

func TestStorePageExtractsTextAndOnlyExtensionScreenshots(t *testing.T) {
	const id = "paponcgjfojgemddooebbgniglhkajkj"
	document := `<html><head><link rel="canonical" href="https://chromewebstore.google.com/detail/example/` + id + `"><meta property="og:title" content="Example &amp; More - Chrome Web Store"><meta property="og:description" content="Short summary"><meta property="og:image" content="https://lh3.googleusercontent.com/icon"></head><body><section><div><h2>Overview</h2></div><div><p>First &amp; second.</p><p>Long description.</p><script>stealKeys()</script></div></section><div data-media-url="https://lh3.googleusercontent.com/screen" data-is-video="false"></div><div data-media-url="https://lh3.googleusercontent.com/screen" data-is-video="false"></div><div data-media-url="https://youtube.com/video" data-is-video="true"></div></body></html>`
	page, images, err := parseStorePage([]byte(document), id)
	if err != nil {
		t.Fatal(err)
	}
	if page.Name != "Example & More" || !strings.Contains(page.Description, "Long description.") || strings.Contains(page.Description, "stealKeys") {
		t.Fatalf("unexpected metadata: %#v", page)
	}
	if len(images) != 1 || images[0] != "https://lh3.googleusercontent.com/screen=w1000" {
		t.Fatalf("unexpected screenshots: %v", images)
	}
	_, _, err = parseStorePage([]byte(strings.Replace(document, id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 1)), id)
	if err == nil {
		t.Fatal("wrong extension accepted")
	}
	_, _, err = parseStorePage([]byte(`<h1>Consent page</h1>`), id)
	if err == nil {
		t.Fatal("missing metadata accepted")
	}
}
