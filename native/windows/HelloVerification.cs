using Windows.Security.Credentials.UI;

namespace Luna.Windows;

// Hello requires a top-level window belonging to the process making the call.
// The embedded WebView host and the Go browser HWND cannot serve as that owner.
static class HelloVerification
{
    public static async Task<string> Request(IntPtr browser, string reason, Func<string,string>? translate = null)
    {
        if (await UserConsentVerifier.CheckAvailabilityAsync() != UserConsentVerifierAvailability.Available)
            return "unavailable";
        return await WithWindow(browser, async window =>
        {
            var result = await UserConsentVerifierInterop.RequestVerificationForWindowAsync(window, reason);
            return result == UserConsentVerificationResult.Verified ? "verified" : "denied";
        }, translate);
    }

    internal static async Task<string> WithWindow(IntPtr browser, Func<IntPtr, Task<string>> verify, Func<string,string>? translate = null)
    {
        translate ??= text => text;
        using var owner = new Form
        {
            Text = translate("Luna · KI-Zugriff bestätigen"), Width = 420, Height = 150,
            FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false,
            MinimizeBox = false, ShowInTaskbar = false, StartPosition = FormStartPosition.CenterScreen
        };
        owner.Controls.Add(new Label { Text = translate("Bitte bestätige den KI-Zugriff mit Windows Hello."), Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter });
        bool pending = true;
        owner.FormClosing += (_, e) => { if (pending) e.Cancel = true; };
        owner.Show(new WindowOwner(browser));
        try { return await verify(owner.Handle); }
        finally { pending = false; owner.Close(); }
    }
    sealed class WindowOwner(IntPtr handle) : IWin32Window { public IntPtr Handle => handle; }
}
