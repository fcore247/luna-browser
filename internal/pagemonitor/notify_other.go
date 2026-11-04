//go:build !windows && !darwin

package pagemonitor

func Notify(w Watch, title string) error { return nil }
