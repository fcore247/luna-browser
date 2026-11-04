package main

import (
	"browser-mac/internal/buildinfo"
	"os"
	"path/filepath"
)

// Test packages carry their profile identity in the executable. A stdio client
// (Claude, etc.) does not inherit the environment of the running GUI process.
func testProfileEnabled() bool {
	return buildinfo.TestMode == "1" || os.Getenv("LUNA_TEST_MODE") == "1"
}

// Both the browser and its stdio bridge must open the same profile.
func userProfileRoot() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	if testProfileEnabled() {
		root = filepath.Join(root, "Luna Extension Test")
	}
	return filepath.Join(root, "browser-mac"), nil
}
