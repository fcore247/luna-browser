package extensions

// Compatibility reports known engine gaps, rather than implying that loading a
// package means its browser-specific features are operational.
func Compatibility(entry Entry, platform string) Entry {
	entry.CompatibilityLevel = "clear"
	if platform != "darwin" {
		return entry
	}
	for _, permission := range entry.Permissions {
		if permission == "proxy" {
			entry.Unsupported = true
			entry.CompatibilityLevel = "unsupported"
			entry.Compatibility = "Auf dem Mac nicht unterstützt: Diese Erweiterung benötigt Chrome-Proxy-Funktionen. Ihre VPN-Verbindung funktioniert in Luna derzeit nicht."
			return entry
		}
	}
	for _, permission := range entry.Permissions {
		if permission == "identity" {
			entry.CompatibilityLevel = "limited"
			entry.Compatibility = "Eingeschränkt kompatibel: Chrome-Anmeldungen über chrome.identity funktionieren in Luna auf dem Mac derzeit nicht."
			return entry
		}
	}
	return entry
}
