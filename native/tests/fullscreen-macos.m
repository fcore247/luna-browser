#import "../../internal/web/web_darwin.m"

void goWebEvent(char *json) {}
void goCredSubmit(int tab, char *origin, char *user, char *pass) {}
void goSnapshotDone(int req, char *value) {}

static void check(BOOL condition, NSString *reason) {
    if (!condition) {
        fprintf(stderr, "FAILED: %s\n", reason.UTF8String);
        exit(1);
    }
}

// AppKit dispatches animation completion through its event queue.
static void pumpEvents(double seconds) {
    NSDate *end = [NSDate dateWithTimeIntervalSinceNow:seconds];
    while (end.timeIntervalSinceNow > 0) {
        NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                            untilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]
                                               inMode:NSDefaultRunLoopMode
                                              dequeue:YES];
        if (event) [NSApp sendEvent:event];
        [NSApp updateWindows];
    }
}

static id evaluate(WKWebView *view, NSString *script) {
    __block BOOL done = NO;
    __block id value;
    __block NSError *failure;
    [view evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
        value = result;
        failure = error;
        done = YES;
    }];
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
    while (!done && deadline.timeIntervalSinceNow > 0) pumpEvents(0.02);
    check(done && !failure, failure.localizedDescription ?: @"JavaScript timed out");
    return value;
}

// WebKit rejects fullscreen requests from fully occluded documents. Keep the
// fixture eligible when another app covers it, without activating this process.
@interface FixtureWindow : NSWindow
@end
@implementation FixtureWindow
- (NSWindowOcclusionState)occlusionState { return NSWindowOcclusionStateVisible; }
@end

static void waitFor(BOOL (^condition)(void), NSString *error) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
    while (!condition() && deadline.timeIntervalSinceNow > 0) pumpEvents(0.03);
    check(condition(), error);
}

static BOOL viewFillsScreen(WKWebView *view) {
    NSWindow *window = view.window;
    if (!window || !window.screen || !window.isVisible) return NO;
    NSRect rect = [window convertRectToScreen:[view convertRect:view.bounds toView:nil]];
    return NSEqualRects(rect, window.screen.frame);
}

static void loadPage(WKWebView *view, NSString *html, NSString *base) {
    // Give the offline fixture a real security origin without issuing a network
    // request. Both the page script and the native frame gate check the host.
    NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:base]];
    [view loadSimulatedRequest:request responseHTMLString:html];
    waitFor(^BOOL{ return !view.loading; }, @"Fixture did not load");
    check([evaluate(view, @"document.readyState === 'complete' && document.fullscreenEnabled") boolValue],
          @"Fullscreen API unavailable in fixture");
}

static BOOL pageHas(WKWebView *view, NSString *script) {
    return [evaluate(view, script) boolValue];
}

// isVisible alone also reports windows which WindowServer composited behind
// the player or on a different Space. Inspect this process's own window IDs.
static BOOL coverIsInFront(NSWindow *cover, NSWindow *player, CGRect displayBounds) {
    NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
    NSInteger coverRank = NSNotFound;
    NSInteger playerRank = NSNotFound;
    CGRect frame = CGRectNull;
    for (NSUInteger i = 0; i < windows.count; ++i) {
        NSDictionary *info = windows[i];
        NSInteger number = [info[(__bridge NSString *)kCGWindowNumber] integerValue];
        if (number == player.windowNumber) playerRank = i;
        if (number == cover.windowNumber && [info[(__bridge NSString *)kCGWindowAlpha] doubleValue] >= 0.99) {
            coverRank = i;
            CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)info[(__bridge NSString *)kCGWindowBounds], &frame);
        }
    }
    return playerRank != NSNotFound && coverRank < playerRank && !CGRectIsNull(frame) &&
           CGRectContainsRect(CGRectInset(frame, -1, -1), displayBounds);
}

