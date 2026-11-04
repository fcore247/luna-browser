package browsermcp

import (
	"browser-mac/internal/secret"
	"context"
	"strings"
	"testing"
)

func TestPersistedConsentAndEndpointRestored(t *testing.T) {
	store := secret.New(t.TempDir())
	dispatch := func(context.Context, string, map[string]any) (any, error) { return map[string]bool{"ready": true}, nil }
	manager := New(store, dispatch)
	if err := manager.Configure(true); err != nil {
		t.Fatal(err)
	}
	endpoint := manager.Status().Endpoint
	manager.Close()
	restored := New(store, dispatch)
	defer restored.Close()
	if status := restored.Status(); !status.Enabled || !status.Running || status.Endpoint != endpoint {
		t.Fatal("saved consent/endpoint not restored")
	}
	if err := restored.Configure(false); err != nil {
		t.Fatal(err)
	}
	disabled := New(store, dispatch)
	defer disabled.Close()
	if status := disabled.Status(); status.Enabled || status.Running {
		t.Fatal("disabled consent not restored")
	}
	// This exercises the bridge's normal credential path, without reading or
	// exposing the secret file in the test or falling back to another profile.
	if err := RunBridge(context.Background(), store); err == nil || !strings.Contains(err.Error(), "ausgeschaltet") {
		t.Fatal("bridge must refuse disabled consent")
	}
}
