// Package web steuert native Browser-Tabs (WKWebView), die als Unteransichten im Fenster liegen.
// Die Oberfläche (Tabs, Adressleiste …) bleibt HTML im Wails-Webview; hier läuft nur das Rendern der Seiten.
package web

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework WebKit -framework LocalAuthentication
#include <stdlib.h>
#include "web_darwin.h"
*/
import "C"

import (
	"encoding/json"
	"errors"
	"sync"
	"time"
	"unsafe"
)

var (
	emitFn func(string)
	snapMu sync.Mutex
	snaps  = map[int]chan string{}
	snapID int
)

// SetEmitter legt fest, wohin Ereignisse der Tabs (JSON) gehen.
func SetEmitter(f func(string)) { emitFn = f }

//export goWebEvent
func goWebEvent(j *C.char) {
	if emitFn != nil {
		emitFn(C.GoString(j))
	}
}

//export goSnapshotDone
func goSnapshotDone(req C.int, b64 *C.char) {
	snapMu.Lock()
	ch := snaps[int(req)]
	snapMu.Unlock()
	if ch != nil {
		ch <- C.GoString(b64)
	}
}

func Load(id int, url string) {
	c := C.CString(url)
	defer C.free(unsafe.Pointer(c))
	C.fmwLoad(C.int(id), c)
}

func Back(id int)    { C.fmwHistory(C.int(id), 0) }
func Forward(id int) { C.fmwHistory(C.int(id), 1) }
func Reload(id int)  { C.fmwHistory(C.int(id), 2) }
func Stop(id int)    { C.fmwHistory(C.int(id), 3) }

func SetFrame(x, y, w, h float64) { C.fmwSetFrame(C.double(x), C.double(y), C.double(w), C.double(h)) }
func Show(id int)                 { C.fmwShow(C.int(id)) }
func Close(id int)                { C.fmwClose(C.int(id)) }
func Zoom(id int, f float64)      { C.fmwZoom(C.int(id), C.double(f)) }
func FocusUI()                    { C.fmwFocusUI() }
func SetLanguage(messages string) {
	c := C.CString(messages)
	defer C.free(unsafe.Pointer(c))
	C.fmwSetLanguage(c)
}

// SetAppearance: "light", "dark" oder sonst System. Webseiten folgen über prefers-color-scheme.
func SetAppearance(mode string) {
	m := 0
	switch mode {
	case "light":
		m = 1
	case "dark":
		m = 2
	}
	C.fmwSetAppearance(C.int(m))
}

func Find(id int, text string, forward bool) {
	c := C.CString(text)
	defer C.free(unsafe.Pointer(c))
	f := 0
	if forward {
		f = 1
	}
	C.fmwFind(C.int(id), c, C.int(f))
}

// snapshotVia startet eine asynchrone Native-Anfrage und wartet auf das Bild (Base64-JPEG).
func snapshotVia(start func(req C.int)) (string, error) {
	snapMu.Lock()
	snapID++
	req := snapID
	ch := make(chan string, 1)
	snaps[req] = ch
	snapMu.Unlock()
	defer func() { snapMu.Lock(); delete(snaps, req); snapMu.Unlock() }()
	start(C.int(req))
	select {
	case b := <-ch:
		if b == "" {
			return "", errors.New("kein Bild")
		}
		return b, nil
	case <-time.After(15 * time.Second):
		return "", errors.New("Zeitüberschreitung")
	}
}

// Snapshot liefert ein JPEG der Seite als data-URL (damit die Oberfläche kurz über der Seite zeichnen kann).
func Snapshot(id int) (string, error) {
	b, err := snapshotVia(func(req C.int) { C.fmwSnapshot(C.int(id), req) })
	if err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + b, nil
}

// Screenshot legt die Seite (id >= 0) oder den Seitenbereich der Oberfläche (id < 0) in die Zwischenablage
// und liefert eine Vorschau als Base64-JPEG.
func Screenshot(id int) (string, error) {
	return snapshotVia(func(req C.int) { C.fmwScreenshot(C.int(id), req) })
}

// PlaySound spielt eingebettete Audiodaten (z. B. mp3) ab.
func PlaySound(data []byte) {
	if len(data) == 0 {
		return
	}
	C.fmwPlaySound(unsafe.Pointer(&data[0]), C.int(len(data)))
}

