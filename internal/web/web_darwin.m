#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <objc/runtime.h>
#include <stdlib.h>
#include <string.h>
#include "web_darwin.h"
#import "cinema_window_darwin.h"
#import "cinema_exit_cover_darwin.h"

extern void goWebEvent(char *json);
extern void goSnapshotDone(int req, char *b64);

static NSDictionary *gLanguageMessages;
static NSString *L(NSString *source) { return gLanguageMessages[source] ?: source; }
void fmwSetLanguage(const char *messages) {
 NSData *data = [[NSString stringWithUTF8String:messages] dataUsingEncoding:NSUTF8StringEncoding];
 id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
 NSDictionary *labels = [parsed isKindOfClass:[NSDictionary class]] ? parsed : @{};
 dispatch_async(dispatch_get_main_queue(), ^{ gLanguageMessages = labels; });
}

// Ereignisse laufen asynchron auf dem Main-Thread und mit kopiertem C-String
// (ein Zeiger aus -UTF8String kann unter ARC sofort ungültig werden).
static void emit(NSDictionary *d) {
	NSData *j = [NSJSONSerialization dataWithJSONObject:d options:0 error:nil];
	if (!j) return;
	NSString *s = [[NSString alloc] initWithData:j encoding:NSUTF8StringEncoding];
	dispatch_async(dispatch_get_main_queue(), ^{
		char *c = strdup([s UTF8String]);
		goWebEvent(c);
		free(c);
	});
}
static id nn(id v) { return v ?: [NSNull null]; }

@class FMTab;
static NSMutableDictionary<NSNumber *, FMTab *> *gTabs;
static WKWebViewConfiguration *gConfig;
static CGRect gRect;
static int gActive = -1;
static int gLastWebTab = -1;
static int gNextPopup = 100000;
static int gDlSeq = 0;
static char kDlId;

static WKWebView *findWebView(NSView *root) {
 if ([root isKindOfClass:[WKWebView class]]) return (WKWebView *)root;
 for (NSView *child in root.subviews) { WKWebView *found = findWebView(child); if (found) return found; }
 return nil;
}
static __weak NSWindow *gBrowserWindow;
static NSWindow *fmWindow(void) {
 if (gBrowserWindow) return gBrowserWindow;
 // Hilfsfenster (z.B. Bildschirmfreigabe) sind keine Browserfenster.
 for (NSWindow *w in NSApp.windows) if (w.isVisible && findWebView(w.contentView)) { gBrowserWindow = w; return w; }
 for (NSWindow *w in NSApp.windows) if (findWebView(w.contentView)) { gBrowserWindow = w; return w; }
 return nil;
}

static NSString *gGestureSrc;
static int gGestureOn = 1;

// Luna verlangt macOS 13 (Info.plist), die Content-World-API gibt es seit macOS 11.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunguarded-availability-new"
// Passwort-Tresor: Formular-Erkennung und Ausfüllen laufen in einer eigenen, vom Seitenskript getrennten
// JavaScript-Welt. Die Seite kann die Funktionen weder überschreiben noch beobachten.
extern void goCredSubmit(int tab, char *origin, char *user, char *pass);
static NSString *gCredSrc;
static NSString *originOfURL(NSURL *url);
static NSString *credentialPageLocation(NSURL *url) {
	if (!url.host.length) return @"";
	NSURLComponents *parts = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:YES];
	parts.user = parts.password = parts.query = parts.fragment = nil;
	return parts.URL.absoluteString ?: @"";
}
static WKContentWorld *credWorld(void) {
	static WKContentWorld *world;
	static dispatch_once_t once;
	dispatch_once(&once, ^{ world = [WKContentWorld worldWithName:@"LunaCredentials"]; });
	return world;
}
@interface FMCredHandler : NSObject <WKScriptMessageHandler>
@end
static FMCredHandler *gCredHandler;
static void applyCredentials(WKWebViewConfiguration *c) {
	WKUserContentController *u = c.userContentController;
	if (!gCredHandler) gCredHandler = [FMCredHandler new];
	@try { [u removeScriptMessageHandlerForName:@"lunaCreds" contentWorld:credWorld()]; } @catch (id x) {}
	[u addScriptMessageHandler:gCredHandler contentWorld:credWorld() name:@"lunaCreds"];
	if (gCredSrc.length)
		[u addUserScript:[[WKUserScript alloc] initWithSource:gCredSrc injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES inContentWorld:credWorld()]];
}

// Nachrichten der Mausgeste aus den Seiten (window.webkit.messageHandlers.fmGesture)
@interface FMGestureHandler : NSObject <WKScriptMessageHandler>
@end
static FMGestureHandler *gGestureHandler;

#pragma clang diagnostic pop

@interface FMCinemaHandler : NSObject <WKScriptMessageHandler>
@end

static NSString *gCinemaScript;
static NSTimeInterval gCinemaCoverDuration = 1.0;

void fmwSetCinemaCoverDuration(double seconds) {
	NSTimeInterval duration = isfinite(seconds) && seconds >= 0 && seconds <= 60 ? seconds : 1.0;
	dispatch_async(dispatch_get_main_queue(), ^{ gCinemaCoverDuration = duration; });
}

