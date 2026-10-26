package main

import (
	"os"
	"path/filepath"
)

// Both the browser and its stdio bridge must open the same profile.
func userProfileRoot() (string, error) {
	root, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	if os.Getenv("LUNA_TEST_MODE") == "1" {
		root = filepath.Join(root, "Luna Extension Test")
	}
	return filepath.Join(root, "browser-mac"), nil
}