@interface ExitLayoutAudit : NSObject <WKScriptMessageHandler>
@property (nonatomic, weak) NSWindow *cover;
@property (nonatomic, weak) NSWindow *player;
@property (nonatomic) CGRect displayBounds;
@property (nonatomic) NSTimeInterval restoredAt;
@end
@implementation ExitLayoutAudit
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    check([message.body isEqual:@YES], @"Inline player has unexpected dimensions after exit");
    check(coverIsInFront(_cover, _player, _displayBounds), @"Cover disappeared before inline player restoration");
    _restoredAt = NSProcessInfo.processInfo.systemUptime;
}
@end

static void testCinema(FMTab *tab, NSWindow *browser, NSString *url, NSString *playerClass) {
    WKWebView *view = tab.view;
    NSString *fixture = @"<!doctype html><meta name=viewport content='width=device-width'>"
              "<style>body{margin:0} #movie_player{width:70vw;height:55vh;background:black}"
              "video{width:100%;height:100%;display:block}</style>"
              "<button id=focus>Focus</button><section id=movie_player class=PLAYER_CLASS>"
              "<video id=video class=html5-main-video muted playsinline></video></section><div id=wide></div>"
              "<script>const video=document.getElementById('video'), player=document.getElementById('movie_player');"
              "const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');"
              "setInterval(()=>ctx.fillText(String(performance.now()),5,20),50);"
              "const stream=canvas.captureStream(20); video.srcObject=stream; video.play();"
              "const token=crypto.randomUUID(); let changes=0;"
              "document.addEventListener('fullscreenchange',()=>{changes++;"
              "if(location.hostname.endsWith('youtube.com')){const wide=document.getElementById('wide');"
              "if(document.fullscreenElement)wide.appendChild(player);else wide.before(player);}"
              "if(!document.fullscreenElement){"
              "const audit=window.webkit.messageHandlers.layoutAudit;if(!audit)return;"
              "player.style.visibility='hidden';setTimeout(()=>{player.style.visibility='';"
              "const rect=player.getBoundingClientRect();audit.postMessage(Math.abs(rect.width-innerWidth*.7)<1"
              " && Math.abs(rect.height-innerHeight*.55)<1);},95);}});"
              "window.checkIdentity=()=>video === document.querySelector('video') && video.srcObject === stream"
              " && video.readyState >= 2 && !video.paused && token === document.documentElement.dataset.token;"
              "document.documentElement.dataset.token=token;</script>";
    loadPage(view, [fixture stringByReplacingOccurrencesOfString:@"PLAYER_CLASS" withString:playerClass], url);
    waitFor(^BOOL{ return pageHas(view, @"checkIdentity() && video.currentTime > 0"); },
            @"Test video is not playing");
    __block NSWindow *cover = nil;
    ExitLayoutAudit *audit = [ExitLayoutAudit new];
    audit.player = browser;
    audit.displayBounds = CGDisplayBounds([browser.screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue]);
    [view.configuration.userContentController addScriptMessageHandler:audit name:@"layoutAudit"];
    NSRect originalBrowserFrame = browser.frame;
    NSRect originalHostFrame = tab.hostView.frame;
    NSView *originalParent = view.superview;
    [browser makeFirstResponder:view];
    evaluate(view, @"document.getElementById('focus').focus()");
    NSResponder *originalResponder = browser.firstResponder;
    NSNumber *before = evaluate(view, @"video.currentTime");
    __block BOOL nativeFullscreenStarted = NO;
    __block BOOL exiting = NO;
    __block BOOL coverSeenBeforeRestore = NO;
    __block BOOL coverSeenOnEntry = NO;
    NSTimer *probe = [NSTimer scheduledTimerWithTimeInterval:0.01 repeats:YES block:^(NSTimer *timer) {
        if (view.fullscreenState != WKFullscreenStateNotInFullscreen) nativeFullscreenStarted = YES;
        if (!tab.cinemaExitCover.window.isVisible) return;
        if (!exiting) coverSeenOnEntry = YES;
        else if (viewFillsScreen(view) && coverIsInFront(cover, browser, audit.displayBounds))
            coverSeenBeforeRestore = YES;
    }];

    evaluate(view, @"window.enterResult = 'pending'; player.requestFullscreen()"
                    ".then(()=>window.enterResult='entered',e=>window.enterResult=String(e)); undefined");
    waitFor(^BOOL{ return viewFillsScreen(view) && pageHas(view, @"enterResult==='entered'"); },
            @"Player never entered screen-sized Cinema mode");
    check(view.fullscreenState == WKFullscreenStateNotInFullscreen, @"Video used the native WebKit fullscreen transition");
    check(pageHas(view, @"document.fullscreenElement === player && checkIdentity() && changes === 1"),
          @"Player identity, playback or enter event lost");
    check(pageHas(view, @"Math.abs(player.getBoundingClientRect().width-innerWidth) <= 1 && "
                         "Math.abs(player.getBoundingClientRect().height-innerHeight) <= 1"),
          @"Player does not fill the Cinema viewport");
    waitFor(^BOOL{ return [evaluate(view, @"video.currentTime") doubleValue] > before.doubleValue; },
            @"Video stopped advancing in Cinema");
    cover = tab.cinemaExitCover.window;
    check(cover && cover != browser && !cover.isVisible, @"Expected a separate prewarmed exit window");
    audit.cover = cover;
    NSNumber *during = evaluate(view, @"video.currentTime");
    exiting = YES;
    BOOL useEscape = [url containsString:@"netflix.com"];
    if (useEscape) {
        NSEvent *escape = [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0
                                         timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:browser.windowNumber
                                           context:nil characters:@"\033" charactersIgnoringModifiers:@"\033"
                                         isARepeat:NO keyCode:53];
        [NSApp postEvent:escape atStart:NO];
    } else {
        evaluate(view, @"window.exitResult='pending'; document.exitFullscreen()"
                        ".then(()=>window.exitResult='exited',e=>window.exitResult=String(e)); undefined");
    }
    waitFor(^BOOL{ return !viewFillsScreen(view) && view.window == browser &&
                          pageHas(view, @"document.fullscreenElement===null") &&
                          (useEscape || pageHas(view, @"exitResult==='exited'")); },
            @"Exit did not restore original browser window and fullscreen API state");
    waitFor(^BOOL{ return audit.restoredAt > 0 && !cover.isVisible; }, @"Exit cover did not clear after inline layout");
    NSTimeInterval dismissLatency = NSProcessInfo.processInfo.systemUptime - audit.restoredAt;
    fprintf(stderr, "%s: cover dismissed within %.0f ms of inline player restoration\n",
            useEscape ? "Netflix fixture (Escape)" : "YouTube fixture (player exit)", dismissLatency * 1000);
    check(dismissLatency < 0.25, @"Cover lingered after the restored page was ready");
    check(coverSeenBeforeRestore, @"Exit cover was never above the fullscreen player before restoration");
    check(!coverSeenOnEntry, @"Cover appeared while entering Cinema");
    [view.configuration.userContentController removeScriptMessageHandlerForName:@"layoutAudit"];
    [probe invalidate];
    check(!nativeFullscreenStarted, @"WebKit started a native transition during Cinema");
    check(view.superview == originalParent && NSEqualRects(tab.hostView.frame, originalHostFrame) &&
          NSEqualRects(view.frame, tab.hostView.bounds) && NSEqualRects(browser.frame, originalBrowserFrame),
          @"Cinema did not restore the original browser and tab layout");
    check(browser.firstResponder == originalResponder, @"Cinema did not restore the original window focus");
    check(pageHas(view, @"document.activeElement?.id === 'focus'"), @"Cinema did not restore page focus");
    check(pageHas(view, @"checkIdentity() && changes === 2"), @"Player identity, exit event or playback lost");
    waitFor(^BOOL{ return [evaluate(view, @"video.currentTime") doubleValue] > during.doubleValue; },
            @"Video stopped advancing after Cinema exit");
}