static void installCinemaScripts(WKUserContentController *controller) API_AVAILABLE(macos(11.0)) {
	if (!gCinemaScript.length) return;
	static FMCinemaHandler *handler;
	if (!handler) handler = [FMCinemaHandler new];
	WKContentWorld *world = [WKContentWorld worldWithName:@"LunaCinema"];
	[controller removeScriptMessageHandlerForName:@"lunaCinema" contentWorld:world];
	[controller addScriptMessageHandler:handler contentWorld:world name:@"lunaCinema"];

	// Only this isolated world can call the window bridge. Check WebKit's own
	// user activation and permissions policy before honoring a site's request.
	NSString *gate =
		@"if(location.protocol==='https:' && ['youtube.com','www.youtube.com','m.youtube.com','netflix.com','www.netflix.com'].includes(location.hostname))"
		 "window.addEventListener('luna-cinema-request', e=>{"
		 "  if(typeof e.detail!=='string' || e.detail.length>256) return;"
		 "  let r; try {r=JSON.parse(e.detail)} catch {return}"
		 "  if(!r || !Number.isSafeInteger(r.id) || r.id<=0 || !['enter','exit','ready'].includes(r.action))return;"
		 "  e.preventDefault();"
		 "  const allowed=r.action!=='enter'||(navigator.userActivation?.isActive && document.fullscreenEnabled);"
		 "  window.webkit.messageHandlers.lunaCinema.postMessage({action:allowed?r.action:'denied',id:r.id});"
		 "},true)";
	[controller addUserScript:[[WKUserScript alloc] initWithSource:gate injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES inContentWorld:world]];
	[controller addUserScript:[[WKUserScript alloc] initWithSource:gCinemaScript injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
}

static void applyGesture(WKWebViewConfiguration *c) {
	WKUserContentController *u = c.userContentController;
	if (!gGestureHandler) gGestureHandler = [FMGestureHandler new];
	@try { [u removeScriptMessageHandlerForName:@"fmGesture"]; } @catch (id x) {}
	[u addScriptMessageHandler:gGestureHandler name:@"fmGesture"];
	[u removeAllUserScripts];
	if (gGestureSrc.length) {
		NSString *src = [NSString stringWithFormat:@"window.__fmGesture=%d;\n%@", gGestureOn, gGestureSrc];
		[u addUserScript:[[WKUserScript alloc] initWithSource:src injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
	}
	applyCredentials(c);
	if (@available(macOS 11.0, *)) installCinemaScripts(u);
}

void fmwConfigureCinemaScript(const char *src) {
	NSString *script = [NSString stringWithUTF8String:src];
	dispatch_async(dispatch_get_main_queue(), ^{
		gCinemaScript = script;
		if (gConfig) applyGesture(gConfig);
	});
}

static WKWebExtensionController *extensionController(void) API_AVAILABLE(macos(15.4));

static WKWebViewConfiguration *sharedConfig(void) {
	static dispatch_once_t once;
	dispatch_once(&once, ^{
		gConfig = [WKWebViewConfiguration new];
        if (@available(macOS 15.4, *)) gConfig.webExtensionController = extensionController();
		// Als Safari ausgeben, sonst blocken manche Seiten (Google u. a.) unbekannte Browser.
		gConfig.applicationNameForUserAgent = @"Version/17.4 Safari/605.1.15";
		applyGesture(gConfig);
	});
	return gConfig;
}

static NSString *gErrorPaletteCSS = @"";

static NSString *errorHTML(NSError *e, NSURL *u) {
 NSString *title = L(@"Diese Seite ist gerade nicht erreichbar.");
 NSString *reason = L(@"Luna konnte die Seite nicht laden. Die Verbindung wurde unterbrochen oder die Website antwortet gerade nicht.");
 NSString *hint = L(@"Versuche es in einem Moment noch einmal.");
 if ([e.domain isEqualToString:NSURLErrorDomain]) {
  switch (e.code) {
   case NSURLErrorServerCertificateHasBadDate:
   case NSURLErrorServerCertificateUntrusted:
   case NSURLErrorServerCertificateHasUnknownRoot:
   case NSURLErrorServerCertificateNotYetValid:
   case NSURLErrorSecureConnectionFailed:
    title = L(@"Luna fühlt sich auf dieser Seite nicht wohl.");
    reason = L(@"Luna kann die Identität dieser Website nicht sicher bestätigen. Das Sicherheitszertifikat ist möglicherweise abgelaufen, noch nicht gültig, nicht vertrauenswürdig oder gehört zu einer anderen Adresse. Auch eine gestörte verschlüsselte Verbindung kann die Ursache sein.");
    hint = L(@"Deshalb hat Luna die Seite nicht geöffnet. Prüfe die Adresse sowie Datum und Uhrzeit deines Macs. Bei einer neu eingerichteten Website ist das Zertifikat eventuell noch nicht bereit. Versuche es später erneut.");
    break;
   case NSURLErrorClientCertificateRejected:
   case NSURLErrorClientCertificateRequired:
    title = L(@"Luna fühlt sich auf dieser Seite nicht wohl.");
    reason = L(@"Diese Website verlangt ein persönliches Zugangs-Zertifikat. Es fehlt oder wurde vom Server abgelehnt.");
    hint = L(@"Wende dich an den Betreiber der Website, wenn du Zugang benötigst.");
    break;
   case NSURLErrorNotConnectedToInternet:
    reason = L(@"Dein Mac scheint gerade nicht mit dem Internet verbunden zu sein.");
    hint = L(@"Prüfe dein WLAN oder deine Netzwerkverbindung und versuche es erneut.");
    break;
   case NSURLErrorCannotFindHost:
   case NSURLErrorDNSLookupFailed:
    reason = L(@"Die Adresse dieser Website konnte nicht gefunden werden. Sie ist möglicherweise falsch geschrieben oder ihre DNS-Einträge sind noch nicht verfügbar.");
    hint = L(@"Prüfe die Schreibweise. Wurde die Domain gerade eingerichtet, versuche es später erneut.");
    break;
   case NSURLErrorTimedOut:
    reason = L(@"Die Website hat zu lange nicht geantwortet.");
    hint = L(@"Der Server ist möglicherweise ausgelastet. Versuche es gleich noch einmal.");
    break;
   default: break;
  }
 }
 NSString *(^esc)(NSString *) = ^NSString *(NSString *s) {
  s = [(s ?: @"") stringByReplacingOccurrencesOfString:@"&" withString:@"&amp;"];
  s = [s stringByReplacingOccurrencesOfString:@"<" withString:@"&lt;"];
  s = [s stringByReplacingOccurrencesOfString:@">" withString:@"&gt;"];
  return [s stringByReplacingOccurrencesOfString:@"\"" withString:@"&quot;"];
 };
 NSString *scheme = u.scheme.lowercaseString;
 NSString *retry = ([scheme isEqualToString:@"https"] || [scheme isEqualToString:@"http"]) ? [NSString stringWithFormat:@"<a href=\"%@\">%@</a>", esc(u.absoluteString), esc(L(@"Erneut versuchen"))] : @"";
 return [NSString stringWithFormat:@"<!doctype html><html lang=%@><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>%@</title><style>"
 @":root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:32px;background:#fbf2f7;color:#3a2433;font:16px -apple-system,system-ui,sans-serif}main{width:min(100%%,620px)}.mark{font-size:14px;letter-spacing:3px;font-weight:700;color:#896578;margin-bottom:32px}svg{width:52px;height:52px;margin-bottom:22px;color:#a7778e}h1{font-size:clamp(28px,5vw,42px);line-height:1.15;letter-spacing:-1px;margin:0 0 24px}p{line-height:1.65;color:#6f5264}.host{font-size:13px;overflow-wrap:anywhere}a{display:inline-block;margin-top:16px;padding:13px 21px;border-radius:24px;background:#3a2433;color:#fbeef6;text-decoration:none;font-weight:600}a:focus-visible,summary:focus-visible{outline:3px solid #a7778e;outline-offset:4px}details{margin-top:30px;color:#6f5264;font-size:13px}summary{cursor:pointer}details p{overflow-wrap:anywhere}@media(prefers-color-scheme:dark){body{background:#1c151b;color:#fbeef6}p,details{color:#bfa8b6}a{background:#edcedf;color:#2a1621}}"
 @"</style><style id=luna-error-palette>%@</style><main><div class=mark>LUNA BROWSER</div><svg aria-hidden=true viewBox=\"0 0 48 48\" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round><path d=\"M24 4 7 11v12c0 10 17 21 17 21s17-11 17-21V11Z\"/><path d=\"M24 14v12m0 7h.01\"/></svg><div class=host>%@</div><h1>%@</h1><p>%@</p><p>%@</p>%@<details><summary>%@</summary><p>%@ (%@ · %ld)</p></details></main></html>", (gLanguageMessages.count ? @"en" : @"de"), esc(title), gErrorPaletteCSS, esc(u.host), esc(title), esc(reason), esc(hint), retry, esc(L(@"Technische Details")), esc(e.localizedDescription), esc(e.domain), (long)e.code];
}

@interface FMTab : NSObject <WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKWebExtensionTab>
@property (nonatomic) int tid;
@property (nonatomic, strong) WKWebView *view;
@property (nonatomic, strong) NSView *hostView;
@property (nonatomic, strong) FMCinemaWindowSession *cinemaSession;
@property (nonatomic, strong) FMCinemaExitCover *cinemaExitCover;
@property (nonatomic, strong) FMCinemaFocus *transitionFocus;
@property (nonatomic, weak) NSView *preCinemaResponder;
@property (nonatomic) NSInteger transitionTicket;
@property (nonatomic) BOOL enteringCinema;
@property (nonatomic) BOOL cinemaSnapshotPending;
- (void)leaveCinema;
@property (nonatomic) BOOL isError;
@property (nonatomic, copy) NSString *credentialStepOrigin;
@property (nonatomic, copy) NSString *credentialStepUser;
@property (nonatomic) NSTimeInterval credentialStepTime;
- (instancetype)initWithId:(int)tid config:(WKWebViewConfiguration *)cfg;
- (void)teardown;
@end

static id extensionWindow(void) API_AVAILABLE(macos(15.4));

static BOOL cinemaSite(NSString *host) {
	static NSSet *sites;
	static dispatch_once_t once;
	dispatch_once(&once, ^{ sites = [NSSet setWithArray:@[@"youtube.com", @"www.youtube.com", @"m.youtube.com", @"netflix.com", @"www.netflix.com"]]; });
	return [sites containsObject:host.lowercaseString];
}

static void layoutTab(FMTab *t) {
	if (t.cinemaSession.active) return;
	NSView *parent = t.hostView.superview;
	if (!parent) return;
	NSRect frame = NSMakeRect(gRect.origin.x, NSMaxY(parent.bounds) - NSMaxY(gRect),
	                          gRect.size.width, gRect.size.height);
	if (!NSEqualRects(t.hostView.frame, frame)) t.hostView.frame = frame;
}

static FMTab *tabFor(int tid, WKWebViewConfiguration *cfg) {
	if (!gTabs) gTabs = [NSMutableDictionary new];
	FMTab *t = gTabs[@(tid)];
	if (!t) {
		t = [[FMTab alloc] initWithId:tid config:cfg ?: sharedConfig()];
		gTabs[@(tid)] = t;
        if (@available(macOS 15.4, *)) [extensionController() didOpenTab:t];
		layoutTab(t);
	}
	return t;
}

@implementation FMTab

- (instancetype)initWithId:(int)tid config:(WKWebViewConfiguration *)cfg {
	if (!(self = [super init])) return nil;
	_tid = tid;
	// Enable the standard Fullscreen API for every website, including popup tabs.
	if (@available(macOS 12.3, *)) cfg.preferences.elementFullscreenEnabled = YES;
	_view = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:cfg];
	_view.navigationDelegate = self;
	_view.UIDelegate = self;
	_view.allowsBackForwardNavigationGestures = YES;
	_view.allowsMagnification = YES;
	// WebKit swaps its own placeholder for the live page during the fullscreen
	// zoom. Keep the destination and its rounded clipping in the browser window.
	_hostView = [[NSView alloc] initWithFrame:NSZeroRect];
	_hostView.wantsLayer = YES;
	_hostView.layer.cornerRadius = 12;
	_hostView.layer.masksToBounds = YES;
	_hostView.hidden = (tid != gActive);
	_view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
	[_hostView addSubview:_view];
	[fmWindow().contentView addSubview:_hostView positioned:NSWindowAbove relativeTo:nil];
	for (NSString *k in @[@"title", @"URL", @"loading", @"estimatedProgress", @"canGoBack", @"canGoForward"])
		[_view addObserver:self forKeyPath:k options:0 context:NULL];
	_cinemaSession = [FMCinemaWindowSession new];
	// Only one tab can occupy this browser window. Share its full-display bitmap.
	static FMCinemaExitCover *exitCover;
	if (!exitCover) exitCover = [FMCinemaExitCover new];
	_cinemaExitCover = exitCover;
	return self;
}

- (WKWebView *)webViewForWebExtensionContext:(WKWebExtensionContext *)context API_AVAILABLE(macos(15.4)) { return _view; }
- (id<WKWebExtensionWindow>)windowForWebExtensionContext:(WKWebExtensionContext *)context API_AVAILABLE(macos(15.4)) { if (@available(macOS 15.4, *)) return extensionWindow(); return nil; }
- (NSString *)titleForWebExtensionContext:(WKWebExtensionContext *)context API_AVAILABLE(macos(15.4)) { return _view.title; }
- (NSURL *)urlForWebExtensionContext:(WKWebExtensionContext *)context API_AVAILABLE(macos(15.4)) { return _view.URL; }
- (BOOL)isLoadingCompleteForWebExtensionContext:(WKWebExtensionContext *)context API_AVAILABLE(macos(15.4)) { return !_view.loading; }
- (BOOL)isSelectedForWebExtensionContext:(WKWebExtensionContext *)context API_AVAILABLE(macos(15.4)) { return _tid == (gActive >= 0 ? gActive : gLastWebTab); }
- (void)loadURL:(NSURL *)url forWebExtensionContext:(WKWebExtensionContext *)context completionHandler:(void (^)(NSError *))done API_AVAILABLE(macos(15.4)) { [_view loadRequest:[NSURLRequest requestWithURL:url]]; done(nil); }
- (void)reloadFromOrigin:(BOOL)origin forWebExtensionContext:(WKWebExtensionContext *)context completionHandler:(void (^)(NSError *))done API_AVAILABLE(macos(15.4)) { [_view reload]; done(nil); }

- (void)replyToCinemaRequest:(NSInteger)request state:(NSString *)state {
	NSString *reply = [NSString stringWithFormat:@"window.__lunaCinemaReply?.(%ld,'%@')", (long)request, state];
	[_view evaluateJavaScript:reply completionHandler:nil];
}

- (void)finishCinemaTransition:(NSInteger)ticket {
	if (ticket <= 0 || ticket != _transitionTicket) return;
	FMCinemaFocus *focus = _transitionFocus;
	if (!_enteringCinema && _tid == gActive) [focus orderPlayerFrontForReveal];
	[_cinemaExitCover dismissTicket:ticket];
	_transitionTicket = 0;
	_cinemaSnapshotPending = NO;
	if (!focus || _tid != gActive) {
		_transitionFocus = nil;
		return;
	}
	[focus restoreAfterResize:NO];
	// WindowServer and AppKit can finish changing the key window after
	// orderOut returns. Skip the follow-up if another transition has begun.
	dispatch_async(dispatch_get_main_queue(), ^{
		if (self.transitionFocus != focus) return;
		if (self.tid == gActive) {
			[focus restoreAfterResize:NO];
			if (focus.playerHasKeyboardFocus) {
				NSString *js = [NSString stringWithFormat:@"window.__lunaCinemaRestoreFocus?.(%ld)", (long)ticket];
				[self.view evaluateJavaScript:js completionHandler:nil];
			}
		}
		self.transitionFocus = nil;
	});
}

- (void)leaveCinema {
	_transitionFocus = nil;
	_preCinemaResponder = nil;
	if (!_cinemaSession.active && !_transitionTicket) return;
	[self finishCinemaTransition:_transitionTicket];
	[_cinemaSession end];
	[self replyToCinemaRequest:0 state:@"exited"];
}

- (void)cinemaLayoutReady:(NSInteger)ticket {
	if (ticket <= 0 || ticket != _transitionTicket || _cinemaSession.active != _enteringCinema ||
	    _cinemaSnapshotPending) return;
	if (!_view.window || _tid != gActive || _hostView.isHiddenOrHasHiddenAncestor || NSIsEmptyRect(_view.bounds)) {
		[self finishCinemaTransition:ticket];
		return;
	}
	// The page measured its player in the destination viewport. Wait for
	// WebKit to incorporate that update. This one-point image is discarded.
	_cinemaSnapshotPending = YES;
	WKSnapshotConfiguration *config = [WKSnapshotConfiguration new];
	config.afterScreenUpdates = YES;
	config.rect = NSMakeRect(NSMinX(_view.bounds), NSMinY(_view.bounds), 1, 1);
	__weak FMTab *weakSelf = self;
	[_view takeSnapshotWithConfiguration:config completionHandler:^(NSImage *image, NSError *error) {
		FMTab *tab = weakSelf;
		if (image && !error && [tab.cinemaExitCover canRevealTicket:ticket]) [tab finishCinemaTransition:ticket];
	}];
}

- (void)setCinemaActive:(BOOL)entering request:(NSInteger)request {
	if (_transitionTicket && _enteringCinema == entering) {
		if (entering) [self replyToCinemaRequest:request state:@"denied"];
		return;
	}
	if (_cinemaSession.active == entering) {
		// Escape can arrive in the frame before the window expands.
		if (!entering && _transitionTicket) {
			FMCinemaFocus *focus = _transitionFocus;
			[self leaveCinema];
			if (_tid == gActive) [focus restoreAfterResize:NO];
		}
		if (request) [self replyToCinemaRequest:request state:entering ? @"denied" : @"exited"];
		return;
	}
	NSWindow *window = _hostView.window;
	if (entering && (!NSApp.isActive || !window.isOnActiveSpace || window.attachedSheet || NSApp.modalWindow ||
	                 (NSApp.keyWindow && NSApp.keyWindow != window) ||
	                 _hostView.isHiddenOrHasHiddenAncestor || !_hostView.window.isVisible)) {
		[self replyToCinemaRequest:request state:@"denied"];
		return;
	}
	if (entering) [_cinemaExitCover prepareForWindow:_hostView.window label:L(@"Augenblick")];
	// The page's request ID can repeat across documents. A native ticket is
	// unique across tabs and directions, including reversals under the same panel.
	static NSInteger nativeTicket = (1LL << 32);
	NSInteger previousTicket = _transitionTicket;
	NSInteger ticket = ++nativeTicket;
	_transitionTicket = ticket;
	_enteringCinema = entering;
	_cinemaSnapshotPending = NO;
	_transitionFocus = [[FMCinemaFocus alloc] initWithPlayer:_view entering:entering previous:_preCinemaResponder];
	if (entering) _preCinemaResponder = _transitionFocus.originalResponder;
	__weak FMTab *weakSelf = self;
	void (^escape)(void) = ^{
		FMTab *tab = weakSelf;
		if (tab.transitionTicket == ticket) [tab setCinemaActive:NO request:0];
	};
	NSTimeInterval duration = gCinemaCoverDuration;
	BOOL shown = [_cinemaExitCover showAboveWindow:_hostView.window ticket:ticket duration:duration
		onEscape:entering ? escape : nil onInterrupt:^(BOOL cancelled) {
			FMTab *tab = weakSelf;
			if (tab.transitionTicket != ticket) return;
			if (cancelled) tab.transitionFocus = nil;
			if (tab.cinemaSession.active == entering) [tab finishCinemaTransition:ticket];
			else if (cancelled) [tab leaveCinema];
			// If the timer expired before the resize, changeWindow still
			// completes the requested transition and retires this ticket.
		}];
	if (!shown) [_cinemaExitCover dismissTicket:previousTicket];
	void (^changeWindow)(void) = ^{
		FMTab *tab = weakSelf;
		if (tab.transitionTicket != ticket) return;
		if (entering) {
			BOOL entered = [tab.cinemaSession beginWithHost:tab.hostView player:tab.view onExit:^(BOOL interrupted) {
				if (interrupted) [weakSelf leaveCinema];
				else [weakSelf setCinemaActive:NO request:0];
			}];
			if (!entered) {
				[tab finishCinemaTransition:ticket];
				[tab replyToCinemaRequest:request state:@"denied"];
				return;
			}
		} else {
			[tab.cinemaSession end];
			tab.preCinemaResponder = nil;
		}
		if (tab.tid == gActive) [tab.transitionFocus restoreAfterResize:YES];
		NSSize viewport = tab.view.bounds.size;
		CGFloat zoom = tab.view.pageZoom;
		NSString *js = [NSString stringWithFormat:@"window.__lunaCinemaReply?.(%ld,'%@',%ld,%.4f,%.4f,%.3f)",
			(long)request, entering ? @"entered" : @"exited", (long)ticket, viewport.width/zoom, viewport.height/zoom,
			shown ? duration * 1000 : 0.0];
		[tab.view evaluateJavaScript:js completionHandler:^(id value, NSError *error) {
			FMTab *current = weakSelf;
			if (!error || current.transitionTicket != ticket) return;
			if (entering) [current leaveCinema];
			else [current finishCinemaTransition:ticket];
		}];
		if ([tab.cinemaExitCover canRevealTicket:ticket]) [tab finishCinemaTransition:ticket];
	};
	// Reserve at most half of a short cover for its first composited frame.
	NSTimeInterval leadIn = MIN(0.032, duration / 2);
	if (shown) dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(leadIn * NSEC_PER_SEC)), dispatch_get_main_queue(), changeWindow);
	else changeWindow();
}

- (void)teardown {
	[self leaveCinema];
    if (@available(macOS 15.4, *)) [extensionController() didCloseTab:self windowIsClosing:NO];
	for (NSString *k in @[@"title", @"URL", @"loading", @"estimatedProgress", @"canGoBack", @"canGoForward"])
		[_view removeObserver:self forKeyPath:k];
	_view.navigationDelegate = nil;
	_view.UIDelegate = nil;
	[_view stopLoading];
	[_view removeFromSuperview];
	[_hostView removeFromSuperview];
}

- (void)push {
	emit(@{@"t": @"state", @"tab": @(_tid), @"url": nn(_view.URL.absoluteString), @"title": nn(_view.title),
	       @"loading": @(_view.loading), @"progress": @(_view.estimatedProgress),
	       @"back": @(_view.canGoBack), @"fwd": @(_view.canGoForward)});
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
	if ([object isKindOfClass:[NSProgress class]]) {
		NSNumber *dl = objc_getAssociatedObject(object, &kDlId);
		if (dl) emit(@{@"t": @"dl", @"id": dl, @"state": @"progress", @"received": @(((NSProgress *)object).completedUnitCount), @"total": @(((NSProgress *)object).totalUnitCount)});
		return;
	}
	if (@available(macOS 15.4, *)) [extensionController() didChangeTabProperties:(WKWebExtensionTabChangedPropertiesLoading | WKWebExtensionTabChangedPropertiesTitle | WKWebExtensionTabChangedPropertiesURL) forTab:self];
    [self push];
}

#pragma mark Navigation

- (void)webView:(WKWebView *)wv decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {
	NSURL *u = action.request.URL;
	NSString *sch = u.scheme.lowercaseString;
	if (action.shouldPerformDownload) { handler(WKNavigationActionPolicyDownload); return; }
	if (sch.length && ![@[@"http", @"https", @"file", @"about", @"data", @"blob", @"javascript", @"webkit-extension"] containsObject:sch]) {
		[[NSWorkspace sharedWorkspace] openURL:u]; // mailto:, tel:, Apps …
		handler(WKNavigationActionPolicyCancel);
		return;
	}
	if (action.navigationType == WKNavigationTypeLinkActivated && ((action.modifierFlags & NSEventModifierFlagCommand) || action.buttonNumber == 4)) {
		emit(@{@"t": @"newtab", @"url": u.absoluteString, @"opener": @(_tid)});
		handler(WKNavigationActionPolicyCancel);
		return;
	}
	_isError = NO;
	handler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)wv decidePolicyForNavigationResponse:(WKNavigationResponse *)resp decisionHandler:(void (^)(WKNavigationResponsePolicy))handler {
	BOOL attach = NO;
	if ([resp.response isKindOfClass:[NSHTTPURLResponse class]]) {
		NSString *cd = [((NSHTTPURLResponse *)resp.response) valueForHTTPHeaderField:@"Content-Disposition"];
		attach = cd && [cd.lowercaseString hasPrefix:@"attachment"];
	}
	handler((!resp.canShowMIMEType || attach) ? WKNavigationResponsePolicyDownload : WKNavigationResponsePolicyAllow);
}

- (void)webView:(WKWebView *)wv navigationAction:(WKNavigationAction *)a didBecomeDownload:(WKDownload *)d { d.delegate = self; }
- (void)webView:(WKWebView *)wv navigationResponse:(WKNavigationResponse *)r didBecomeDownload:(WKDownload *)d { d.delegate = self; }

- (void)webView:(WKWebView *)wv didCommitNavigation:(WKNavigation *)nav {
	NSString *origin = originOfURL(wv.URL);
	if (![_credentialStepOrigin isEqual:origin]) _credentialStepOrigin = _credentialStepUser = nil;
	emit(@{@"t":@"loginForm", @"id":@(_tid), @"tab":@(_tid), @"origin":origin, @"url":credentialPageLocation(wv.URL), @"form":@"", @"stage":@""});
	if (_tid == gActive && cinemaSite(wv.URL.host)) [_cinemaExitCover prepareForWindow:wv.window label:L(@"Augenblick")];
}

- (void)webView:(WKWebView *)wv didFinishNavigation:(WKNavigation *)nav {
	emit(@{@"t": @"loaded", @"tab": @(_tid), @"url": nn(wv.URL.absoluteString), @"title": nn(wv.title), @"error": @(_isError)});
	int tid = _tid;
	[wv evaluateJavaScript:@"(function(){var l=document.querySelector('link[rel~=\"icon\"]');return l?l.href:location.origin+'/favicon.ico'})()" completionHandler:^(id r, NSError *e) {
		if ([r isKindOfClass:[NSString class]]) emit(@{@"t": @"favicon", @"tab": @(tid), @"icon": r});
	}];
}

- (void)failed:(WKWebView *)wv error:(NSError *)e {
	if (e.code == NSURLErrorCancelled || e.code == 102) return; // Abbruch / Umleitung auf Download
	NSURL *u = e.userInfo[NSURLErrorFailingURLErrorKey] ?: wv.URL;
	_isError = YES;
	emit(@{@"t": @"error", @"tab": @(_tid), @"url": nn(u.absoluteString), @"message": nn(e.localizedDescription)});
	[wv loadHTMLString:errorHTML(e, u) baseURL:u];
}
- (void)webView:(WKWebView *)wv didFailProvisionalNavigation:(WKNavigation *)n withError:(NSError *)e { [self failed:wv error:e]; }
- (void)webView:(WKWebView *)wv didFailNavigation:(WKNavigation *)n withError:(NSError *)e { [self failed:wv error:e]; }
- (void)webView:(WKWebView *)wv didStartProvisionalNavigation:(WKNavigation *)navigation { [self leaveCinema]; }
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)wv { [self leaveCinema]; [wv reload]; }

