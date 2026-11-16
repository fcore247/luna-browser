#pragma once
#import <Cocoa/Cocoa.h>

// The selected tab already sits above Luna's Wails web view. Expanding that
// existing host preserves the live player, its media session and its Space.
@interface FMCinemaWindowSession : NSObject
@property (nonatomic, readonly) BOOL active;
- (BOOL)beginWithHost:(NSView *)host player:(NSView *)player onExit:(void (^)(BOOL interrupted))onExit;
- (void)end;
@end

@implementation FMCinemaWindowSession {
    __weak NSWindow *_window;
    __weak NSView *_host;
    __weak NSResponder *_previousResponder;
    NSRect _windowFrame;
    NSRect _hostFrame;
    NSRect _screenFrame;
    NSNumber *_displayID;
    NSWindowStyleMask _style;
    NSApplicationPresentationOptions _presentation;
    NSAutoresizingMaskOptions _autoresizing;
    CGFloat _cornerRadius;
    NSToolbar *_toolbar;
    BOOL _toolbarVisible;
    BOOL _movable;
    NSWindowTitleVisibility _titleVisibility;
    BOOL _transparentTitleBar;
    BOOL _nativeFullscreen;
    NSMutableArray<NSButton *> *_buttonsToRestore;
    id _keyMonitor;
    void (^_onExit)(BOOL interrupted);
}

- (BOOL)beginWithHost:(NSView *)host player:(NSView *)player onExit:(void (^)(BOOL interrupted))onExit {
    if (_active) return host == _host;
    NSWindow *window = host.window;
    NSScreen *screen = window.screen;
    if (!screen || host.superview != window.contentView || ![player isDescendantOf:host] || !onExit) return NO;

    _window = window;
    _host = host;
    _onExit = [onExit copy];
    _windowFrame = window.frame;
    _hostFrame = host.frame;
    _screenFrame = screen.frame;
    _displayID = screen.deviceDescription[@"NSScreenNumber"];
    _previousResponder = window.firstResponder;
    _style = window.styleMask;
    _nativeFullscreen = (_style & NSWindowStyleMaskFullScreen) != 0;
    _cornerRadius = host.layer.cornerRadius;
    _autoresizing = host.autoresizingMask;
    _movable = window.movable;
    _toolbar = window.toolbar;
    _toolbarVisible = _toolbar.visible;
    _presentation = NSApp.presentationOptions;
    _titleVisibility = window.titleVisibility;
    _transparentTitleBar = window.titlebarAppearsTransparent;
    _active = YES;

    if (_nativeFullscreen) {
        // Keep AppKit's existing Space and its original non-fullscreen frame.
        _buttonsToRestore = [NSMutableArray array];
        for (NSNumber *buttonType in @[@(NSWindowCloseButton), @(NSWindowMiniaturizeButton), @(NSWindowZoomButton)]) {
            NSButton *button = [window standardWindowButton:buttonType.unsignedIntegerValue];
            if (button && !button.hidden) {
                [_buttonsToRestore addObject:button];
                button.hidden = YES;
            }
        }
        _toolbar.visible = NO;
    } else {
        NSApplicationPresentationOptions options = _presentation;
        options &= ~(NSApplicationPresentationAutoHideDock | NSApplicationPresentationAutoHideMenuBar);
        NSApp.presentationOptions = options | NSApplicationPresentationHideDock | NSApplicationPresentationHideMenuBar;
        window.toolbar = nil;
        window.styleMask = NSWindowStyleMaskBorderless | NSWindowStyleMaskResizable;
        window.movable = NO;
        [window setFrame:screen.frame display:NO animate:NO];
    }
    host.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    host.layer.cornerRadius = 0;
    host.frame = host.superview.bounds;
    [window makeFirstResponder:player];
    [window displayIfNeeded];

    // A local monitor keeps Escape available even if the page captures keys.
    __weak FMCinemaWindowSession *weakSelf = self;
    _keyMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
        FMCinemaWindowSession *session = weakSelf;
        if (session && session.active && event.window == session->_window && event.keyCode == 53 &&
            !(event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl | NSEventModifierFlagOption))) {
            [session requestExit:nil];
            return nil;
        }
        return event;
    }];
    NSNotificationCenter *notifications = NSNotificationCenter.defaultCenter;
    for (NSNotificationName name in @[NSWindowWillCloseNotification, NSWindowWillMiniaturizeNotification,
                                       NSWindowWillEnterFullScreenNotification, NSWindowWillExitFullScreenNotification]) {
        [notifications addObserver:self selector:@selector(requestExit:) name:name object:window];
    }
    [notifications addObserver:self selector:@selector(screensChanged:) name:NSApplicationDidChangeScreenParametersNotification object:nil];
    return YES;
}

- (void)screensChanged:(NSNotification *)notification {
    for (NSScreen *screen in NSScreen.screens) {
        if ([_displayID isEqual:screen.deviceDescription[@"NSScreenNumber"]] && NSEqualRects(screen.frame, _screenFrame)) return;
    }
    [self requestExit:notification];
}

- (void)requestExit:(NSNotification *)notification {
    void (^handler)(BOOL) = _onExit;
    // Only a user exit needs the cover. On close, minimize, or a display
    // change, unwind synchronously before AppKit takes the window away.
    if (handler) handler(notification != nil);
}

- (void)end {
    if (!_active) return;
    _active = NO;
    _onExit = nil;
    [NSNotificationCenter.defaultCenter removeObserver:self];
    if (_keyMonitor) [NSEvent removeMonitor:_keyMonitor];
    _keyMonitor = nil;

    NSWindow *window = _window;
    NSView *host = _host;
    if (_nativeFullscreen) {
        for (NSButton *button in _buttonsToRestore) button.hidden = NO;
        _buttonsToRestore = nil;
    } else {
        NSApp.presentationOptions = _presentation;
        window.styleMask = _style;
        window.toolbar = _toolbar;
        window.titleVisibility = _titleVisibility;
        window.titlebarAppearsTransparent = _transparentTitleBar;
        window.movable = _movable;
        NSRect destination = _windowFrame;
        BOOL screenAvailable = NO;
        for (NSScreen *screen in NSScreen.screens) {
            if (NSIntersectsRect(screen.frame, destination)) { screenAvailable = YES; break; }
        }
        if (!screenAvailable && NSScreen.mainScreen)
            destination = [window constrainFrameRect:destination toScreen:NSScreen.mainScreen];
        [window setFrame:destination display:NO animate:NO];
    }
    if (_toolbar && _toolbar.visible != _toolbarVisible) _toolbar.visible = _toolbarVisible;
    host.autoresizingMask = _autoresizing;
    host.frame = _hostFrame;
    host.layer.cornerRadius = _cornerRadius;
    if (_previousResponder) [window makeFirstResponder:_previousResponder];
    [window displayIfNeeded];
    _toolbar = nil;
    _window = nil;
    _host = nil;
    _previousResponder = nil;
}
@end
