//go:build !darwin

package vault

import (
	"crypto/rand"
	"encoding/hex"
	"errors"

	"browser-mac/internal/secret"
)

// DefaultKey keeps the vault key in the protected secret file of the profile
// (DPAPI on Windows, owner-only file elsewhere).
func DefaultKey(dir string) KeyFunc {
	store := secret.New(dir)
	return func() ([]byte, error) {
		stored, ok, err := store.Get("vault-key")
		if err != nil {
			return nil, err
		}
		if ok {
			key, err := hex.DecodeString(stored)
			if err != nil || len(key) != 32 {
				return nil, errors.New("Der Tresorschlüssel ist beschädigt.")
			}
			return key, nil
		}
		key := make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
		if err := store.Set("vault-key", hex.EncodeToString(key)); err != nil {
			return nil, err
		}
		return key, nil
	}
}
