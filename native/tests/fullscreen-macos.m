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

static void checkTransition(FMTab *tab, WKFullscreenState expected, NSString *request) {
    WKWebView *view = tab.view;
    __block NSWindow *visibleCover = nil;
    __block NSRect coverFrame = NSZeroRect;
    NSMutableArray *history = [NSMutableArray array];
    NSRect screenFrame = (view.window.screen ?: tab.hostView.window.screen).frame;
    // Sample before dispatching the request so we also catch short transitions.
    NSTimer *probe = [NSTimer scheduledTimerWithTimeInterval:0.01 repeats:YES block:^(NSTimer *timer) {
        NSNumber *state = @(view.fullscreenState);
        if (![history.lastObject isEqual:state]) [history addObject:state];
        NSWindow *cover = tab.fullscreenCover;
        if (cover.isVisible && cover.alphaValue > 0.05) {
            visibleCover = cover;
            coverFrame = cover.frame;
        }
    }];
    evaluate(view, request);
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:15];
    while (view.fullscreenState != expected && deadline.timeIntervalSinceNow > 0) pumpEvents(0.05);
    if (view.fullscreenState != expected) {
        id details = evaluate(view, @"JSON.stringify({element: document.fullscreenElement?.id, "
                                     "visibility:document.visibilityState, error:document.body.dataset.error})");
        check(NO, [NSString stringWithFormat:@"Expected fullscreen state %ld, got %ld via %@ (%@)",
                   (long)expected, (long)view.fullscreenState, history, details]);
    }
    // The cover can stay through the next display pass after WebKit finishes.
    deadline = [NSDate dateWithTimeIntervalSinceNow:3];
    while ((!visibleCover || visibleCover.isVisible) && deadline.timeIntervalSinceNow > 0) pumpEvents(0.02);
    [probe invalidate];
    NSString *direction = expected == WKFullscreenStateInFullscreen ? @"entering" : @"exiting";
    check(visibleCover != nil, [@"No visible loading cover while " stringByAppendingString:direction]);
    check(NSEqualRects(coverFrame, screenFrame), [NSString stringWithFormat:@"Cover frame %@ does not cover screen %@", NSStringFromRect(coverFrame), NSStringFromRect(screenFrame)]);
    check(visibleCover.ignoresMouseEvents, @"Loading cover intercepted mouse input");
    check(!visibleCover.isVisible, [@"Loading cover stayed onscreen after " stringByAppendingString:direction]);
}

// WebKit rejects fullscreen requests from fully occluded documents. Keep the
// fixture eligible when another app covers it, without activating this process.
@interface FixtureWindow : NSWindow
@end
@implementation FixtureWindow
- (NSWindowOcclusionState)occlusionState { return NSWindowOcclusionStateVisible; }
@end

int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [NSApp finishLaunching];
        NSWindow *window = [[FixtureWindow alloc]
            initWithContentRect:NSMakeRect(50, 50, 900, 650)
                      styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable | NSWindowStyleMaskClosable
                        backing:NSBackingStoreBuffered defer:NO];
        [window.contentView addSubview:[[WKWebView alloc] initWithFrame:window.contentView.bounds]];
        [window orderFront:nil];
        fmwSetFrame(10, 80, 880, 560);
        fmwShow(1);
        pumpEvents(0.1);

        FMTab *tab = tabFor(1, nil);
        [tab.view loadHTMLString:@"<!doctype html><body><section id=target>Luna fullscreen test</section>"
                         baseURL:[NSURL URLWithString:@"https://fullscreen.example/"]];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:15];
        while (tab.view.loading && deadline.timeIntervalSinceNow > 0) pumpEvents(0.05);
        check([evaluate(tab.view, @"document.fullscreenEnabled && !!document.querySelector('#target')") boolValue],
              @"Fixture cannot use the Fullscreen API");

        for (int pass = 0; pass < 2; pass++) {
            checkTransition(tab, WKFullscreenStateInFullscreen,
                            @"document.querySelector('#target').requestFullscreen()"
                             ".catch(e => document.body.dataset.error = String(e)); undefined");
            check([evaluate(tab.view, @"document.fullscreenElement?.id") isEqual:@"target"],
                  @"Wrong fullscreen element");
            check(fmWindow() == window, @"Fullscreen window replaced the browser window");

            NSRect fullscreenFrame = tab.view.frame;
            double width = 850 - 30 * pass;
            fmwSetFrame(20, 90, width, 530);
            pumpEvents(0.1);
            check(NSEqualRects(tab.view.frame, fullscreenFrame), @"Browser layout resized fullscreen content");
            NSRect destination = NSMakeRect(20, NSHeight(window.contentView.bounds) - 90 - 530, width, 530);
            check(NSEqualRects(tab.hostView.frame, destination), @"Animation destination did not track browser layout");

            checkTransition(tab, WKFullscreenStateNotInFullscreen,
                            @"document.exitFullscreen().catch(e => document.body.dataset.error = String(e)); undefined");
            check(tab.hostView.superview == window.contentView && tab.view.superview == tab.hostView,
                  @"Webview not restored to the browser");
            check(NSEqualRects(tab.hostView.frame, destination) && NSEqualRects(tab.view.frame, tab.hostView.bounds),
                  @"Returned webview does not fill the updated tab frame");
        }
        FMTab *popup = tabFor(2, [WKWebViewConfiguration new]);
        check(popup.view.configuration.preferences.elementFullscreenEnabled, @"Fullscreen disabled on popup tabs");
        fmwClose(2);
        fmwClose(1);
        pumpEvents(0.2);
        puts("MACOS_FULLSCREEN_PASSED (enter/exit twice, loading cover presence and dismissal, destination resize, restoration, popup configuration)");
    }
    return 0;
}
