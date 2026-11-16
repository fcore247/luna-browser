package store

import (
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestFullscreenCoverDuration(t *testing.T) {
	dir := t.TempDir()
	open := func() *Store {
		t.Helper()
		s, err := New(dir)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	requireDuration := func(want float64) {
		t.Helper()
		if got := open().FullscreenCoverDuration(); got != want {
			t.Fatalf("reopened profile has duration %v, want %v", got, want)
		}
	}
	s := open()
	s.SetPref("englishUI", true)
	requireDuration(1)
	for _, seconds := range []float64{0, 60, 2.5} {
		if err := s.SetFullscreenCoverDuration(seconds); err != nil {
			t.Fatal(err)
		}
		requireDuration(seconds)
	}
	for _, invalid := range []float64{-1, 60.1, math.NaN(), math.Inf(1)} {
		if err := s.SetFullscreenCoverDuration(invalid); err == nil {
			t.Fatalf("accepted %v", invalid)
		}
	}
	requireDuration(2.5)
	if !open().Prefs()["englishUI"] {
		t.Fatal("lost unrelated preference")
	}
	tmp := filepath.Join(dir, fullscreenDurationFile+".tmp")
	if err := os.Mkdir(tmp, 0700); err != nil {
		t.Fatal(err)
	}
	if err := s.SetFullscreenCoverDuration(5); err == nil {
		t.Fatal("expected storage error")
	}
	requireDuration(2.5)
	if err := s.ResetSettings(); err != nil {
		t.Fatal(err)
	}
	requireDuration(1)
	for _, invalid := range []string{"", "null", "false", "-3", "100"} {
		if err := os.WriteFile(filepath.Join(dir, fullscreenDurationFile), []byte(invalid), 0600); err != nil {
			t.Fatal(err)
		}
		requireDuration(1)
	}
}
