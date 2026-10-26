package extensions

import "testing"

func TestKnownMacCompatibilityGaps(t *testing.T) {
	vpn := Compatibility(Entry{Permissions: []string{"storage", "proxy"}}, "darwin")
	if !vpn.Unsupported || vpn.Compatibility == "" || vpn.CompatibilityLevel != "unsupported" {
		t.Fatal("missing VPN compatibility notice")
	}
	auth := Compatibility(Entry{Permissions: []string{"identity"}}, "darwin")
	if auth.Unsupported || auth.Compatibility == "" || auth.CompatibilityLevel != "limited" {
		t.Fatal("identity should warn without blocking the popup")
	}
	for _, test := range []struct {
		entry    Entry
		platform string
	}{{Entry{Permissions: []string{"storage"}}, "darwin"}, {Entry{Permissions: []string{"proxy"}}, "windows"}} {
		entry := Compatibility(test.entry, test.platform)
		if entry.Unsupported || entry.Compatibility != "" || entry.CompatibilityLevel != "clear" {
			t.Fatal("unrelated extension or platform incorrectly blocked")
		}
	}
}
