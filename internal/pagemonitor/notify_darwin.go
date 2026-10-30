package pagemonitor

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func Notify(w Watch, title string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// AppleScript source is constant; the URL is passed as an argument, never code.
	cmd := exec.CommandContext(ctx, "/usr/bin/osascript", "-", w.URL, "Luna: "+title)
	cmd.Stdin = strings.NewReader("on run argv\ndisplay notification (item 1 of argv) with title (item 2 of argv)\nend run")
	return cmd.Run()
}
