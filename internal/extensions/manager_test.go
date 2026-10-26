package extensions

import (
	"archive/zip"
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func archive(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	for p, s := range files {
		w, e := z.Create(p)
		if e != nil {
			t.Fatal(e)
		}
		w.Write([]byte(s))
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return b.Bytes()
}

const manifest = `{"manifest_version":3,"name":"Example","version":"1.0","permissions":["storage"],"content_scripts":[{"matches":["https://example.org/*"],"js":["content.js"]}]}`

func TestArchiveBoundaries(t *testing.T) {
	for _, p := range []string{"../escape", "/tmp/escape", "C:/escape", "folder\\escape", "./../escape"} {
		t.Run(p, func(t *testing.T) {
			if e := extract(archive(t, map[string]string{p: "bad"}), filepath.Join(t.TempDir(), "ext")); e == nil {
				t.Fatal("unsafe archive accepted")
			}
		})
	}
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	h := &zip.FileHeader{Name: "symlink"}
	h.SetMode(os.ModeSymlink | 0700)
	w, _ := z.CreateHeader(h)
	w.Write([]byte("../../escape"))
	z.Close()
	if e := extract(b.Bytes(), t.TempDir()); e == nil {
		t.Fatal("symlink accepted")
	}
}
func TestReviewBeforeExecutionAndPersistence(t *testing.T) {
	root := t.TempDir()
	calls := []string{}
	engine := func(op string, a map[string]any) (string, error) { calls = append(calls, op); return "runtime-id", nil }
	m, e := New(root, engine)
	if e != nil {
		t.Fatal(e)
	}
	entry, e := m.prepare(archive(t, map[string]string{"manifest.json": manifest, "content.js": "document.title='extension'"}))
	if e != nil {
		t.Fatal(e)
	}
	if len(calls) != 0 {
		t.Fatal("package executed before approval")
	}
	if strings.Join(entry.Permissions, ",") != "https://example.org/*,storage" {
		t.Fatal("missing content script host disclosure", entry.Permissions)
	}
	installed, e := m.Install(entry.ID)
	if e != nil {
		t.Fatal(e)
	}
	if !installed.Enabled || len(m.List()) != 1 {
		t.Fatal("install missing")
	}
	if e = m.Enable(entry.ID, false); e != nil {
		t.Fatal(e)
	}
	if m.List()[0].Enabled {
		t.Fatal("disable not saved")
	}
	m, e = New(root, engine)
	if e != nil {
		t.Fatal(e)
	}
	calls = nil
	m.Restore()
	if len(calls) > 0 {
		t.Fatal("disabled extension restored")
	}
	if e = m.Enable(entry.ID, true); e != nil {
		t.Fatal(e)
	}
	if e = m.Remove(entry.ID); e != nil {
		t.Fatal(e)
	}
	if _, e = os.Stat(filepath.Join(root, entry.ID)); !os.IsNotExist(e) {
		t.Fatal("removed package still present")
	}
	if _, e = m.Install("../../escape"); e == nil {
		t.Fatal("unknown review token accepted")
	}
}
func TestFailedLoadDoesNotInstall(t *testing.T) {
	m, _ := New(t.TempDir(), func(string, map[string]any) (string, error) { return "", errors.New("unsupported API") })
	entry, e := m.prepare(archive(t, map[string]string{"manifest.json": manifest}))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = m.Install(entry.ID); e == nil {
		t.Fatal("load failure accepted")
	}
	if len(m.List()) != 0 {
		t.Fatal("failed extension registered")
	}
}
func TestStoreInput(t *testing.T) {
	id := "eimadpbcbfnmbkopoojfekhnkhdbieeh"
	for _, s := range []string{id, "https://chromewebstore.google.com/detail/dark-reader/" + id, "https://chrome.google.com/webstore/detail/dark-reader/" + id} {
		if got, e := StoreID(s); e != nil || got != id {
			t.Fatal(s, got, e)
		}
	}
	for _, s := range []string{"https://evil.com/" + id, "http://chromewebstore.google.com/detail/a/" + id, "https://chromewebstore.google.com.evil.com/detail/a/" + id, "../../secret"} {
		if _, e := StoreID(s); e == nil {
			t.Fatal("invalid source accepted", s)
		}
	}
}
func field(tag uint64, v []byte) []byte {
	b := binary.AppendUvarint(nil, tag<<3|2)
	b = binary.AppendUvarint(b, uint64(len(v)))
	return append(b, v...)
}
func TestCRXAuthenticity(t *testing.T) {
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	pub, e := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if e != nil {
		t.Fatal(e)
	}
	sum := sha256.Sum256(pub)
	var id string
	for _, x := range sum[:16] {
		id += string([]byte{'a' + (x >> 4), 'a' + (x & 15)})
	}
	payload := archive(t, map[string]string{"manifest.json": manifest})
	signed := field(1, sum[:16])
	data := append([]byte("CRX3 SignedData\x00"), binary.LittleEndian.AppendUint32(nil, uint32(len(signed)))...)
	data = append(data, signed...)
	data = append(data, payload...)
	hash := sha256.Sum256(data)
	sig, e := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	if e != nil {
		t.Fatal(e)
	}
	proof := append(field(1, pub), field(2, sig)...)
	header := append(field(2, proof), field(10000, signed)...)
	crx := append([]byte("Cr24"), binary.LittleEndian.AppendUint32(nil, 3)...)
	crx = append(crx, binary.LittleEndian.AppendUint32(nil, uint32(len(header)))...)
	crx = append(crx, header...)
	crx = append(crx, payload...)
	if !bytes.Equal(verifiedKey(crx), pub) {
		t.Fatal("developer key identity lost")
	}
	got, e := VerifyCRX(crx, id)
	if e != nil || !bytes.Equal(got, payload) {
		t.Fatal("valid signature rejected", e)
	}
	if _, e = VerifyCRX(crx, strings.Repeat("a", 32)); e == nil {
		t.Fatal("identity substitution accepted")
	}
	crx[len(crx)-1] ^= 1
	if _, e = VerifyCRX(crx, id); e == nil {
		t.Fatal("tampered signed package accepted")
	}
	for _, bad := range [][]byte{nil, []byte("Cr24"), []byte("PKbad"), append([]byte("Cr24\x03\x00\x00\x00"), []byte{255, 255, 255, 255}...)} {
		if _, e = VerifyCRX(bad, ""); e == nil {
			t.Fatal("malformed CRX accepted")
		}
	}
}