#pragma mark UI-Delegate

- (WKWebView *)webView:(WKWebView *)wv createWebViewWithConfiguration:(WKWebViewConfiguration *)cfg forNavigationAction:(WKNavigationAction *)a windowFeatures:(WKWindowFeatures *)f {
	int nid = gNextPopup++;
	FMTab *t = tabFor(nid, cfg);
	emit(@{@"t": @"popup", @"tab": @(nid), @"opener": @(_tid)});
	return t.view;
}
- (void)webViewDidClose:(WKWebView *)wv { emit(@{@"t": @"close", @"tab": @(_tid)}); }

- (void)webView:(WKWebView *)wv runJavaScriptAlertPanelWithMessage:(NSString *)m initiatedByFrame:(WKFrameInfo *)f completionHandler:(void (^)(void))ch {
	NSAlert *a = [NSAlert new]; a.messageText = wv.URL.host ?: L(@"Seite"); a.informativeText = m;
	[a addButtonWithTitle:@"OK"]; [a runModal]; ch();
}
- (void)webView:(WKWebView *)wv runJavaScriptConfirmPanelWithMessage:(NSString *)m initiatedByFrame:(WKFrameInfo *)f completionHandler:(void (^)(BOOL))ch {
	NSAlert *a = [NSAlert new]; a.messageText = wv.URL.host ?: L(@"Seite"); a.informativeText = m;
	[a addButtonWithTitle:@"OK"]; [a addButtonWithTitle:L(@"Abbrechen")];
	ch([a runModal] == NSAlertFirstButtonReturn);
}
- (void)webView:(WKWebView *)wv runJavaScriptTextInputPanelWithPrompt:(NSString *)p defaultText:(NSString *)d initiatedByFrame:(WKFrameInfo *)f completionHandler:(void (^)(NSString *))ch {
	NSAlert *a = [NSAlert new]; a.messageText = wv.URL.host ?: L(@"Seite"); a.informativeText = p;
	NSTextField *tf = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 260, 24)]; tf.stringValue = d ?: @""; a.accessoryView = tf;
	[a addButtonWithTitle:@"OK"]; [a addButtonWithTitle:L(@"Abbrechen")];
	ch([a runModal] == NSAlertFirstButtonReturn ? tf.stringValue : nil);
}
- (void)webView:(WKWebView *)wv runOpenPanelWithParameters:(WKOpenPanelParameters *)p initiatedByFrame:(WKFrameInfo *)f completionHandler:(void (^)(NSArray<NSURL *> *))ch {
	NSOpenPanel *op = [NSOpenPanel openPanel]; op.allowsMultipleSelection = p.allowsMultipleSelection; op.canChooseDirectories = p.allowsDirectories;
	ch([op runModal] == NSModalResponseOK ? op.URLs : nil);
}

