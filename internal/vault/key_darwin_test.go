package vault

import (
	"bytes"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestKeychainKeyIsCreatedOnceAndReused(t *testing.T) {
	if os.Getenv("LUNA_SKIP_KEYCHAIN_TEST") != "" {
		t.Skip("keychain test disabled")
	}
	service := fmt.Sprintf("com.luna.browser.vault.test.%d", time.Now().UnixNano())
	defer deleteKeychainKey(service, "vault-key")
	key := keychainKey(service, "vault-key")
	first, err := key()
	if err != nil {
		// Headless CI runners often have no unlocked login keychain. That says nothing about the vault.
		t.Skipf("keychain not available here: %v", err)
	}
	if len(first) != 32 {
		t.Fatalf("first key: %d bytes", len(first))
	}
	second, err := key()
	if err != nil || !bytes.Equal(first, second) {
		t.Fatalf("second key differs or failed: %v", err)
	}
	v, err := New(t.TempDir(), key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.Add("https://schule.example.org", "max", "pw"); err != nil {
		t.Fatal(err)
	}
	if got, err := v.Password("https://schule.example.org", "max"); err != nil || got != "pw" {
		t.Fatalf("Password = %q, %v", got, err)
	}
}
