//go:build !windows && !darwin

package pagemonitor

func Notify(w Watch) error { return nil }
