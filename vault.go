package main

import (
	"crypto/rand"
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
	ID                         string
	Origin, Username, Password string
	Time                       time.Time
}

type vaultState struct {
	mu      sync.Mutex
	vault   *vault.Vault
	err     string
	offers  map[int]vaultOffer
	grants  map[int]loginGrant
	loginMu sync.Mutex
}

type loginGrant struct {
	token, origin, username, form string
	expires                       time.Time
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
	ID        string `json:"id"`
	Tab       int    `json:"tab"`
	Origin    string `json:"origin"`
	Username  string `json:"username"`
	Update    bool   `json:"update"`
	AutoLogin bool   `json:"autoLogin"`
}

type VaultFillResult struct {
	Filled       bool   `json:"filled"`
	Username     bool   `json:"username"`
	Password     bool   `json:"password"`
	Message      string `json:"message,omitempty"`
	Submitted    bool   `json:"submitted,omitempty"`
	Stage        string `json:"stage,omitempty"`
	Continuation string `json:"continuation,omitempty"`
	Deferred     bool   `json:"deferred,omitempty"`
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
	offer := vaultOffer{ID: rand.Text(), Origin: origin, Username: username, Password: password, Time: time.Now()}
	info := VaultOfferInfo{ID: offer.ID, Tab: tab, Origin: origin, Username: username, AutoLogin: true}
	for _, entry := range v.List(origin) {
		if entry.Username == username {
			info.Update, info.AutoLogin = true, entry.AutoLogin
			break
		}
		if entry.AutoLogin {
			info.AutoLogin = false
		}
	}
	a.vaultData.mu.Lock()
	defer a.vaultData.mu.Unlock()
	if prev, ok := a.vaultData.offers[tab]; ok && time.Since(prev.Time) < vaultOfferTTL &&
		prev.Origin == origin && prev.Username == username && prev.Password == password {
		return
	}
	a.vaultData.offers[tab] = offer
	id := offer.ID
	time.AfterFunc(vaultOfferTTL, func() { a.VaultDismissOffer(tab, id) })
	payload, _ := json.Marshal(info)
	a.emit("vault-offer", string(payload))
}

func (a *App) dropOffer(tab int) {
	a.vaultData.mu.Lock()
	delete(a.vaultData.offers, tab)
	delete(a.vaultData.grants, tab)
	a.vaultData.mu.Unlock()
}

func (a *App) VaultDismissOffer(tab int, id string) {
	a.vaultData.mu.Lock()
	defer a.vaultData.mu.Unlock()
	if offer, ok := a.vaultData.offers[tab]; ok && offer.ID == id {
		delete(a.vaultData.offers, tab)
	}
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
	return a.saveVaultOffer(tab, "", nil)
}

func (a *App) VaultSaveOffer(tab int, id string, autoLogin bool) (vault.Entry, error) {
	return a.saveVaultOffer(tab, id, &autoLogin)
}