// Authenticate verlangt Touch ID oder das Mac-Passwort. Nur false, wenn der Nutzer ablehnt.
// Ist auf dem Mac keine Geräteauthentifizierung eingerichtet, kommt ErrAuthUnavailable.
func Authenticate(reason string) (bool, error) {
	c := C.CString(reason)
	defer C.free(unsafe.Pointer(c))
	switch C.fmwAuthenticate(c) {
	case 0:
		return true, nil
	case 2:
		return false, ErrAuthUnavailable
	}
	return false, nil
}

var ErrAuthUnavailable = errors.New("Auf diesem Mac ist weder Touch ID noch ein Anmeldepasswort eingerichtet.")

// SetWriteSound hinterlegt den Schreibton, der beim Zeichnen von Gesten in Schleife läuft.
func SetWriteSound(data []byte) {
	if len(data) == 0 {
		return
	}
	C.fmwSetWriteSound(unsafe.Pointer(&data[0]), C.int(len(data)))
}

// WriteSound startet oder beendet den Schreibton.
func WriteSound(on bool) {
	v := 0
	if on {
		v = 1
	}
	C.fmwWriteSound(C.int(v))
}

// ConfigureGesture schleust das Mausgesten-Skript in jede Seite ein (src leer = nur Ein/Aus ändern).
func ConfigureGesture(src string, on bool) {
	c := C.CString(src)
	defer C.free(unsafe.Pointer(c))
	v := 0
	if on {
		v = 1
	}
	C.fmwConfigureGesture(c, C.int(v))
}

// Evaluate runs only the trusted, generated MCP operation script.
func Evaluate(id int, script string) (string, error) {
	source := C.CString(script)
	defer C.free(unsafe.Pointer(source))
	return snapshotVia(func(req C.int) { C.fmwEvaluate(C.int(id), source, req) })
}

func SetDockIcon(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	p := C.CBytes(data)
	defer C.free(p)
	return C.fmwSetDockIcon(p, C.int(len(data))) != 0
}

func SetErrorPalette(palette string) {
	c := C.CString(palette)
	defer C.free(unsafe.Pointer(c))
	C.fmwSetErrorPalette(c)
}

func OnboardingClipboard(tab int, provider string, previousCount int) string {
	c := C.CString(provider)
	defer C.free(unsafe.Pointer(c))
	result := C.fmwOnboardingClipboard(C.int(tab), c, C.int(previousCount))
	defer C.free(unsafe.Pointer(result))
	return C.GoString(result)
}

// CredentialsSupported tells the UI that this platform can capture and fill logins.
const CredentialsSupported = true

var (
	credMu      sync.Mutex
	credHandler func(tab int, origin, username, password string)
)

// SetCredentialHandler receives login forms the user submitted. The password reaches only this
// handler and never the event stream that goes to the UI.
func SetCredentialHandler(f func(tab int, origin, username, password string)) {
	credMu.Lock()
	credHandler = f
	credMu.Unlock()
}

//export goCredSubmit
func goCredSubmit(tab C.int, origin, user, pass *C.char) {
	o, u, p := C.GoString(origin), C.GoString(user), C.GoString(pass)
	credMu.Lock()
	f := credHandler
	credMu.Unlock()
	if f != nil {
		go f(int(tab), o, u, p)
	}
}

// ConfigureCredentials installs the form detection script in its own isolated JavaScript world.
func ConfigureCredentials(src string) {
	c := C.CString(src)
	defer C.free(unsafe.Pointer(c))
	C.fmwConfigureCredentials(c)
}

// FillResult describes what a fill attempt changed. It never contains the password.
type FillResult struct {
	OK       bool   `json:"ok"`
	Username bool   `json:"username"`
	Password bool   `json:"password"`
	Error    string `json:"error,omitempty"`
}

// FillCredential fills the login form of a tab, but only while the tab still shows exactly origin.
func FillCredential(tab int, origin, username, password string) (FillResult, error) {
	o, u, p := C.CString(origin), C.CString(username), C.CString(password)
	defer C.free(unsafe.Pointer(o))
	defer C.free(unsafe.Pointer(u))
	defer C.free(unsafe.Pointer(p))
	raw, err := snapshotVia(func(req C.int) { C.fmwFillCredential(C.int(tab), o, u, p, req) })
	if err != nil {
		return FillResult{}, err
	}
	var result FillResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return FillResult{}, errors.New("Das Ausfüllen hat keine gültige Antwort geliefert.")
	}
	return result, nil
}