#pragma mark Downloads

- (void)download:(WKDownload *)d decideDestinationUsingResponse:(NSURLResponse *)r suggestedFilename:(NSString *)name completionHandler:(void (^)(NSURL *))ch {
	NSURL *dir = [[NSFileManager defaultManager] URLsForDirectory:NSDownloadsDirectory inDomains:NSUserDomainMask].firstObject;
	NSString *base = name.stringByDeletingPathExtension, *ext = name.pathExtension;
	NSURL *dest = [dir URLByAppendingPathComponent:name];
	for (int i = 2; [[NSFileManager defaultManager] fileExistsAtPath:dest.path]; i++)
		dest = [dir URLByAppendingPathComponent:ext.length ? [NSString stringWithFormat:@"%@ (%d).%@", base, i, ext] : [NSString stringWithFormat:@"%@ (%d)", base, i]];
	NSNumber *dlid = @(++gDlSeq);
	objc_setAssociatedObject(d, &kDlId, dlid, OBJC_ASSOCIATION_RETAIN);
	objc_setAssociatedObject(d.progress, &kDlId, dlid, OBJC_ASSOCIATION_RETAIN);
	[d.progress addObserver:self forKeyPath:@"completedUnitCount" options:0 context:NULL];
	emit(@{@"t": @"dl", @"id": dlid, @"state": @"start", @"name": dest.lastPathComponent, @"path": dest.path, @"total": @(r.expectedContentLength)});
	ch(dest);
}
- (void)downloadDidFinish:(WKDownload *)d {
	NSNumber *dlid = objc_getAssociatedObject(d, &kDlId);
	@try { [d.progress removeObserver:self forKeyPath:@"completedUnitCount"]; } @catch (id x) {}
	emit(@{@"t": @"dl", @"id": nn(dlid), @"state": @"done"});
}
- (void)download:(WKDownload *)d didFailWithError:(NSError *)e resumeData:(NSData *)rd {
	NSNumber *dlid = objc_getAssociatedObject(d, &kDlId);
	@try { [d.progress removeObserver:self forKeyPath:@"completedUnitCount"]; } @catch (id x) {}
	emit(@{@"t": @"dl", @"id": nn(dlid), @"state": @"failed", @"message": nn(e.localizedDescription)});
}

