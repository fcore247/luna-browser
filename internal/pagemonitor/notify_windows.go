package pagemonitor

import (
	"git.sr.ht/~jackmordaunt/go-toast/v2"
	"sync"
)

var notificationSetup sync.Once
var notificationSetupError error

// Notify uses the Windows notification center even when Luna is in the background.
func Notify(w Watch, title string) error {
	notificationSetup.Do(func() {
		notificationSetupError = toast.SetAppData(toast.AppData{AppID: "Luna", GUID: "2BCE3D96-088B-4D63-A36B-0750607D54D0"})
	})
	if notificationSetupError != nil {
		return notificationSetupError
	}
	return (&toast.Notification{AppID: "Luna", Title: title, Body: w.URL}).Push()
}
