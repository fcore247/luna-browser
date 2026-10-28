package main

import (
	"browser-mac/internal/browsermcp"
	"browser-mac/internal/buildinfo"
	"browser-mac/internal/secret"
	"browser-mac/internal/web"
	"context"
	"embed"
	"fmt"
	"os"
	"runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

// Kamera-Sound für den Screenshot (S-Geste).
//
//go:embed assets/shutter.mp3
var shutterSound []byte

// Schreibton (läuft in Schleife, solange eine Geste gezeichnet wird) und Klickton der Maus-Demo im Setup.
//
//go:embed assets/write.mp3
var writeSound []byte

//go:embed assets/click.mp3
var clickSound []byte

// Kern der Mausgeste: dieselbe Datei läuft in der Oberfläche und – von hier eingeschleust – in jeder Webseite.
//
//go:embed frontend/src/gesture-core.js
var gestureCore string

//go:embed frontend/src/page-control.js
var pageControl string

// Formular-Erkennung und Ausfüllen des Passwort-Tresors (läuft in einer getrennten JavaScript-Welt der Seite).
//
//go:embed frontend/src/credential-capture.js
var credentialCapture string

// buildMenu: Tastenkürzel müssen im Menü liegen, damit sie auch gelten, wenn eine Webseite den Fokus hat.
// Jeder Eintrag schickt ein "cmd"-Ereignis ans Frontend.
func buildMenu(app *App) *menu.Menu {
	if runtime.GOOS != "darwin" {
		return nil
	}
	cmd := func(name string) menu.Callback {
		return func(*menu.CallbackData) { app.emit("cmd", name) }
	}
	m := menu.NewMenu()
	m.Append(menu.AppMenu())

	file := m.AddSubmenu(app.label("Ablage"))
	file.AddText(app.label("Neuer Tab"), keys.CmdOrCtrl("t"), cmd("new-tab"))
	file.AddText(app.label("Tab schließen"), keys.CmdOrCtrl("w"), cmd("close-tab"))
	file.AddSeparator()
	file.AddText(app.label("Einstellungen …"), keys.CmdOrCtrl(","), cmd("settings"))
	file.AddSeparator()
	file.AddText(app.label("Adresse öffnen"), keys.CmdOrCtrl("l"), cmd("focus-url"))
	file.AddText(app.label("Auf der Seite suchen"), keys.CmdOrCtrl("f"), cmd("find"))

	m.Append(menu.EditMenu())

	view := m.AddSubmenu(app.label("Darstellung"))
	view.AddText(app.label("Seite neu laden"), keys.CmdOrCtrl("r"), cmd("reload"))
	view.AddText(app.label("Laden stoppen"), keys.CmdOrCtrl("."), cmd("stop"))
	view.AddSeparator()
	view.AddText(app.label("Größer"), keys.CmdOrCtrl("="), cmd("zoom-in"))
	view.AddText(app.label("Kleiner"), keys.CmdOrCtrl("-"), cmd("zoom-out"))
	view.AddText(app.label("Tatsächliche Größe"), keys.CmdOrCtrl("0"), cmd("zoom-reset"))
	view.AddText(app.label("Dunkelmodus umschalten"), keys.Combo("d", keys.CmdOrCtrlKey, keys.ShiftKey), cmd("toggle-theme"))
	view.AddSeparator()
	view.AddText(app.label("Seitenleiste ein/aus"), keys.CmdOrCtrl("\\"), cmd("toggle-side"))
	view.AddText(app.label("Lesezeichenleiste ein/aus"), keys.Combo("b", keys.CmdOrCtrlKey, keys.ShiftKey), cmd("toggle-bar"))

	hist := m.AddSubmenu(app.label("Verlauf"))
	hist.AddText(app.label("Zurück"), keys.CmdOrCtrl("["), cmd("back"))
	hist.AddText(app.label("Vorwärts"), keys.CmdOrCtrl("]"), cmd("forward"))
	hist.AddSeparator()
	hist.AddText(app.label("Verlauf anzeigen"), keys.CmdOrCtrl("y"), cmd("show-history"))
	hist.AddText(app.label("Downloads anzeigen"), keys.Combo("l", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cmd("show-downloads"))

	view.AddText(app.label("Screenshot der Seite kopieren"), keys.Combo("s", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cmd("screenshot"))
	view.AddText(app.label("Notizzettel ein/aus"), keys.Combo("n", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cmd("toggle-notes"))

	bm := m.AddSubmenu(app.label("Lesezeichen"))
	bm.AddText(app.label("Lesezeichen hinzufügen"), keys.CmdOrCtrl("d"), cmd("bookmark"))
	bm.AddText(app.label("Lesezeichen anzeigen"), keys.Combo("b", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cmd("show-bookmarks"))

	win := m.AddSubmenu(app.label("Fenster"))
	win.AddText(app.label("Nächster Tab"), keys.Combo("\uf703", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cmd("next-tab"))
	win.AddText(app.label("Vorheriger Tab"), keys.Combo("\uf702", keys.CmdOrCtrlKey, keys.OptionOrAltKey), cmd("prev-tab"))
	win.AddSeparator()
	for i := 1; i <= 9; i++ {
		win.AddText(fmt.Sprintf("Tab %d", i), keys.CmdOrCtrl(fmt.Sprint(i)), cmd(fmt.Sprintf("tab-%d", i)))
	}
	return m
}

func main() {
	if buildinfo.TestMode == "1" {
		os.Setenv("LUNA_TEST_MODE", "1")
	}
	if handlePlatformCommand() {
		return
	}
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--mcp":
			dir, err := userProfileRoot()
			if err == nil {
				err = browsermcp.RunBridge(context.Background(), secret.New(dir))
			}
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		case "--mcp-setup-prompt":
			exe, _ := os.Executable()
			fmt.Print(browsermcp.SetupPrompt(exe))
			return
		}
	}
	app := NewApp()
	width, height := platformWindowSize()
	err := wails.Run(&options.App{
		Title:     platformTitle(),
		Frameless: runtime.GOOS == "windows",
		// WebView2 must have a visible parent before Windows can focus its
		// controller. Starting hidden races the first native focus request.
		StartHidden:      false,
		Width:            width,
		Height:           height,
		MinWidth:         min(760, width),
		MinHeight:        min(480, height),
		BackgroundColour: &options.RGBA{R: 239, G: 182, B: 213, A: 1},
		AssetServer:      &assetserver.Options{Assets: assets},
		OnStartup:        app.startup,
		OnDomReady: func(ctx context.Context) {
			platformWindowReady(ctx)
			if os.Getenv("LUNA_TEST_MODE") != "1" {
				web.StartUpdates()
			}
		},
		OnShutdown: app.shutdown,
		Bind:       []interface{}{app},
		Menu:       buildMenu(app),
		Mac:        &mac.Options{TitleBar: mac.TitleBarHiddenInset()},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
