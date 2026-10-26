package vault

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testKey() ([]byte, error) { return bytes.Repeat([]byte{7}, 32), nil }

func newVault(t *testing.T) (*Vault, string) {
	t.Helper()
	dir := t.TempDir()
	v, err := New(dir, testKey)
	if err != nil {
		t.Fatal(err)
	}
	return v, dir
}

func TestOriginNormalisesAndRefusesUnsafeHosts(t *testing.T) {
	good := map[string]string{
		"https://Schule.example.org/login?x=1#y": "https://schule.example.org",
		"https://schule.example.org:443/":        "https://schule.example.org",
		"https://schule.example.org:8443/a":      "https://schule.example.org:8443",
		"http://localhost:5173/app":              "http://localhost:5173",
		"http://127.0.0.1:3000":                  "http://127.0.0.1:3000",
		"http://[::1]:8080/x":                    "http://[::1]:8080",
	}
	for in, want := range good {
		got, err := Origin(in)
		if err != nil || got != want {
			t.Errorf("Origin(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, in := range []string{"", "http://example.org", "ftp://example.org", "https://user:pw@example.org", "javascript:alert(1)", "https://", "file:///etc/passwd"} {
		if got, err := Origin(in); err == nil {
			t.Errorf("Origin(%q) = %q, want an error", in, got)
		}
	}
}

func TestPasswordsAreEncryptedAndNeverListed(t *testing.T) {
	v, dir := newVault(t)
	if _, err := v.Add("https://schule.example.org/login", "max", "geheim-123"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "logins.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "geheim-123") {
		t.Fatal("password is stored in clear text")
	}
	// Unix permission bits do not exist on Windows (the profile folder is private there anyway).
	if runtime.GOOS != "windows" {
		info, _ := os.Stat(filepath.Join(dir, "logins.json"))
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("vault file mode = %v", info.Mode().Perm())
		}
	}
	for _, e := range append(v.All(), v.List("https://schule.example.org/anything")...) {
		if e.Origin != "https://schule.example.org" || e.Username != "max" {
			t.Fatalf("unexpected entry %+v", e)
		}
	}
	got, err := v.Password("https://schule.example.org", "max")
	if err != nil || got != "geheim-123" {
		t.Fatalf("Password = %q, %v", got, err)
	}
}

func TestAddReplacesAndSurvivesReopen(t *testing.T) {
	v, dir := newVault(t)
	v.Add("https://schule.example.org", "max", "alt")
	v.Add("https://schule.example.org", "max", "neu")
	v.Add("https://schule.example.org", "anna", "x")
	if n := len(v.All()); n != 2 {
		t.Fatalf("entries = %d, want 2", n)
	}
	again, err := New(dir, testKey)
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := again.Password("https://schule.example.org", "max"); got != "neu" {
		t.Fatalf("after reopen Password = %q", got)
	}
	same, err := again.Matches("https://schule.example.org", "max", "neu")
	if err != nil || !same {
		t.Fatal("Matches should be true for the stored password")
	}
	if same, _ := again.Matches("https://schule.example.org", "max", "anders"); same {
		t.Fatal("Matches should be false for another password")
	}
}

func TestWrongKeyAndSwappedRecordsFail(t *testing.T) {
	v, dir := newVault(t)
	v.Add("https://a.example.org", "max", "pw-a")
	v.Add("https://b.example.org", "max", "pw-b")
	other, _ := New(dir, func() ([]byte, error) { return bytes.Repeat([]byte{9}, 32), nil })
	if _, err := other.Password("https://a.example.org", "max"); err == nil {
		t.Fatal("a different key must not decrypt")
	}
	// Moving the ciphertext of one site to another must not decrypt (origin is authenticated).
	v.records[0].Cipher, v.records[1].Cipher = v.records[1].Cipher, v.records[0].Cipher
	v.records[0].Nonce, v.records[1].Nonce = v.records[1].Nonce, v.records[0].Nonce
	if _, err := v.Password("https://a.example.org", "max"); err == nil {
		t.Fatal("swapped records must not decrypt")
	}
}

func TestKeyFailureIsReportedAndNothingIsStored(t *testing.T) {
	dir := t.TempDir()
	denied := errors.New("denied")
	v, _ := New(dir, func() ([]byte, error) { return nil, denied })
	if _, err := v.Add("https://a.example.org", "max", "pw"); !errors.Is(err, denied) {
		t.Fatalf("Add error = %v", err)
	}
	if len(v.All()) != 0 {
		t.Fatal("failed Add must not store an entry")
	}
	// Listing never needs the key.
	if got := v.List("https://a.example.org"); len(got) != 0 {
		t.Fatal("unexpected entries")
	}
}

func TestDeleteAndValidation(t *testing.T) {
	v, _ := newVault(t)
	v.Add("https://a.example.org", "max", "pw")
	if err := v.Delete("https://a.example.org", "nobody"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Delete unknown = %v", err)
	}
	if err := v.Delete("https://a.example.org", "max"); err != nil {
		t.Fatal(err)
	}
	if v.Has("https://a.example.org", "max") {
		t.Fatal("entry still present")
	}
	for _, c := range [][3]string{{"http://a.example.org", "max", "pw"}, {"https://a.example.org", "ma\nx", "pw"}, {"https://a.example.org", "max", ""}, {"https://a.example.org", strings.Repeat("a", 400), "pw"}} {
		if _, err := v.Add(c[0], c[1], c[2]); err == nil {
			t.Errorf("Add(%q,%q,...) should fail", c[0], c[1])
		}
	}
	v.Add("https://a.example.org", "a", "1")
	v.Add("https://b.example.org", "b", "2")
	if err := v.DeleteAll(); err != nil || len(v.All()) != 0 {
		t.Fatalf("DeleteAll: %v, %d left", err, len(v.All()))
	}
}
