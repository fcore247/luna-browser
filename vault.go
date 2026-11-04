package main

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"browser-mac/internal/vault"
	"browser-mac/internal/web"
)

// A submitted login waits here (in memory only) until the user saves or ignores it.
// The password never reaches the UI: the frontend only learns origin and user name.
type vaultOffer struct {
	Origin, Username, Password string
	Time                       time.Time
}

type vaultState struct {
	mu     sync.Mutex
	vault  *vault.Vault
	err    string
	offers map[int]vaultOffer
}

const vaultOfferTTL = 10 * time.Minute

type VaultStatus struct {
	Supported bool   `json:"supported"`
	Ready     bool   `json:"ready"`
	Error     string `json:"error,omitempty"`
	Count     int    `json:"count"`
	Offers    bool   `json:"offers"`
}

type VaultOfferInfo struct {
	Tab      int    `json:"tab"`
	Origin   string `json:"origin"`
	Username string `json:"username"`
	Update   bool   `json:"update"`
}

type VaultFillResult struct {
	Filled   bool   `json:"filled"`
	Username bool   `json:"username"`
	Password bool   `json:"password"`
	Message  string `json:"message,omitempty"`
}

func (a *App) initVault(dir string) {
	a.vaultData.offers = map[int]vaultOffer{}
	if !web.CredentialsSupported {
		return
	}
	v, err := vault.New(dir, vault.DefaultKey(dir))
	if err != nil {
		a.vaultData.err = err.Error()
		return
	}
	a.vaultData.vault = v
	web.SetCredentialHandler(a.onCredential)
	web.ConfigureCredentials(credentialCapture)
}

func (a *App) vaultOffersEnabled() bool {
	prefs := a.st.Prefs()
	return prefs["vaultOffers"] || !hasPref(prefs, "vaultOffers")
}

func (a *App) onCredential(tab int, rawOrigin, username, password string) {
	v := a.vaultData.vault
	if v == nil || !a.vaultOffersEnabled() {
		return
	}
	origin, err := vault.Origin(rawOrigin)
	if err != nil {
		return
	}
	// A login that is already stored unchanged is not worth a question.
	if same, err := v.Matches(origin, username, password); err == nil && same {
		return
	}
	a.vaultData.mu.Lock()
	a.vaultData.offers[tab] = vaultOffer{Origin: origin, Username: username, Password: password, Time: time.Now()}
	a.vaultData.mu.Unlock()
	info, _ := json.Marshal(VaultOfferInfo{Tab: tab, Origin: origin, Username: username, Update: v.Has(origin, username)})
	a.emit("vault-offer", string(info))
}

func (a *App) dropOffer(tab int) {
	a.vaultData.mu.Lock()
	delete(a.vaultData.offers, tab)
	a.vaultData.mu.Unlock()
}

func (a *App) takeOffer(tab int) (vaultOffer, bool) {
	a.vaultData.mu.Lock()
	defer a.vaultData.mu.Unlock()
	offer, ok := a.vaultData.offers[tab]
	delete(a.vaultData.offers, tab)
	if !ok || time.Since(offer.Time) > vaultOfferTTL {
		return vaultOffer{}, false
	}
	return offer, true
}

func (a *App) VaultStatus() VaultStatus {
	status := VaultStatus{Supported: web.CredentialsSupported, Error: a.vaultData.err, Offers: a.vaultOffersEnabled()}
	if v := a.vaultData.vault; v != nil {
		status.Ready, status.Count = true, len(v.All())
	}
	return status
}

// VaultEntries lists the saved logins for the origin of pageURL (never passwords).
func (a *App) VaultEntries(pageURL string) []vault.Entry {
	if a.vaultData.vault == nil {
		return []vault.Entry{}
	}
	return a.vaultData.vault.List(pageURL)
}

func (a *App) VaultAll() []vault.Entry {
	if a.vaultData.vault == nil {
		return []vault.Entry{}
	}
	return a.vaultData.vault.All()
}

func (a *App) VaultSavePending(tab int) (vault.Entry, error) {
	v := a.vaultData.vault
	if v == nil {
		return vault.Entry{}, errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	offer, ok := a.takeOffer(tab)
	if !ok {
		return vault.Entry{}, errors.New("Es gibt nichts zu speichern. Melde dich noch einmal an.")
	}
	entry, err := v.Add(offer.Origin, offer.Username, offer.Password)
	if err != nil {
		a.vaultData.mu.Lock()
		a.vaultData.offers[tab] = offer // keep it so the user can try again
		a.vaultData.mu.Unlock()
	}
	return entry, err
}

func (a *App) VaultDismissPending(tab int) { a.dropOffer(tab) }

// VaultFill fills the login form of a tab. It needs the user's Touch ID (or Mac password) every time,
// and the native layer checks once more that the page still has the expected origin.
func (a *App) VaultFill(tab int, pageURL, username string) (VaultFillResult, error) {
	v := a.vaultData.vault
	if v == nil {
		return VaultFillResult{}, errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	origin, err := vault.Origin(pageURL)
	if err != nil {
		return VaultFillResult{}, errors.New("Auf dieser Seite kann Luna keine Passwörter ausfüllen.")
	}
	known := false
	for _, entry := range v.List(origin) {
		known = known || entry.Username == username
	}
	if !known {
		return VaultFillResult{}, vault.ErrNotFound
	}
	host := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	reason := "Luna füllt dein Passwort für " + host + " aus"
	if a.englishUI() {
		reason = "Luna: fill in your password for " + host
	}
	ok, err := web.Authenticate(reason)
	if err != nil {
		return VaultFillResult{}, err
	}
	if !ok {
		return VaultFillResult{}, errors.New("Bestätigung abgebrochen. Es wurde nichts ausgefüllt.")
	}
	password, err := v.Password(origin, username)
	if err != nil {
		return VaultFillResult{}, err
	}
	result, err := web.FillCredential(tab, origin, username, password)
	if err != nil {
		return VaultFillResult{}, err
	}
	if !result.OK {
		switch result.Error {
		case "origin":
			return VaultFillResult{}, errors.New("Die Seite hat sich geändert. Es wurde nichts ausgefüllt.")
		case "no-form":
			return VaultFillResult{}, errors.New("Auf dieser Seite gibt es kein Anmeldeformular.")
		}
		return VaultFillResult{}, errors.New("Das Ausfüllen hat nicht geklappt.")
	}
	return VaultFillResult{Filled: true, Username: result.Username, Password: result.Password}, nil
}

func (a *App) VaultDelete(origin, username string) error {
	if a.vaultData.vault == nil {
		return errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	return a.vaultData.vault.Delete(origin, username)
}

// VaultDeleteAll wipes the vault after Touch ID (or the Mac password).
func (a *App) VaultDeleteAll() error {
	if a.vaultData.vault == nil {
		return errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	ok, err := web.Authenticate(a.label("Luna: alle gespeicherten Passwörter löschen"))
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("Bestätigung abgebrochen. Es wurde nichts gelöscht.")
	}
	return a.vaultData.vault.DeleteAll()
}
