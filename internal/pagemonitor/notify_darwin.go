package pagemonitor

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func Notify(w Watch) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// AppleScript source is constant; the URL is passed as an argument, never code.
	cmd := exec.CommandContext(ctx, "/usr/bin/osascript", "-", w.URL)
	cmd.Stdin = strings.NewReader("on run argv\ndisplay notification (item 1 of argv) with title \"Luna: Seite aktualisiert\"\nend run")
	return cmd.Run()
}
