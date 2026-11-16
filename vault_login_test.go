package main

import (
	"testing"
	"time"
)

func TestLoginContinuationScope(t *testing.T) {
	const origin = "https://accounts.example.test"
	var s vaultState
	for _, tc := range []struct {
		name, origin, account, form string
		tab                         int
		want                        bool
	}{
		{"next password step", origin, "demo", "second", 1, true},
		{"different tab", origin, "demo", "second", 2, false},
		{"different origin", "https://other.example.test", "demo", "second", 1, false},
		{"different account", origin, "other", "second", 1, false},
		{"same form", origin, "demo", "first", 1, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			token := s.beginContinuation(1, origin, "demo", "first")
			if got := s.consumeContinuation(tc.tab, tc.origin, tc.account, tc.form, token); got != tc.want {
				t.Fatalf("consumed %t, want %t", got, tc.want)
			}
			if tc.want && s.consumeContinuation(1, origin, "demo", "third", token) {
				t.Fatal("continuation accepted twice")
			}
		})
	}
	token := s.beginContinuation(1, origin, "demo", "first")
	grant := s.grants[1]
	grant.expires = time.Now().Add(-time.Second)
	s.grants[1] = grant
	if s.consumeContinuation(1, origin, "demo", "second", token) {
		t.Fatal("expired continuation accepted")
	}
}
