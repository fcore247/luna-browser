package main

import (
	"browser-mac/internal/buildinfo"
	"os"
	"path/filepath"
	"testing"
)

func TestBrowserAndBridgeProfile(t *testing.T) {
	originalMode := buildinfo.TestMode
	t.Cleanup(func() { buildinfo.TestMode = originalMode })
	root, err := os.UserConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct{ build, mode, want string }{
		{"", "", filepath.Join(root, "browser-mac")},
		{"", "1", filepath.Join(root, "Luna Extension Test", "browser-mac")},
		// A packaged test GUI and --mcp use this same path even when the MCP
		// client does not inherit LUNA_TEST_MODE (or explicitly clears it).
		{"1", "", filepath.Join(root, "Luna Extension Test", "browser-mac")},
		{"1", "0", filepath.Join(root, "Luna Extension Test", "browser-mac")},
	} {
		buildinfo.TestMode = test.build
		t.Setenv("LUNA_TEST_MODE", test.mode)
		got, err := userProfileRoot()
		if err != nil || got != test.want {
			t.Fatalf("profile: %q, %v", got, err)
		}
	}
}
