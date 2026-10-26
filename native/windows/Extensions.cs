using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
namespace Luna.Windows;
sealed partial class Host
{
    WebView2? extensionView;
    readonly Dictionary<string, string> extensionIDs = new();
    async Task<CoreWebView2Profile> ExtensionProfile()
    {
        environment ??= await CoreWebView2Environment.CreateAsync(null, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Luna Browser", "WebView2"), new CoreWebView2EnvironmentOptions { AreBrowserExtensionsEnabled = true });
        if (extensionView == null) {
            extensionView = new WebView2 { Visible = false, Width = 1, Height = 1 };
            Controls.Add(extensionView);
            await extensionView.EnsureCoreWebView2Async(environment);
        }
        return extensionView.CoreWebView2.Profile;
    }
    async Task<object?> Extension(string op, JsonElement args)
    {
        if (op == "supported") return "";
        var profile = await ExtensionProfile();
        var id = Str(args, "id");
        if (op == "load") {
            var added = await profile.AddBrowserExtensionAsync(Str(args,"path"));
            await added.EnableAsync(true);
            if (!added.IsEnabled) throw new InvalidOperationException("WebView2 konnte diese Erweiterung nicht aktivieren.");
            extensionIDs[id] = added.Id;
            return added.Id;
        }
        var runtimeID = extensionIDs.GetValueOrDefault(id, Str(args,"runtimeID"));
        if (op is "unload" or "remove") {
            var installed = await profile.GetBrowserExtensionsAsync();
            foreach (var entry in installed) if (entry.Id == runtimeID) { if (op == "remove") await entry.RemoveAsync(); else await entry.EnableAsync(false); }
            if (op == "remove") extensionIDs.Remove(id); return "";
        }
        if (op == "open") {
            using var manifest = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(Str(args,"path"),"manifest.json")));
            var root = manifest.RootElement; string? page = null;
            foreach (var key in new[]{"action","browser_action","page_action"})
                if (root.TryGetProperty(key,out var action) && action.TryGetProperty("default_popup",out var popup)) { page=popup.GetString(); break; }
            if (string.IsNullOrEmpty(page) && root.TryGetProperty("options_ui",out var options) && options.TryGetProperty("page",out var optionPage)) page=optionPage.GetString();
            if (string.IsNullOrEmpty(page) && root.TryGetProperty("options_page",out var legacy)) page=legacy.GetString();
            if (string.IsNullOrEmpty(page)) throw new InvalidOperationException("Diese Erweiterung arbeitet im Hintergrund und hat kein Menü.");
            if (page.StartsWith('/') || page.Contains(":") || page.Contains("..") || page.Contains('\\')) throw new InvalidOperationException("Ungültige Erweiterungsseite.");
            var form = new Form { Text="Luna · Erweiterung", Width=460, Height=620, StartPosition=FormStartPosition.CenterParent };
            var view = new WebView2 { Dock=DockStyle.Fill }; form.Controls.Add(view);
            form.FormClosed += (_,_) => view.Dispose(); form.Show();
            await view.EnsureCoreWebView2Async(environment);
            view.CoreWebView2.Navigate("chrome-extension://"+runtimeID+"/"+page);
            return "";
        }
        throw new InvalidOperationException("Unbekannte Erweiterungsaktion.");
    }
}