@end

#include "extensions_darwin.h"

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunguarded-availability-new"
@implementation FMCredHandler
- (instancetype)init {
	if (!(self = [super init])) return nil;
	NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
	[center addObserver:self selector:@selector(focusChanged:) name:NSWindowDidBecomeKeyNotification object:nil];
	[center addObserver:self selector:@selector(focusChanged:) name:NSApplicationDidBecomeActiveNotification object:nil];
	return self;
}
- (void)focusChanged:(NSNotification *)notification {
	FMTab *tab = gTabs[@(gActive)];
	if (tab && NSApp.isActive && tab.view.window.isKeyWindow && !tab.hostView.isHiddenOrHasHiddenAncestor &&
	    !tab.view.window.attachedSheet)
		emit(@{@"t":@"loginFocus", @"tab":@(tab.tid)});
}
// Der Ursprung kommt aus WebKit (frameInfo.securityOrigin), nie aus dem, was die Seite behauptet.
// Das Passwort geht nur an Go und nie über die Ereignisse an die Oberfläche.
- (void)userContentController:(WKUserContentController *)ucc didReceiveScriptMessage:(WKScriptMessage *)msg {
	if (![msg.name isEqualToString:@"lunaCreds"] || !msg.frameInfo.isMainFrame) return;
	NSDictionary *b = [msg.body isKindOfClass:[NSDictionary class]] ? msg.body : nil;
	WKSecurityOrigin *o = msg.frameInfo.securityOrigin;
	NSString *scheme = o.protocol.lowercaseString, *host = o.host.lowercaseString;
	if (!host.length || (![scheme isEqual:@"https"] && !([scheme isEqual:@"http"] &&
	    [@[@"localhost", @"127.0.0.1", @"::1", @"[::1]"] containsObject:host]))) return;
	if ([host containsString:@":"] && ![host hasPrefix:@"["]) host = [NSString stringWithFormat:@"[%@]",host];
	BOOL defaultPort = o.port <= 0 || ([scheme isEqual:@"https"] ? o.port == 443 : o.port == 80);
	NSString *origin = defaultPort ? [NSString stringWithFormat:@"%@://%@", scheme, host] :
		[NSString stringWithFormat:@"%@://%@:%ld", scheme, host, (long)o.port];
	FMTab *tab = nil;
	for (FMTab *t in gTabs.allValues) if (t.view == msg.webView) { tab = t; break; }
	if (!tab || tab.isError) return;
	int tid = tab.tid;
	if ([b[@"kind"] isEqual:@"loginForm"]) {
		NSString *form = b[@"form"], *stage = b[@"stage"];
		if (![form isKindOfClass:NSString.class] || form.length > 128 ||
		    ![@[@"", @"username", @"password"] containsObject:stage ?: NSNull.null] || !!form.length != !!stage.length) return;
		emit(@{@"t":@"loginForm", @"id":@(tid), @"tab":@(tid), @"origin":origin,
		       @"url":credentialPageLocation(tab.view.URL), @"form":form, @"stage":stage});
		return;
	}
	NSString *user = b[@"username"];
	if (![user isKindOfClass:NSString.class] || user.length > 320) return;
	NSTimeInterval now = NSProcessInfo.processInfo.systemUptime;
	if ([b[@"kind"] isEqual:@"usernameStep"]) {
		if (!user.length) return;
		tab.credentialStepOrigin = origin;
		tab.credentialStepUser = user;
		tab.credentialStepTime = now;
		__weak FMTab *weakTab = tab;
		dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
			FMTab *current = weakTab;
			if (current.credentialStepTime == now) current.credentialStepOrigin = current.credentialStepUser = nil;
		});
		return;
	}
	NSString *pass = b[@"password"];
	if (b[@"kind"] || ![pass isKindOfClass:NSString.class] || !pass.length || pass.length > 1024) return;
	if (!user.length && [origin isEqual:tab.credentialStepOrigin] && now - tab.credentialStepTime <= 300)
		user = tab.credentialStepUser ?: @"";
	tab.credentialStepOrigin = tab.credentialStepUser = nil;
	char *co = strdup(origin.lowercaseString.UTF8String), *cu = strdup(user.UTF8String), *cp = strdup(pass.UTF8String);
	goCredSubmit(tid, co, cu, cp);
	memset(cp, 0, strlen(cp));
	free(co); free(cu); free(cp);
}
@end
#pragma clang diagnostic pop

