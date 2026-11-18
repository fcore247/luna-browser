// Package opennava delivers programme links to an explicitly selected OpenNava TV.
package opennava

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const provider = "content://site.navatv.launcher.companion"

type Device struct {
	Serial string `json:"serial"`
	Name   string `json:"name"`
}

type adbCommand func(context.Context, ...string) (string, error)

func findADB() (string, error) {
	name := "adb"
	if runtime.GOOS == "windows" {
		name = "adb.exe"
	}
	if path, err := exec.LookPath(name); err == nil {
		return path, nil
	}
	home, _ := os.UserHomeDir()
	var dirs []string
	for _, root := range []string{os.Getenv("ANDROID_HOME"), os.Getenv("ANDROID_SDK_ROOT")} {
		if root != "" {
			dirs = append(dirs, filepath.Join(root, "platform-tools"))
		}
	}
	switch runtime.GOOS {
	case "darwin":
		dirs = append(dirs, filepath.Join(home, "Library/Android/sdk/platform-tools"), "/opt/homebrew/bin", "/usr/local/bin")
	case "windows":
		if root := os.Getenv("LOCALAPPDATA"); root != "" {
			dirs = append(dirs, filepath.Join(root, "Android/Sdk/platform-tools"))
		}
	}
	for _, dir := range dirs {
		if path, err := exec.LookPath(filepath.Join(dir, name)); err == nil {
			return path, nil
		}
	}
	return "", errors.New("Installiere die Android SDK Platform-Tools, damit Luna den Fernseher erreichen kann.")
}

func runADB(ctx context.Context, args ...string) (string, error) {
	path, err := findADB()
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	b, err := exec.CommandContext(ctx, path, args...).Output()
	if err != nil {
		return "", errors.New("TV nicht erreichbar. Prüfe die Verbindung in OpenNava Studio.")
	}
	return strings.TrimSpace(string(b)), nil
}

// A manual connection is deliberately limited to one user-entered local IP.
func (m *Manager) Connect(ctx context.Context, input string) error {
	raw := strings.TrimSpace(input)
	addr, err := netip.ParseAddr(raw)
	port := uint16(5555)
	if err != nil {
		endpoint, e := netip.ParseAddrPort(raw)
		if e != nil {
			return errors.New("Gib die lokale IP-Adresse des TVs ein, bei Bedarf mit Port.")
		}
		addr, port = endpoint.Addr(), endpoint.Port()
	}
	addr = addr.Unmap()
	if port == 0 || !(addr.IsPrivate() || addr.IsLinkLocalUnicast()) {
		return errors.New("Gib die lokale IP-Adresse des TVs ein, bei Bedarf mit Port.")
	}
	endpoint := netip.AddrPortFrom(addr, port).String()
	out, err := m.adb(ctx, "connect", endpoint)
	if err != nil {
		return err
	}
	if out != "connected to "+endpoint && out != "already connected to "+endpoint {
		return errors.New("Der TV hat die Verbindung noch nicht bestätigt. Prüfe die IP-Adresse und erlaube ADB-Debugging am TV.")
	}
	return nil
}

func (m *Manager) Devices(ctx context.Context) ([]Device, error) {
	result, err := m.adb(ctx, "devices", "-l")
	if err != nil {
		return nil, err
	}
	devices := []Device{}
	for _, line := range strings.Split(result, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || fields[1] != "device" || strings.HasPrefix(fields[0], "-") {
			continue
		}
		name := fields[0]
		for _, f := range fields[2:] {
			if model, ok := strings.CutPrefix(f, "model:"); ok {
				name = strings.ReplaceAll(model, "_", " ")
				if name == "AFTKRT" {
					name = "Fire TV Stick 4K Max"
				}
			}
		}
		devices = append(devices, Device{Serial: fields[0], Name: name})
	}
	return devices, nil
}

func (m *Manager) hardwareID(ctx context.Context, serial string) (string, error) {
	id, err := m.adb(ctx, "-s", serial, "shell", "getprop", "ro.serialno")
	if err != nil {
		return "", err
	}
	if id != "" && id != "unknown" {
		return "serial:" + id, nil
	}
	id, err = m.adb(ctx, "-s", serial, "shell", "settings", "get", "secure", "android_id")
	if err != nil || id == "" || id == "null" {
		return "", errors.New("Die Gerätekennung des TVs konnte nicht gelesen werden.")
	}
	return "android:" + id, nil
}

func (m *Manager) verifyTarget(ctx context.Context, target target) error {
	id, err := m.hardwareID(ctx, target.Serial)
	// ADB can drop a previously authorised Wi-Fi transport when the stick sleeps.
	// Reconnect only the saved endpoint and verify the physical device again before delivery.
	if host, port, parseErr := net.SplitHostPort(target.Serial); err != nil && parseErr == nil && host != "" {
		n, e := strconv.Atoi(port)
		if e == nil && n > 0 && n <= 65535 {
			if _, e = m.adb(ctx, "connect", target.Serial); e == nil {
				id, err = m.hardwareID(ctx, target.Serial)
			}
		}
	}
	if err != nil {
		return err
	}
	if id != target.Hardware {
		return errors.New("Unter dieser Adresse antwortet ein anderer Fernseher.")
	}
	return nil
}

func (m *Manager) send(ctx context.Context, serial string, item Item) error {
	b, err := json.Marshal(item)
	if err != nil {
		return err
	}
	out, err := m.adb(ctx, "-s", serial, "shell", "content", "call", "--uri", provider, "--method", "luna_save", "--arg", base64.RawURLEncoding.EncodeToString(b))
	if err != nil {
		return err
	}
	if !ack(out, "saved") {
		return errors.New("OpenNava hat die Vormerkung nicht bestätigt. Prüfe die Merkliste und die App-Version am TV.")
	}
	return nil
}

// Android's content command normally prefixes the Bundle with "Result:".
func ack(out, key string) bool {
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(out), "Result:")) == "Bundle[{"+key+"=true}]"
}