static void testLostReady(FMTab *tab) {
    WKWebView *view = tab.view;
    // Drop a real readiness message in transit. The panel and pending request
    // must both clear, even if the same user immediately starts another session.
    evaluate(view, @"const dispatch=window.dispatchEvent;window.droppedReady=0;"
                    "window.dispatchEvent=function(e){if(e.type==='luna-cinema-request'"
                    " && JSON.parse(e.detail).action==='ready'){window.droppedReady++;return false;}"
                    " return dispatch.call(this,e);};"
                    "player.requestFullscreen();undefined");
    waitFor(^BOOL{ return tab.cinemaSession.active && pageHas(view, @"document.fullscreenElement===player"); },
            @"Lost-ready fixture did not enter Cinema");
    NSTimeInterval started = NSProcessInfo.processInfo.systemUptime;
    evaluate(view, @"document.exitFullscreen();undefined");
    waitFor(^BOOL{ return !tab.cinemaSession.active && !tab.exitTicket && !tab.cinemaExitCover.window.isVisible; },
            @"Missing readiness message left exit window or session open");
    NSTimeInterval elapsed = NSProcessInfo.processInfo.systemUptime - started;
    check(elapsed < .7, @"Missing acknowledgement left the cover up too long");
    check(pageHas(view, @"droppedReady===1 && document.fullscreenElement===null && checkIdentity()"),
          @"Lost-ready fixture missed the signal or interrupted playback");
    evaluate(view, @"delete window.dispatchEvent;player.requestFullscreen();undefined");
    waitFor(^BOOL{ return tab.cinemaSession.active && pageHas(view, @"document.fullscreenElement===player"); },
            @"Could not reenter after losing readiness");
    evaluate(view, @"document.exitFullscreen();undefined");
    waitFor(^BOOL{ return !tab.cinemaSession.active && !tab.exitTicket && !tab.cinemaExitCover.window.isVisible; },
            @"Next exit was affected by the lost readiness message");
    fprintf(stderr, "Lost ready: cover cleared within %.0f ms and immediate reentry succeeded\n", elapsed * 1000);
}