@implementation FMCinemaHandler
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
	FMTab *tab = gTabs[@(gActive)];
	if (!tab || tab.view != message.webView || !message.frameInfo.isMainFrame) return;
	WKSecurityOrigin *origin = message.frameInfo.securityOrigin;
	if (![origin.protocol isEqual:@"https"] || !cinemaSite(origin.host)) return;
	NSDictionary *request = [message.body isKindOfClass:NSDictionary.class] ? message.body : nil;
	if (![request[@"id"] isKindOfClass:NSNumber.class]) return;
	NSInteger rid = [request[@"id"] integerValue];
	NSString *action = request[@"action"];
	if ([action isEqual:@"ready"]) {
		[tab cinemaLayoutReady:rid];
	} else if ([action isEqual:@"exit"] || [action isEqual:@"enter"]) {
		[tab setCinemaActive:[action isEqual:@"enter"] request:rid];
	} else {
		[tab replyToCinemaRequest:rid state:@"denied"];
	}
}
@end

@implementation FMGestureHandler
- (void)userContentController:(WKUserContentController *)ucc didReceiveScriptMessage:(WKScriptMessage *)msg {
	if (![msg.name isEqualToString:@"fmGesture"]) return;
	int tid = -1;
	for (FMTab *t in gTabs.allValues) if (t.view == msg.webView) tid = t.tid;
	NSDictionary *b = [msg.body isKindOfClass:[NSDictionary class]] ? msg.body : @{};
	// Zeichnen läuft: nur den Schreibton steuern, kein Ereignis ans Frontend
	if ([b[@"kind"] isEqual:@"draw"]) { fmwWriteSound([b[@"on"] boolValue] ? 1 : 0); return; }
	emit(@{@"t": @"gesture", @"tab": @(tid), @"kind": nn(b[@"kind"]), @"dir": nn(b[@"dir"]), @"letter": nn(b[@"letter"])});
}
@end

#pragma mark C-API

void fmwLoad(int id, const char *url) {
	NSString *s = [NSString stringWithUTF8String:url];
	dispatch_async(dispatch_get_main_queue(), ^{
		FMTab *t = tabFor(id, nil);
		NSURL *u = [NSURL URLWithString:s];
		if (!u) return;
		if ([u.scheme isEqualToString:@"file"]) [t.view loadFileURL:u allowingReadAccessToURL:[u URLByDeletingLastPathComponent]];
		else [t.view loadRequest:[NSURLRequest requestWithURL:u]];
	});
}
void fmwHistory(int id, int action) {
	dispatch_async(dispatch_get_main_queue(), ^{
		FMTab *t = gTabs[@(id)]; if (!t) return;
		switch (action) {
			case 0: [t.view goBack]; break;
			case 1: [t.view goForward]; break;
			case 2: [t.view reload]; break;
			case 3: [t.view stopLoading]; break;
		}
	});
}
void fmwSetFrame(double x, double y, double w, double h) {
	dispatch_async(dispatch_get_main_queue(), ^{
		gRect = CGRectMake(x, y, w, h);
		for (FMTab *t in gTabs.allValues) layoutTab(t);
	});
}
void fmwShow(int id) {
	dispatch_async(dispatch_get_main_queue(), ^{
		FMTab *previous = gTabs[@(gActive)];
        gActive = id;
        if (id >= 0 && gTabs[@(id)]) gLastWebTab = id;
        if (@available(macOS 15.4, *)) if (gTabs[@(id)]) [extensionController() didActivateTab:gTabs[@(id)] previousActiveTab:previous];
		for (FMTab *t in gTabs.allValues) {
			BOOL hidden = t.tid != gActive;
			if (t.hostView.hidden != hidden) {
				t.hostView.hidden = hidden;
				if (!hidden && cinemaSite(t.view.URL.host)) [t.cinemaExitCover prepareForWindow:t.view.window label:L(@"Augenblick")];
			}
			if (hidden && (t.cinemaSession.active || t.transitionTicket)) [t leaveCinema];
		}
	});
}
void fmwClose(int id) {
	dispatch_async(dispatch_get_main_queue(), ^{
		FMTab *t = gTabs[@(id)]; if (!t) return;
		[t teardown];
		[gTabs removeObjectForKey:@(id)];
        if (gLastWebTab == id) gLastWebTab = -1;
	});
}
void fmwFind(int id, const char *text, int forward) {
	NSString *s = [NSString stringWithUTF8String:text];
	dispatch_async(dispatch_get_main_queue(), ^{
		FMTab *t = gTabs[@(id)]; if (!t) return;
		if (s.length == 0) { [t.view evaluateJavaScript:@"window.getSelection().removeAllRanges()" completionHandler:nil]; return; }
		WKFindConfiguration *c = [WKFindConfiguration new];
		c.backwards = !forward; c.wraps = YES; c.caseSensitive = NO;
		[t.view findString:s withConfiguration:c completionHandler:^(WKFindResult *r) {
			emit(@{@"t": @"find", @"tab": @(id), @"found": @(r.matchFound)});
		}];
	});
}
void fmwZoom(int id, double factor) {
	dispatch_async(dispatch_get_main_queue(), ^{
		FMTab *t = gTabs[@(id)]; if (t) t.view.pageZoom = factor;
	});
}
// Snapshot pixel encoding runs off the AppKit thread. The clipboard gets the
// original Retina PNG; only the UI preview is scaled down before crossing Go/JS.
static NSData *fmPreviewJPEG(CGImageRef image) {
 size_t width = CGImageGetWidth(image), height = CGImageGetHeight(image);
 CGFloat ratio = MIN(1.0, 1600.0 / MAX(width, height));
 CGImageRef preview = image;
 if (ratio < 1.0) {
  size_t w = MAX(1, (size_t)ceil(width * ratio)), h = MAX(1, (size_t)ceil(height * ratio));
  CGColorSpaceRef colors = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(NULL, w, h, 8, 0, colors, (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
  CGColorSpaceRelease(colors);
  if (!context) return nil;
  CGContextSetInterpolationQuality(context, kCGInterpolationMedium);
  CGContextDrawImage(context, CGRectMake(0, 0, w, h), image);
  preview = CGBitmapContextCreateImage(context);
  CGContextRelease(context);
  if (!preview) return nil;
 }
 NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:preview];
 NSData *data = [bitmap representationUsingType:NSBitmapImageFileTypeJPEG properties:@{NSImageCompressionFactor:@0.78}];
 if (preview != image) CGImageRelease(preview);
 return data;
}

static void fmEncodeSnapshot(NSImage *image, int req, BOOL clipboard) {
 CGImageRef pixels = [image CGImageForProposedRect:NULL context:nil hints:nil];
 if (!pixels) { goSnapshotDone(req, (char *)""); return; }
 CGImageRetain(pixels);
 NSSize logicalSize = image.size;
 dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
  @autoreleasepool {
   NSData *png = nil;
   if (clipboard) {
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:pixels];
    bitmap.size = logicalSize;
    png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
   }
   NSData *jpeg = fmPreviewJPEG(pixels);
   CGImageRelease(pixels);
   NSString *encoded = [jpeg base64EncodedStringWithOptions:0];
   dispatch_async(dispatch_get_main_queue(), ^{
    if (!encoded || (clipboard && !png)) { goSnapshotDone(req, (char *)""); return; }
    if (clipboard) {
     NSPasteboard *pb = [NSPasteboard generalPasteboard];
     [pb clearContents];
     if (![pb setData:png forType:NSPasteboardTypePNG]) { goSnapshotDone(req, (char *)""); return; }
    }
    char *out = strdup(encoded.UTF8String);
    goSnapshotDone(req, out);
    free(out);
   });
  }
 });
}