func (a *App) saveVaultOffer(tab int, id string, autoLogin *bool) (vault.Entry, error) {
	v := a.vaultData.vault
	if v == nil {
		return vault.Entry{}, errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	a.vaultData.mu.Lock()
	defer a.vaultData.mu.Unlock()
	offer, ok := a.vaultData.offers[tab]
	if !ok || (autoLogin != nil && offer.ID != id) {
		return vault.Entry{}, errors.New("Es gibt nichts zu speichern. Melde dich noch einmal an.")
	}
	if time.Since(offer.Time) > vaultOfferTTL {
		delete(a.vaultData.offers, tab)
		return vault.Entry{}, errors.New("Es gibt nichts zu speichern. Melde dich noch einmal an.")
	}
	var entry vault.Entry
	var err error
	if autoLogin == nil {
		entry, err = v.Add(offer.Origin, offer.Username, offer.Password)
	} else {
		entry, err = v.SaveLogin(offer.Origin, offer.Username, offer.Password, *autoLogin)
	}
	if err == nil {
		delete(a.vaultData.offers, tab)
	}
	return entry, err
}

func (a *App) VaultDismissPending(tab int) { a.dropOffer(tab) }

func (a *App) VaultSetAutoLogin(origin, username string, enabled bool) error {
	if a.vaultData.vault == nil {
		return errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	return a.vaultData.vault.SetAutoLogin(origin, username, enabled)
}

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
	if !v.Has(origin, username) {
		return VaultFillResult{}, vault.ErrNotFound
	}
	if !a.vaultData.loginMu.TryLock() {
		return VaultFillResult{}, errors.New("Eine Anmeldung läuft bereits.")
	}
	defer a.vaultData.loginMu.Unlock()
	if err := a.authenticateLogin(origin); err != nil {
		return VaultFillResult{}, err
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

func (a *App) authenticateLogin(origin string) error {
	host := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	reason := "Luna verwendet deine Anmeldedaten für " + host
	if a.englishUI() {
		reason = "Luna: use your saved login for " + host
	}
	ok, err := web.Authenticate(reason)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("Bestätigung abgebrochen. Es wurde nichts ausgefüllt.")
	}
	return nil
}

// A continuation carries no credentials. It authorizes one password step of
// the same sign-in after the confirmed username step navigates or replaces its form.
func (s *vaultState) beginContinuation(tab int, origin, username, form string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.grants == nil {
		s.grants = make(map[int]loginGrant)
	}
	grant := loginGrant{token: rand.Text(), origin: origin, username: username, form: form, expires: time.Now().Add(90 * time.Second)}
	s.grants[tab] = grant
	return grant.token
}

func (s *vaultState) consumeContinuation(tab int, origin, username, form, token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	grant, ok := s.grants[tab]
	delete(s.grants, tab)
	return ok && token != "" && grant.token == token && grant.origin == origin &&
		grant.username == username && grant.form != form && time.Now().Before(grant.expires)
}

func (a *App) VaultLogin(tab int, pageURL, username, form string, automatic bool, continuation string) (VaultFillResult, error) {
	v := a.vaultData.vault
	if v == nil {
		return VaultFillResult{}, errors.New("Der Passwort-Tresor ist nicht verfügbar.")
	}
	origin, err := vault.Origin(pageURL)
	if err != nil || form == "" || len(form) > 256 {
		return VaultFillResult{}, errors.New("Das Anmeldeformular ist nicht mehr verfügbar.")
	}
	if !a.vaultData.loginMu.TryLock() {
		return VaultFillResult{}, errors.New("Eine Anmeldung läuft bereits.")
	}
	defer a.vaultData.loginMu.Unlock()
	allowed := func() bool {
		for _, entry := range v.List(origin) {
			if entry.Username == username {
				return !automatic || entry.AutoLogin
			}
		}
		return false
	}
	if !allowed() {
		return VaultFillResult{}, vault.ErrNotFound
	}
	probe, err := web.ProbeLogin(tab, origin, username, form)
	if err != nil {
		return VaultFillResult{}, err
	}
	if !probe.OK && probe.Error == "tab" {
		return VaultFillResult{Deferred: true}, nil
	}
	if !probe.OK || (probe.Stage != "username" && probe.Stage != "password") {
		return VaultFillResult{}, errors.New("Das Anmeldeformular ist nicht mehr verfügbar.")
	}
	valid := a.vaultData.consumeContinuation(tab, origin, username, form, continuation)
	if continuation != "" {
		if !valid || probe.Stage != "password" {
			return VaultFillResult{}, errors.New("Bitte starte die Anmeldung erneut.")
		}
	} else if err := a.authenticateLogin(origin); err != nil {
		return VaultFillResult{}, err
	}
	if !allowed() {
		return VaultFillResult{}, vault.ErrNotFound
	}
	var password string
	if probe.Stage == "password" {
		password, err = v.Password(origin, username)
		if err != nil {
			return VaultFillResult{}, err
		}
	}
	filled, err := web.SubmitLogin(tab, origin, username, password, form)
	if err != nil {
		return VaultFillResult{}, err
	}
	if !filled.OK {
		return VaultFillResult{}, errors.New("Das Anmeldeformular ist nicht mehr verfügbar.")
	}
	result := VaultFillResult{Filled: true, Username: filled.Username, Password: filled.Password, Submitted: filled.Submitted, Stage: filled.Stage}
	if continuation == "" && probe.Stage == "username" && filled.Stage == "username" && filled.Submitted {
		result.Continuation = a.vaultData.beginContinuation(tab, origin, username, form)
	}
	return result, nil
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
