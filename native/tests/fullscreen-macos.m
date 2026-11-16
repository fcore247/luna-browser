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
// fixture eligible even while the test intentionally selects another window.
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

@interface CinemaLayoutAudit : NSObject <WKScriptMessageHandler>
@property (nonatomic, weak) NSWindow *cover;
@property (nonatomic, weak) NSWindow *player;
@property (nonatomic) CGRect displayBounds;
@property (nonatomic) BOOL simulateResponderReset;
@property (nonatomic) NSTimeInterval enlargedAt;
@property (nonatomic) NSTimeInterval restoredAt;
@end
@implementation CinemaLayoutAudit
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
    // Resizing or exchanging a title-bar style can clear AppKit's first
    // responder while the cover is up. A valid key window alone is insufficient.
    if (_simulateResponderReset) [_player makeFirstResponder:nil];
    if (!coverIsInFront(_cover, _player, _displayBounds)) {
        check(NO, [NSString stringWithFormat:@"Player exposed during %@ layout (cover visible %d, app active %d, key window %@)",
                   message.body, _cover.isVisible, NSApp.isActive, NSApp.keyWindow]);
    }
    if ([message.body isEqual:@"fullscreen"]) _enlargedAt = NSProcessInfo.processInfo.systemUptime;
    else if ([message.body isEqual:@"inline"]) _restoredAt = NSProcessInfo.processInfo.systemUptime;
    else check(NO, @"Player did not reach the expected dimensions");
}
@end

static void checkCoverDuration(NSTimeInterval since, NSTimeInterval expected, NSString *direction) {
    NSTimeInterval elapsed = NSProcessInfo.processInfo.systemUptime - since;
    check(since > 0 && elapsed >= expected - .15 && elapsed < expected + .55,
          [NSString stringWithFormat:@"Expected %.2f-second %@ loader, observed %.3f seconds", expected, direction, elapsed]);
    fprintf(stderr, "%s cover: %.3f s (expected %.2f)\n", direction.UTF8String, elapsed, expected);
}

static void checkPageFocus(WKWebView *view, NSString *expected) {
    // The final focus repair crosses from AppKit back into WebKit after the
    // cover is removed. Poll the real active element across that IPC boundary.
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:.25];
    NSString *actual;
    do {
        actual = evaluate(view, @"document.activeElement?.id");
        if ([actual isEqual:expected]) return;
        pumpEvents(.01);
    } while (deadline.timeIntervalSinceNow > 0);
    check(NO, [NSString stringWithFormat:@"Expected focused control %@ after the cover, got %@ (document focused %@, responder %@)",
               expected, actual, evaluate(view, @"document.hasFocus()"), view.window.firstResponder]);
}

static void checkKeyboardTarget(NSWindow *browser, WKWebView *view, NSString *phase) {
    check(NSApp.isActive && NSApp.keyWindow == browser && NSApp.mainWindow == browser &&
          browser.isKeyWindow && browser.isMainWindow,
          [NSString stringWithFormat:@"Browser lost key/main status %@ (key %@, main %@)",
           phase, NSApp.keyWindow, NSApp.mainWindow]);
    NSInteger before = [evaluate(view, @"window.probeKeys") integerValue];
    NSWindow *target = NSApp.keyWindow;
    for (NSNumber *type in @[@(NSEventTypeKeyDown), @(NSEventTypeKeyUp)]) {
        NSEvent *key = [NSEvent keyEventWithType:type.unsignedIntegerValue location:NSZeroPoint modifierFlags:0
                                      timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:target.windowNumber
                                        context:nil characters:@"k" charactersIgnoringModifiers:@"k"
                                      isARepeat:NO keyCode:40];
        [NSApp postEvent:key atStart:NO];
    }
    waitFor(^BOOL{ return [evaluate(view, @"window.probeKeys") integerValue] > before; },
            [@"Page missed a trusted keyboard shortcut " stringByAppendingString:phase]);
}