void fmwSnapshot(int id, int req) {
 dispatch_async(dispatch_get_main_queue(), ^{
  FMTab *t = gTabs[@(id)];
  if (!t) { goSnapshotDone(req, (char *)""); return; }
  WKSnapshotConfiguration *cfg = [WKSnapshotConfiguration new];
  if (@available(macOS 10.15, *)) { cfg.afterScreenUpdates = NO; }
  [t.view takeSnapshotWithConfiguration:cfg completionHandler:^(NSImage *img, NSError *error) {
   if (!img) { goSnapshotDone(req, (char *)""); return; }
   fmEncodeSnapshot(img, req, NO);
  }];
 });
}
void fmwFocusUI(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSWindow *w = fmWindow();
		for (NSView *v in w.contentView.subviews) {
			if ([v isKindOfClass:[WKWebView class]]) {
				BOOL ours = NO;
				for (FMTab *t in gTabs.allValues) if (t.view == v) ours = YES;
				if (!ours) { [w makeFirstResponder:v]; return; }
			}
		}
	});
}

void fmwSetAppearance(int mode) {
	dispatch_async(dispatch_get_main_queue(), ^{
		NSApp.appearance = mode == 1 ? [NSAppearance appearanceNamed:NSAppearanceNameAqua]
		                 : mode == 2 ? [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] : nil;
	});
}

// Mausgeste: Skript (wird in jede Seite eingeschleust) und Ein/Aus.
void fmwConfigureGesture(const char *src, int on) {
	NSString *s = src ? [NSString stringWithUTF8String:src] : @"";
	dispatch_async(dispatch_get_main_queue(), ^{
		gGestureSrc = s.length ? s : gGestureSrc;
		gGestureOn = on;
		if (gConfig) applyGesture(gConfig);
		for (FMTab *t in gTabs.allValues)
			[t.view evaluateJavaScript:[NSString stringWithFormat:@"window.__fmGesture=%d", on] completionHandler:nil];
	});
}

// Kamera-Sound (NSSound aus eingebetteten Bytes; unabhängig von der Webview-Autoplay-Regel)
static NSSound *gSound;
void fmwPlaySound(const void *bytes, int len) {
	NSData *d = [NSData dataWithBytes:bytes length:len];
	dispatch_async(dispatch_get_main_queue(), ^{
		gSound = [[NSSound alloc] initWithData:d];
		[gSound stop];
		[gSound play];
	});
}

// Schreibton: läuft in Schleife, solange eine Geste gezeichnet wird.
static NSData *gWriteData;
static NSSound *gWriteSound;
void fmwSetWriteSound(const void *bytes, int len) {
	NSData *d = [NSData dataWithBytes:bytes length:len];
	dispatch_async(dispatch_get_main_queue(), ^{ gWriteData = d; gWriteSound = nil; });
}
void fmwWriteSound(int on) {
	dispatch_async(dispatch_get_main_queue(), ^{
		if (!on) { [gWriteSound stop]; return; }
		if (!gWriteData) return;
		if (!gWriteSound) { gWriteSound = [[NSSound alloc] initWithData:gWriteData]; gWriteSound.loops = YES; }
		if (!gWriteSound.isPlaying) { [gWriteSound stop]; [gWriteSound play]; }
	});
}

// Screenshot der Seite in die Zwischenablage (verlustfreies Retina-PNG). id >= 0: native Seite; id < 0: der Seitenbereich der Oberfläche.
// Antwort (JPEG als Base64 für die Animation) kommt über goSnapshotDone; leer = Fehler.
void fmwScreenshot(int id, int req) {
 dispatch_async(dispatch_get_main_queue(), ^{
		WKWebView *view = nil;
		WKSnapshotConfiguration *cfg = [WKSnapshotConfiguration new];
		if (@available(macOS 10.15, *)) { cfg.afterScreenUpdates = NO; } // Die Gestenspur ist bereits entfernt; keinen weiteren WebKit-Paint erzwingen.
		FMTab *t = id >= 0 ? gTabs[@(id)] : nil;
  if (id >= 0 && !t) { goSnapshotDone(req, (char *)""); return; }
		CGFloat wpt = 0;
		if (t) { view = t.view; wpt = view.bounds.size.width; }
		else {
			for (NSView *child in fmWindow().contentView.subviews) {
                WKWebView *v = findWebView(child);
                if (!v) continue;
				BOOL ours = NO;
				for (FMTab *x in gTabs.allValues) if (x.view == v) ours = YES;
				if (!ours) { view = (WKWebView *)v; break; }
			}
			cfg.rect = NSMakeRect(gRect.origin.x, gRect.origin.y, gRect.size.width, gRect.size.height);
			wpt = gRect.size.width;
		}
 if (!view || wpt < 1) { goSnapshotDone(req, (char *)""); return; }
  // snapshotWidth is in points; WebKit applies the display scale itself.
  cfg.snapshotWidth = @(wpt);
  [view takeSnapshotWithConfiguration:cfg completionHandler:^(NSImage *img, NSError *error) {
   if (!img) { goSnapshotDone(req, (char *)""); return; }
   fmEncodeSnapshot(img, req, YES);
  }];
	});
}

// Bounded MCP page operations. JavaScript source is generated by trusted Go code.
void fmwEvaluate(int tabID, const char *script, int req) {
 NSString *source = [NSString stringWithUTF8String:script];
 dispatch_async(dispatch_get_main_queue(), ^{
  FMTab *t = gTabs[@(tabID)];
  if (!t) { goSnapshotDone(req,(char *)""); return; }
  [t.view evaluateJavaScript:source completionHandler:^(id result, NSError *error) {
   NSString *value = [result isKindOfClass:[NSString class]] ? result : @"";
   if (error) value = @"{\"error\":\"Seitenaktion nicht möglich. Selektor und Ladezustand prüfen.\"}";
   char *out = strdup(value.UTF8String); goSnapshotDone(req,out); free(out);
  }];
 });
}

int fmwSetDockIcon(const void *bytes, int length) {
 NSData *data = [NSData dataWithBytes:bytes length:length];
 __block BOOL saved = NO;
 void (^apply)(void) = ^{
  NSImage *icon = [[NSImage alloc] initWithData:data];
  if (!icon) return;
  saved = [[NSWorkspace sharedWorkspace] setIcon:icon forFile:NSBundle.mainBundle.bundlePath options:0];
  NSApp.applicationIconImage = icon;
  [NSApp.dockTile display];
 };
 if (NSThread.isMainThread) apply(); else dispatch_sync(dispatch_get_main_queue(), apply);
 return saved ? 1 : 0;
}

