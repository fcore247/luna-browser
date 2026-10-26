package extensions

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackageIconsSurviveRestoreWithoutRemoteRequests(t *testing.T) {
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvS8AAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	engine := func(string, map[string]any) (string, error) { return "runtime", nil }
	m, err := New(root, engine)
	if err != nil {
		t.Fatal(err)
	}
	entry, err := m.prepare(archive(t, map[string]string{"manifest.json": `{"manifest_version":3,"name":"Icons","version":"1","icons":{"128":"icon.png"}}`, "icon.png": string(png)}))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(entry.Icon, "data:image/png;base64,") {
		t.Fatal("preview missing icon")
	}
	if _, err = m.Install(entry.ID); err != nil {
		t.Fatal(err)
	}
	m, err = New(root, engine)
	if err != nil {
		t.Fatal(err)
	}
	if m.List()[0].Icon != entry.Icon {
		t.Fatal("restored icon differs")
	}
	persisted, _ := os.ReadFile(filepath.Join(root, "installed.json"))
	if strings.Contains(string(persisted), "base64") {
		t.Fatal("image bytes persisted in registry")
	}
	if ImageData([]byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`)) != "" {
		t.Fatal("SVG accepted")
	}
	if ImageData(make([]byte, (2<<20)+1)) != "" {
		t.Fatal("oversized icon accepted")
	}
}