static void testCinema(FMTab *tab, NSWindow *browser, NSString *url, NSString *playerClass,
                       NSTimeInterval entryDuration, NSTimeInterval exitDuration) {
    WKWebView *view = tab.view;
    NSString *fixture = @"<!doctype html><meta name=viewport content='width=device-width'>"
              "<style>body{margin:0} #movie_player{position:relative;width:70vw;height:55vh;background:black}"
              "video{width:100%;height:100%;display:block}</style>"
              "<button id=focus>Focus</button><section id=movie_player class=PLAYER_CLASS>"
              "<video id=video class=html5-main-video muted playsinline></video><button id=toggle style='position:absolute;top:10px;left:10px'>Fullscreen</button></section><div id=wide></div>"
              "<script>const video=document.getElementById('video'), player=document.getElementById('movie_player');"
              "const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');"
              "setInterval(()=>ctx.fillText(String(performance.now()),5,20),50);"
              "const stream=canvas.captureStream(20); video.srcObject=stream; video.play();"
              "const token=crypto.randomUUID(); let changes=0;window.probeKeys=0;"
              "window.addEventListener('keydown',e=>{if(e.isTrusted && e.key==='k')probeKeys++});"
              "document.addEventListener('fullscreenchange',()=>{changes++;"
              "if(location.hostname.endsWith('youtube.com')){const wide=document.getElementById('wide');"
              "if(document.fullscreenElement)wide.appendChild(player);else wide.before(player);}"
              "if(!document.fullscreenElement && location.hostname.endsWith('netflix.com'))document.getElementById('focus').focus();"
              "const audit=window.webkit.messageHandlers.layoutAudit;if(!audit)return;"
              "if(document.fullscreenElement){"
              "video.style.width='64px';video.style.height='36px';setTimeout(()=>{"
              "video.style.width='';video.style.height='';const r=video.getBoundingClientRect();"
              "audit.postMessage(Math.abs(r.width-innerWidth)<1 && Math.abs(r.height-innerHeight)<1?'fullscreen':'wrong-size');"
              "},120);}else{"
              "player.style.visibility='hidden';setTimeout(()=>{player.style.visibility='';"
              "const rect=player.getBoundingClientRect();audit.postMessage(Math.abs(rect.width-innerWidth*.7)<1"
              " && Math.abs(rect.height-innerHeight*.55)<1?'inline':'wrong-size');},95);}});"
              "window.checkIdentity=()=>video === document.querySelector('video') && video.srcObject === stream"
              " && video.readyState >= 2 && !video.paused && token === document.documentElement.dataset.token;"
              "document.documentElement.dataset.token=token;</script>";
    loadPage(view, [fixture stringByReplacingOccurrencesOfString:@"PLAYER_CLASS" withString:playerClass], url);
    waitFor(^BOOL{ return pageHas(view, @"checkIdentity() && video.currentTime > 0"); },
            @"Test video is not playing");
    NSWindow *cover = tab.cinemaExitCover.window;
    check(cover && cover != browser && !cover.isVisible, @"Expected a prewarmed window before entering Cinema");
    CinemaLayoutAudit *audit = [CinemaLayoutAudit new];
    audit.player = browser;
    audit.simulateResponderReset = [url containsString:@"youtube.com"];
    audit.cover = cover;
    audit.displayBounds = CGDisplayBounds([browser.screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue]);
    [view.configuration.userContentController addScriptMessageHandler:audit name:@"layoutAudit"];
    NSRect originalBrowserFrame = browser.frame;
    NSRect originalHostFrame = tab.hostView.frame;
    NSView *originalParent = view.superview;
    [browser makeFirstResponder:view];
    evaluate(view, @"document.getElementById('toggle').focus()");
    check(pageHas(view, @"document.activeElement?.id === 'toggle'"), @"Fixture failed to focus its player control");
    NSResponder *originalResponder = browser.firstResponder;
    checkKeyboardTarget(browser, view, @"before entry");
    NSNumber *before = evaluate(view, @"video.currentTime");
    __block BOOL nativeFullscreenStarted = NO;
    __block BOOL exiting = NO;
    __block BOOL coverSeenBeforeRestore = NO;
    __block BOOL coverSeenBeforeEnlarging = NO;
    __block NSTimeInterval entryShown = 0, exitShown = 0;
    NSTimer *probe = [NSTimer scheduledTimerWithTimeInterval:0.01 repeats:YES block:^(NSTimer *timer) {
        if (view.fullscreenState != WKFullscreenStateNotInFullscreen) nativeFullscreenStarted = YES;
        if (!tab.cinemaExitCover.window.isVisible) return;
        if (!exiting && !entryShown) {
            entryShown = NSProcessInfo.processInfo.systemUptime;
            // A changed preference applies to the next transition.
            if (entryDuration != exitDuration) fmwSetCinemaCoverDuration(exitDuration);
        }
        if (exiting && !exitShown) {
            exitShown = NSProcessInfo.processInfo.systemUptime;
            if (exitDuration != 1.0) fmwSetCinemaCoverDuration(1.0);
        }
        if (!exiting && !viewFillsScreen(view) && coverIsInFront(cover, browser, audit.displayBounds))
            coverSeenBeforeEnlarging = YES;
        else if (exiting && viewFillsScreen(view) && coverIsInFront(cover, browser, audit.displayBounds))
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
    waitFor(^BOOL{ return audit.enlargedAt > 0 && !cover.isVisible; }, @"Entry cover did not clear after the video enlarged");
    check(coverSeenBeforeEnlarging, @"Entry cover was never above the inline player before the window enlarged");
    checkCoverDuration(entryShown, entryDuration, @"entry");
    checkPageFocus(view, @"toggle");
    checkKeyboardTarget(browser, view, @"after entry cover dismissed");
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
    checkCoverDuration(exitShown, exitDuration, @"exit");
    check(coverSeenBeforeRestore, @"Exit cover was never above the fullscreen player before restoration");
    [view.configuration.userContentController removeScriptMessageHandlerForName:@"layoutAudit"];
    [probe invalidate];
    check(!nativeFullscreenStarted, @"WebKit started a native transition during Cinema");
    check(view.superview == originalParent && NSEqualRects(tab.hostView.frame, originalHostFrame) &&
          NSEqualRects(view.frame, tab.hostView.bounds) && NSEqualRects(browser.frame, originalBrowserFrame),
          @"Cinema did not restore the original browser and tab layout");
    checkKeyboardTarget(browser, view, @"after exit cover dismissed");
    check(browser.firstResponder == originalResponder, @"Cinema did not restore the original window focus");
    checkPageFocus(view, useEscape ? @"focus" : @"toggle");
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
    waitFor(^BOOL{ return tab.cinemaExitCover.window.isVisible; }, @"Lost-ready fixture did not show the entry cover");
    NSTimeInterval entryWait = NSProcessInfo.processInfo.systemUptime;
    waitFor(^BOOL{ return tab.cinemaSession.active && pageHas(view, @"document.fullscreenElement===player"); },
            @"Lost-ready fixture did not enter Cinema");
    waitFor(^BOOL{ return !tab.transitionTicket && !tab.cinemaExitCover.window.isVisible; },
            @"Missing readiness message left entry cover open");
    checkCoverDuration(entryWait, 1.0, @"missing ready on entry");
    check(pageHas(view, @"droppedReady===1 && document.fullscreenElement===player && checkIdentity()"),
          @"Lost entry-ready signal interrupted fullscreen playback");
    NSTimeInterval started = NSProcessInfo.processInfo.systemUptime;
    evaluate(view, @"document.exitFullscreen();undefined");
    waitFor(^BOOL{ return !tab.cinemaSession.active && !tab.transitionTicket && !tab.cinemaExitCover.window.isVisible; },
            @"Missing readiness message left exit window or session open");
    checkCoverDuration(started, 1.0, @"missing ready on exit");
    check(pageHas(view, @"droppedReady===2 && document.fullscreenElement===null && checkIdentity()"),
          @"Lost-ready fixture missed the signal or interrupted playback");
    // Reverse an entry while its ready acknowledgement is pending. The stale
    // ticket from entering must not dismiss the new exit cover.
    evaluate(view, @"player.requestFullscreen();undefined");
    waitFor(^BOOL{ return tab.cinemaSession.active && pageHas(view, @"document.fullscreenElement===player"); },
            @"Could not reenter after losing readiness");
    NSInteger staleEntry = tab.transitionTicket;
    check(staleEntry > 0 && tab.cinemaExitCover.window.isVisible, @"Expected a pending masked entry");
    pumpEvents(.45);
    NSTimeInterval reversal = NSProcessInfo.processInfo.systemUptime;
    evaluate(view, @"document.exitFullscreen();undefined");
    waitFor(^BOOL{ return tab.transitionTicket > 0 && tab.transitionTicket != staleEntry && !tab.cinemaSession.active; },
            @"Rapid reversal failed to acquire a distinct exit ticket");
    NSString *lateReceipt = [NSString stringWithFormat:@"EventTarget.prototype.dispatchEvent.call(window,new CustomEvent('luna-cinema-request',"
                             "{cancelable:true,detail:JSON.stringify({action:'ready',id:%ld})})); undefined", (long)staleEntry];
    evaluate(view, lateReceipt);
    check(tab.cinemaExitCover.window.isVisible && tab.transitionTicket != staleEntry, @"Stale entry receipt dismissed exit");
    waitFor(^BOOL{ return !tab.transitionTicket && !tab.cinemaExitCover.window.isVisible; },
            @"Next exit was affected by the lost readiness message");
    evaluate(view, @"delete window.dispatchEvent");
    checkCoverDuration(reversal, 1.0, @"reversal");
}

static void testFocusChangeDuringCover(FMTab *tab, NSWindow *browser, BOOL anotherWindow) {
    WKWebView *view = tab.view;
    // Keep the cover pending while focus moves to another real input target.
    evaluate(view, @"window.dispatchEvent=function(e){if(e.type==='luna-cinema-request' &&"
                    " JSON.parse(e.detail).action==='ready') return false;"
                    "return EventTarget.prototype.dispatchEvent.call(this,e);};"
                    "player.requestFullscreen(); undefined");
    waitFor(^BOOL{ return tab.cinemaSession.active && tab.cinemaExitCover.window.isVisible &&
                          pageHas(view, @"document.fullscreenElement===player"); },
            @"Expected a live fullscreen session before transferring keyboard focus");

    NSWindow *destination = browser;
    if (anotherWindow) {
        destination = [[NSWindow alloc] initWithContentRect:NSMakeRect(20, 20, 360, 120)
                                                  styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                                    backing:NSBackingStoreBuffered defer:NO];
        destination.releasedWhenClosed = NO;
        [destination makeKeyAndOrderFront:nil];
    }
    NSTextView *editor = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, 160, 40)];
    [destination.contentView addSubview:editor];
    check([destination makeFirstResponder:editor], @"Alternate text editor did not accept focus");
    NSTimeInterval transferred = NSProcessInfo.processInfo.systemUptime;
    waitFor(^BOOL{ return !tab.cinemaExitCover.window.isVisible; }, @"Cover stayed up after focus transfer");
    if (anotherWindow) check(NSProcessInfo.processInfo.systemUptime - transferred < .6,
                             @"Cover blocked another selected window for the remaining timer");
    check(NSApp.keyWindow == destination && destination.firstResponder == editor,
          @"Dismissing the cover stole keyboard focus from the selected text editor");
    [editor removeFromSuperview];
    if (anotherWindow) [destination close];
    [browser makeKeyAndOrderFront:nil];
    [browser makeFirstResponder:view];
    evaluate(view, @"delete window.dispatchEvent; if(document.fullscreenElement) document.exitFullscreen(); undefined");
    waitFor(^BOOL{ return !tab.cinemaSession.active && !tab.transitionTicket; }, @"Focus fixture did not exit Cinema");
}