static void testGenericFullscreen(FMTab *tab) {
    WKWebView *view = tab.view;
    loadPage(view, @"<!doctype html><div id=slides>Slides</div>", @"https://slides.example/");
    evaluate(view, @"document.querySelector('#slides').requestFullscreen(); undefined");
    waitFor(^BOOL{ return view.fullscreenState == WKFullscreenStateInFullscreen; },
            @"Ordinary website could not enter standard WebKit fullscreen");
    check(pageHas(view, @"document.fullscreenElement?.id === 'slides'"), @"Wrong fullscreen element");
    evaluate(view, @"document.exitFullscreen(); undefined");
    waitFor(^BOOL{ return view.fullscreenState == WKFullscreenStateNotInFullscreen; },
            @"Ordinary website could not exit standard WebKit fullscreen");
    check(view.superview == tab.hostView && NSEqualRects(view.frame, tab.hostView.bounds),
          @"Ordinary fullscreen did not restore the webview");
}

int main(int argc, const char **argv) {
    @autoreleasepool {
        check(argc == 2, @"Usage: fullscreen-tests internal/web/cinema_darwin.js");
        NSError *failure = nil;
        NSString *script = [NSString stringWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]
                                                     encoding:NSUTF8StringEncoding error:&failure];
        check(script.length > 0, failure.localizedDescription ?: @"Cinema script unavailable");
        fmwConfigureCinemaScript(script.UTF8String);
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [NSApp finishLaunching];
        NSWindow *window = [[FixtureWindow alloc]
            initWithContentRect:NSMakeRect(50, 50, 900, 650)
                      styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable | NSWindowStyleMaskClosable
                        backing:NSBackingStoreBuffered defer:NO];
        [window.contentView addSubview:[[WKWebView alloc] initWithFrame:window.contentView.bounds]];
        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        waitFor(^BOOL{ return NSApp.isActive; }, @"Fixture could not activate");
        fmwSetFrame(10, 80, 880, 560);
        fmwShow(1);
        pumpEvents(0.1);
        FMTab *tab = tabFor(1, nil);
        testCinema(tab, window, @"https://www.youtube.com/watch?v=luna-cinema-fixture", @"html5-video-player");
        testLostReady(tab);
        testCinema(tab, window, @"https://www.netflix.com/watch/12345678", @"watch-video");
        testGenericFullscreen(tab);
        fmwClose(1);
        pumpEvents(0.2);
        puts("MACOS_FULLSCREEN_PASSED (exit cover ordering and delayed layout, lost signal, reentry, Escape, live playback, geometry/focus, generic fullscreen)");
    }
    return 0;
}
