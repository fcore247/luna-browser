package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBrowserAndBridgeProfile(t *testing.T) {
	root, err := os.UserConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct{ mode, want string }{{"", filepath.Join(root, "browser-mac")}, {"1", filepath.Join(root, "Luna Extension Test", "browser-mac")}} {
		t.Setenv("LUNA_TEST_MODE", test.mode)
		got, err := userProfileRoot()
		if err != nil || got != test.want {
			t.Fatalf("profile: %q, %v", got, err)
		}
	}
}