static void testDisabledCover(FMTab *tab) {
    fmwSetCinemaCoverDuration(0);
    NSRect original = tab.hostView.frame;
    __block BOOL shown = NO;
    NSTimer *probe = [NSTimer scheduledTimerWithTimeInterval:.005 repeats:YES block:^(NSTimer *timer) {
        if (tab.cinemaExitCover.window.isVisible) shown = YES;
    }];
    evaluate(tab.view, @"player.requestFullscreen();undefined");
    waitFor(^BOOL{ return viewFillsScreen(tab.view) && pageHas(tab.view, @"document.fullscreenElement === player"); },
            @"Setting zero prevented fullscreen entry");
    evaluate(tab.view, @"document.exitFullscreen();undefined");
    waitFor(^BOOL{ return !tab.cinemaSession.active && !tab.transitionTicket &&
                          pageHas(tab.view, @"document.fullscreenElement === null && checkIdentity()"); },
            @"Setting zero did not return the live player to the page");
    [probe invalidate];
    check(!shown && NSEqualRects(original, tab.hostView.frame), @"Setting zero displayed a cover or lost the inline geometry");
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
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
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
        testCinema(tab, window, @"https://www.youtube.com/watch?v=luna-cinema-fixture", @"html5-video-player", 1.0, 1.0);
        testLostReady(tab);
        fmwSetCinemaCoverDuration(2.0);
        testCinema(tab, window, @"https://www.netflix.com/watch/12345678", @"watch-video", 2.0, 4.0);
        testFocusChangeDuringCover(tab, window, NO);
        testFocusChangeDuringCover(tab, window, YES);
        testDisabledCover(tab);
        testGenericFullscreen(tab);
        fmwClose(1);
        pumpEvents(0.2);
        puts("MACOS_FULLSCREEN_PASSED (default, custom and disabled cover timing, entry and exit cover ordering and delayed layouts, lost signals and stale replies, reentry, Escape, live playback, key/main state, trusted keys, responder recovery, selected window/editor, DOM focus, generic fullscreen)");
    }
    return 0;
}
