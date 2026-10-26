// Package vault stores website logins for Luna's own password manager.
// Passwords are encrypted with AES-256-GCM; only the single vault key lives in the system keychain
// (see key_darwin.go). Origins and user names stay readable so Luna can offer a login without
// unlocking anything. Passwords are never returned by List/All and never leave this process
// except for filling a form after the user confirmed with Touch ID.
package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

var (
	ErrNotFound = errors.New("Kein gespeichertes Passwort gefunden.")
	ErrInvalid  = errors.New("Ungültige Zugangsdaten.")
)

// Entry is the public, password-free view of a stored login.
type Entry struct {
	Origin   string `json:"origin"`
	Username string `json:"username"`
	Updated  int64  `json:"updated"`
}

// KeyFunc returns the 32 byte vault key. It may ask the user (keychain) and may fail.
type KeyFunc func() ([]byte, error)

type record struct {
	Origin   string `json:"origin"`
	Username string `json:"username"`
	Nonce    []byte `json:"nonce"`
	Cipher   []byte `json:"cipher"`
	Updated  int64  `json:"updated"`
}

type Vault struct {
	mu      sync.Mutex
	file    string
	keyFn   KeyFunc
	key     []byte
	records []record
}

// Origin reduces a URL to scheme://host[:port]. Only https is accepted, plus http for loopback
// development hosts. Everything else (user info, other schemes, empty hosts) is refused.
func Origin(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Hostname() == "" || u.User != nil {
		return "", ErrInvalid
	}
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	loopback := host == "localhost" || strings.HasSuffix(host, ".localhost") || isLoopback(host)
	if scheme != "https" && !(scheme == "http" && loopback) {
		return "", ErrInvalid
	}
	port := u.Port()
	if port == "443" && scheme == "https" || port == "80" && scheme == "http" {
		port = ""
	}
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	if port != "" {
		return scheme + "://" + host + ":" + port, nil
	}
	return scheme + "://" + host, nil
}

func isLoopback(host string) bool {
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func validate(origin, username, password string, needPassword bool) (string, error) {
	origin, err := Origin(origin)
	if err != nil {
		return "", err
	}
	if len(username) > 320 || strings.IndexFunc(username, unicode.IsControl) >= 0 {
		return "", ErrInvalid
	}
	if needPassword && (password == "" || len(password) > 1024) {
		return "", ErrInvalid
	}
	return origin, nil
}

// New opens (or creates) the vault file in dir. The key is fetched lazily on first use.
func New(dir string, key KeyFunc) (*Vault, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	v := &Vault{file: filepath.Join(dir, "logins.json"), keyFn: key}
	data, err := os.ReadFile(v.file)
	if errors.Is(err, os.ErrNotExist) {
		return v, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &v.records); err != nil {
		return nil, err
	}
	return v, nil
}

func aad(origin, username string) []byte { return []byte(origin + "\x00" + username) }

func (v *Vault) aead() (cipher.AEAD, error) {
	if v.key == nil {
		key, err := v.keyFn()
		if err != nil {
			return nil, err
		}
		if len(key) != 32 {
			return nil, errors.New("Der Tresorschlüssel hat eine ungültige Länge.")
		}
		v.key = key
	}
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (v *Vault) save() error {
	data, err := json.Marshal(v.records)
	if err != nil {
		return err
	}
	tmp := v.file + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, v.file)
}

func (v *Vault) index(origin, username string) int {
	for i, r := range v.records {
		if r.Origin == origin && r.Username == username {
			return i
		}
	}
	return -1
}

// Add stores or replaces the login for origin and user name.
func (v *Vault) Add(origin, username, password string) (Entry, error) {
	origin, err := validate(origin, username, password, true)
	if err != nil {
		return Entry{}, err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	gcm, err := v.aead()
	if err != nil {
		return Entry{}, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return Entry{}, err
	}
	r := record{
		Origin: origin, Username: username, Nonce: nonce,
		Cipher:  gcm.Seal(nil, nonce, []byte(password), aad(origin, username)),
		Updated: time.Now().Unix(),
	}
	if i := v.index(origin, username); i >= 0 {
		v.records[i] = r
	} else {
		v.records = append(v.records, r)
	}
	if err := v.save(); err != nil {
		return Entry{}, err
	}
	return Entry{Origin: origin, Username: username, Updated: r.Updated}, nil
}

// Password decrypts one password. Call it only after the user confirmed.
func (v *Vault) Password(origin, username string) (string, error) {
	origin, err := validate(origin, username, "", false)
	if err != nil {
		return "", err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	i := v.index(origin, username)
	if i < 0 {
		return "", ErrNotFound
	}
	gcm, err := v.aead()
	if err != nil {
		return "", err
	}
	r := v.records[i]
	plain, err := gcm.Open(nil, r.Nonce, r.Cipher, aad(r.Origin, r.Username))
	if err != nil {
		return "", errors.New("Das Passwort konnte nicht entschlüsselt werden.")
	}
	return string(plain), nil
}

// Has reports whether a login for origin and user name exists (no key needed).
func (v *Vault) Has(origin, username string) bool {
	origin, err := Origin(origin)
	if err != nil {
		return false
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.index(origin, username) >= 0
}

// Matches reports whether the stored password equals password. It needs the key, so callers
// must treat an error as "unknown".
func (v *Vault) Matches(origin, username, password string) (bool, error) {
	stored, err := v.Password(origin, username)
	if err != nil {
		return false, err
	}
	return subtle.ConstantTimeCompare([]byte(stored), []byte(password)) == 1, nil
}

func entries(records []record) []Entry {
	out := make([]Entry, 0, len(records))
	for _, r := range records {
		out = append(out, Entry{Origin: r.Origin, Username: r.Username, Updated: r.Updated})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Origin != out[j].Origin {
			return out[i].Origin < out[j].Origin
		}
		return out[i].Username < out[j].Username
	})
	return out
}

// List returns the logins stored for one origin (empty for invalid origins).
func (v *Vault) List(origin string) []Entry {
	origin, err := Origin(origin)
	if err != nil {
		return []Entry{}
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	var matching []record
	for _, r := range v.records {
		if r.Origin == origin {
			matching = append(matching, r)
		}
	}
	return entries(matching)
}

// All returns every stored login without passwords.
func (v *Vault) All() []Entry {
	v.mu.Lock()
	defer v.mu.Unlock()
	return entries(v.records)
}

// Delete removes one login.
func (v *Vault) Delete(origin, username string) error {
	origin, err := validate(origin, username, "", false)
	if err != nil {
		return err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	i := v.index(origin, username)
	if i < 0 {
		return ErrNotFound
	}
	v.records = append(v.records[:i], v.records[i+1:]...)
	return v.save()
}

// DeleteAll removes every login.
func (v *Vault) DeleteAll() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.records = nil
	return v.save()
}
