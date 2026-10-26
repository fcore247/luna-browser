package browsermcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The password vault must stay out of reach of every AI client: no tool for it, and no way to open
// its settings list (which shows which accounts the user has) through browser_settings.
func TestMCPCannotReachThePasswordVault(t *testing.T) {
	s := NewServer(func(ctx context.Context, name string, args map[string]any) (any, error) {
		return map[string]any{"tool": name}, nil
	})
	h := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return s }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	server := httptest.NewServer(Protect("test-token", h))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: server.URL + "/mcp", HTTPClient: &http.Client{Transport: testAuth{http.DefaultTransport, "test-token"}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	list, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range list.Tools {
		name := strings.ToLower(tool.Name)
		if strings.Contains(name, "vault") || strings.Contains(name, "password") || strings.Contains(name, "credential") || strings.Contains(name, "passwort") {
			t.Errorf("tool %q exposes the password vault", tool.Name)
		}
		raw, _ := json.Marshal(tool.InputSchema)
		if tool.Name == "browser_settings" && strings.Contains(string(raw), "passwords") {
			t.Error("browser_settings must not offer the password chapter")
		}
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "browser_settings", Arguments: map[string]any{"section": "passwords"}})
	if err != nil {
		return // refused at protocol level
	}
	if !result.IsError {
		t.Error("browser_settings accepted the passwords chapter")
	}
}