// Only Luna-generated error documents receive these palette values.
void fmwSetErrorPalette(const char *palette) {
 NSString *json = [NSString stringWithUTF8String:palette ?: "{}"];
 dispatch_async(dispatch_get_main_queue(), ^{
  NSDictionary *values = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
  if (![values isKindOfClass:[NSDictionary class]]) return;
  NSMutableString *css = [NSMutableString stringWithString:@":root{"];
  NSCharacterSet *allowed = [NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF#.,%() /rgbhsla"];
  for (NSString *key in @[@"panel", @"ink", @"mute", @"acc", @"pri", @"pri-fg"]) {
   NSString *value = values[key];
   if (![value isKindOfClass:[NSString class]] || !value.length || value.length > 80 || [value rangeOfCharacterFromSet:allowed.invertedSet].location != NSNotFound) return;
   [css appendFormat:@"--%@: %@;", key, value];
  }
  [css appendString:@"}body{background:var(--panel);color:var(--ink)}p,details{color:var(--mute)}.mark,svg{color:var(--acc)}a{background:var(--pri);color:var(--pri-fg)}a:focus-visible,summary:focus-visible{outline-color:var(--acc)}"];
  gErrorPaletteCSS = [css copy];
  NSData *data = [NSJSONSerialization dataWithJSONObject:@[gErrorPaletteCSS] options:0 error:nil];
  NSString *literal = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  NSString *script = [NSString stringWithFormat:@"(()=>{const s=document.getElementById('luna-error-palette');if(s)s.textContent=%@[0]})()", literal];
  for (FMTab *tab in gTabs.allValues) if (tab.isError) [tab.view evaluateJavaScript:script completionHandler:nil];
 });
}

static BOOL setupKeyPage(NSURL *url, NSString *provider) {
 if (![url.scheme.lowercaseString isEqualToString:@"https"]) return NO;
 NSString *host = url.host.lowercaseString;
 NSString *path = url.path;
 if ([path hasSuffix:@"/"]) path = [path substringToIndex:path.length - 1];
 if ([provider isEqualToString:@"brave"]) return [host isEqualToString:@"api-dashboard.search.brave.com"] && [path isEqualToString:@"/app/keys"];
 if ([provider isEqualToString:@"tavily"]) return [host isEqualToString:@"app.tavily.com"] && [path isEqualToString:@"/home"];
 if ([provider isEqualToString:@"groq"]) return [host isEqualToString:@"console.groq.com"] && [path isEqualToString:@"/keys"];
 if ([provider isEqualToString:@"openrouter"]) return [host isEqualToString:@"openrouter.ai"] && ([path isEqualToString:@"/settings/keys"] || ([path hasPrefix:@"/workspace"] && [path hasSuffix:@"/keys"]));
 if ([provider isEqualToString:@"spotify"]) return [host isEqualToString:@"developer.spotify.com"] && [path hasPrefix:@"/dashboard/"];
 return NO;
}
char *fmwOnboardingClipboard(int tab, const char *provider, int previousCount) {
 NSString *service = [NSString stringWithUTF8String:provider ?: ""];
 __block NSString *result;
 void (^read)(void) = ^{
  FMTab *t = gTabs[@(tab)];
  NSURL *url = t.view.URL;
  BOOL eligible = NSApp.isActive && gActive == tab && !t.hostView.hidden && !t.isError && !t.view.loading && setupKeyPage(url, service);
  // Read only a new copy on an active trusted key page, never the baseline clipboard.
  NSMutableDictionary *status = [@{@"count": @(NSPasteboard.generalPasteboard.changeCount), @"eligible": @(eligible), @"host": url.host ?: @"", @"loading": @(t.view.loading), @"error": @(t.isError)} mutableCopy];
  if (eligible && previousCount >= 0 && NSPasteboard.generalPasteboard.changeCount != previousCount) {
   NSString *text = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
   if (text.length > 0 && text.length <= 4096) status[@"text"] = text;
  }
  NSData *data = [NSJSONSerialization dataWithJSONObject:status options:0 error:nil];
  result = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
 };
 if (NSThread.isMainThread) read(); else dispatch_sync(dispatch_get_main_queue(), read);
 return strdup((result ?: @"{}").UTF8String);
}

// Touch ID (mit Passwort als Ersatz). Blockiert, bis der Nutzer entschieden hat; nicht vom Main-Thread aufrufen.
// Rückgabe: 0 = bestätigt, 1 = abgelehnt/abgebrochen, 2 = auf diesem Mac nicht verfügbar.
int fmwAuthenticate(const char *reason) {
	NSString *why = [NSString stringWithUTF8String:reason];
	LAContext *ctx = [LAContext new];
	NSError *err = nil;
	if (![ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&err]) return 2;
	dispatch_semaphore_t sem = dispatch_semaphore_create(0);
	__block int result = 1;
	[ctx evaluatePolicy:LAPolicyDeviceOwnerAuthentication localizedReason:why reply:^(BOOL ok, NSError *e) {
		result = ok ? 0 : 1;
		dispatch_semaphore_signal(sem);
	}];
	dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
	return result;
}


// Passwort-Tresor: Skript für die getrennte Welt setzen.
void fmwConfigureCredentials(const char *src) {
	NSString *source = src ? [NSString stringWithUTF8String:src] : @"";
	dispatch_async(dispatch_get_main_queue(), ^{
		gCredSrc = source;
		if (gConfig) applyGesture(gConfig);
	});
}

static NSString *originOfURL(NSURL *url) {
	NSString *scheme = url.scheme.lowercaseString, *host = url.host.lowercaseString;
	if (!scheme.length || !host.length) return @"";
	if ([host containsString:@":"] && ![host hasPrefix:@"["]) host = [NSString stringWithFormat:@"[%@]", host];
	NSNumber *port = url.port;
	BOOL isDefault = !port || ([scheme isEqualToString:@"https"] && port.intValue == 443) || ([scheme isEqualToString:@"http"] && port.intValue == 80);
	return isDefault ? [NSString stringWithFormat:@"%@://%@", scheme, host] : [NSString stringWithFormat:@"%@://%@:%@", scheme, host, port];
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunguarded-availability-new"
// Füllt Anmeldedaten ein, aber nur, wenn die Seite gerade noch genau den erwarteten Ursprung hat.
// Das Ergebnis (JSON ohne Passwort) kommt über goSnapshotDone zurück.
void fmwFillCredential(int tabID, const char *origin, const char *user, const char *pass, int submit, const char *form, int req) {
	NSString *expect = [NSString stringWithUTF8String:origin ?: ""];
	NSString *u = [NSString stringWithUTF8String:user ?: ""], *p = [NSString stringWithUTF8String:pass ?: ""];
	NSString *token = [NSString stringWithUTF8String:form ?: ""];
	dispatch_async(dispatch_get_main_queue(), ^{
		void (^finish)(NSString *) = ^(NSString *json) { char *out = strdup(json.UTF8String); goSnapshotDone(req, out); free(out); };
		FMTab *t = gTabs[@(tabID)];
		if (!t || t.isError || (submit && (gActive != tabID || t.hostView.isHiddenOrHasHiddenAncestor ||
		    !NSApp.isActive || !t.view.window.isKeyWindow || t.view.window.attachedSheet))) {
			finish(@"{\"ok\":false,\"error\":\"tab\"}"); return;
		}
		if (![originOfURL(t.view.URL) isEqualToString:expect]) { finish(@"{\"ok\":false,\"error\":\"origin\"}"); return; }
		NSDictionary *args = @{@"user":u, @"pass":submit == 2 ? @"" : p, @"mode":@(submit), @"token":token, @"origin":expect};
		NSString *src = @"return JSON.stringify(window.__lunaFill ? await window.__lunaFill(user,pass,mode,token,origin) : {ok:false,error:'script'})";
		[t.view callAsyncJavaScript:src arguments:args inFrame:nil inContentWorld:credWorld() completionHandler:^(id r, NSError *e) {
			finish(e || ![r isKindOfClass:[NSString class]] ? @"{\"ok\":false,\"error\":\"script\"}" : r);
		}];
	});
}
#pragma clang diagnostic pop
