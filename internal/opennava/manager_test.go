package opennava

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"

	"browser-mac/internal/secret"
)

func TestQueueSurvivesOfflineRestartAndAddressReuse(t *testing.T) {
	store := secret.New(t.TempDir())
	m := New(store)
	ctx := context.Background()
	const selected = "192.0.2.7:5555"
	hardware, acknowledge := "fire-one", false
	var delivered []Item
	fake := func(_ context.Context, args ...string) (string, error) {
		if slices.Equal(args, []string{"devices", "-l"}) {
			return "List of devices attached\n192.0.2.99:5555 device model:Other\n" + selected + " device product:fire model:AFTKRT\n", nil
		}
		if args[0] != "-s" || args[1] != selected {
			t.Fatalf("Unexpected target: %v", args)
		}
		if args[3] == "getprop" {
			return hardware, nil
		}
		if args[3] != "content" || args[6] != provider {
			t.Fatalf("Unexpected command %v", args)
		}
		switch args[8] {
		case "luna_status":
			return "Result: Bundle[{ready=true}]", nil
		case "luna_save":
			if !acknowledge {
				return "Result: Bundle[{saved=false}]", nil
			}
			b, err := base64.RawURLEncoding.DecodeString(args[10])
			if err != nil {
				t.Fatal(err)
			}
			var item Item
			if err = json.Unmarshal(b, &item); err != nil {
				t.Fatal(err)
			}
			delivered = append(delivered, item)
			return "Result: Bundle[{saved=true}]", nil
		default:
			return "", errors.New("unexpected method")
		}
	}
	m.adb = fake
	if err := m.Pair(ctx, selected); err != nil {
		t.Fatal(err)
	}
	if err := m.Add("https://www.netflix.com/browse?jbv=12345678", "Die Serie"); err != nil {
		t.Fatal(err)
	}
	if err := m.Add("https://netflix.com/de/watch/12345678?track=ignored", "Die Serie"); err != nil {
		t.Fatal(err)
	}
	m.deliver(ctx)
	m = New(store)
	m.adb = fake
	s, err := m.Status()
	if err != nil || s.Device.Serial != selected || len(s.Pending) != 1 {
		t.Fatalf("Restored: %+v %v", s, err)
	}
	acknowledge = true
	hardware = "different-stick"
	m.deliver(ctx)
	if len(delivered) != 0 {
		t.Fatal("delivered to different hardware")
	}
	if err := m.Forget(); err == nil {
		t.Fatal("forgot target with pending items")
	}
	hardware = "fire-one"
	m.deliver(ctx)
	s, err = New(store).Status()
	if err != nil || len(s.Pending) != 0 || len(delivered) != 1 || delivered[0] != (Item{Title: "Die Serie", URL: "https://www.netflix.com/title/12345678"}) {
		t.Fatalf("Delivery: %+v %+v %v", delivered, s, err)
	}
}

func TestProgrammeLinks(t *testing.T) {
	for _, tc := range []struct{ in, out string }{
		{"https://ardmediathek.de/video/ein-film/abc?utm=x", "https://www.ardmediathek.de/video/ein-film/abc"},
		{"https://www.arte.tv/de/videos/ABC/serie/#Play", "https://www.arte.tv/de/videos/ABC/serie/"},
		{"https://www.zdf.de/filme/example-100?foo=bar", "https://www.zdf.de/filme/example-100"},
		{"https://netflix.com/de-en/watch/12345678", "https://www.netflix.com/title/12345678"},
	} {
		i, err := programme(tc.in, "Nächte")
		if err != nil || i.URL != tc.out {
			t.Errorf("%s => %+v %v", tc.in, i, err)
		}
	}
	for _, raw := range []string{"https://www.netflix.com", "https://www.netflix.com/title/nope", "https://other.netflix.com/title/1", "https://foo@zdf.de/show", "http://arte.tv/de/videos/abc", "https://www.ardmediathek.de/", "file:///tmp/a", "https://www.zdf.de:8443/film"} {
		if _, err := programme(raw, "Titel"); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	if _, err := programme("https://netflix.com/title/1", strings.Repeat("🪐", 121)); err == nil {
		t.Error("overflowed TV title length")
	}
}

func TestConnectOnlyExplicitLocalAddress(t *testing.T) {
	m := New(secret.New(t.TempDir()))
	calls := 0
	m.adb = func(_ context.Context, args ...string) (string, error) {
		calls++
		if !slices.Equal(args, []string{"connect", "192.168.1.17:5555"}) {
			t.Fatalf("unexpected %v", args)
		}
		return "connected to " + args[1], nil
	}
	for _, input := range []string{"8.8.8.8", "127.0.0.1:8888", "10.0.1.1:0", "firetv.example", "10.0.1.1; adb devices"} {
		if err := m.Connect(context.Background(), input); err == nil {
			t.Error(input)
		}
	}
	if err := m.Connect(context.Background(), "192.168.1.17"); err != nil || calls != 1 {
		t.Fatalf("%v (%d commands)", err, calls)
	}
}
