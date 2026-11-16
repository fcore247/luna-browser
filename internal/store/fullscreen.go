package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const (
	DefaultFullscreenCoverDuration = 1.0
	fullscreenDurationFile         = "fullscreen-cover-seconds.json"
)

func validFullscreenDuration(seconds float64) bool {
	return seconds >= 0 && seconds <= 60
}

func (s *Store) FullscreenCoverDuration() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := os.ReadFile(filepath.Join(s.dir, fullscreenDurationFile))
	seconds := DefaultFullscreenCoverDuration
	if err != nil || json.Unmarshal(raw, &seconds) != nil || !validFullscreenDuration(seconds) {
		return DefaultFullscreenCoverDuration
	}
	return seconds
}

func (s *Store) SetFullscreenCoverDuration(seconds float64) error {
	if !validFullscreenDuration(seconds) {
		return errors.New("Die Dauer muss zwischen 0 und 60 Sekunden liegen.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.write(fullscreenDurationFile, seconds)
}
