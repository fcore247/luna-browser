#pragma once
#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// Wails constructs the browser NSWindow subclass. Give that class the usual
// constrainFrameRect: override so Cinema can cover the menu-bar area. AppKit
// also revalidates the frame later, often with nil for the suggested screen.
static char fmCinemaFrameKey;
static void fmExpandCinemaWindow(NSWindow *window, NSScreen *screen) {
    Class cls = window.class;
    if (cls != NSWindow.class && !objc_getAssociatedObject(cls, &fmCinemaFrameKey)) {
        SEL selector = @selector(constrainFrameRect:toScreen:);
        Method method = class_getInstanceMethod(cls, selector);
        NSRect (*original)(id, SEL, NSRect, NSScreen *) = (void *)method_getImplementation(method);
        IMP implementation = imp_implementationWithBlock(^NSRect(NSWindow *receiver, NSRect frame, NSScreen *suggested) {
            NSValue *requested = objc_getAssociatedObject(receiver, &fmCinemaFrameKey);
            if (requested && NSEqualRects(requested.rectValue, frame)) return frame;
            return original(receiver, selector, frame, suggested);
        });
        class_replaceMethod(cls, selector, implementation, method_getTypeEncoding(method));
        objc_setAssociatedObject(cls, &fmCinemaFrameKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    objc_setAssociatedObject(window, &fmCinemaFrameKey, [NSValue valueWithRect:screen.frame], OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [window setFrame:screen.frame display:NO animate:NO];
}

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
    NSRect _windowFrame;
    NSRect _hostFrame;
    NSRect _screenFrame;
    NSNumber *_displayID;
    BOOL _addedFullSizeContent;
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
    _nativeFullscreen = (window.styleMask & NSWindowStyleMaskFullScreen) != 0;
    _addedFullSizeContent = !_nativeFullscreen && (window.styleMask & NSWindowStyleMaskTitled) &&
        !(window.styleMask & NSWindowStyleMaskFullSizeContentView);
    _cornerRadius = host.layer.cornerRadius;
    _autoresizing = host.autoresizingMask;
    _movable = window.movable;
    _toolbar = window.toolbar;
    _toolbarVisible = _toolbar.visible;
    _presentation = NSApp.presentationOptions;
    _titleVisibility = window.titleVisibility;
    _transparentTitleBar = window.titlebarAppearsTransparent;
    _active = YES;

    // Wails already draws into the title-bar area. Replacing the titled frame
    // to hide its controls can reorder the live browser when the frame returns.
    _buttonsToRestore = [NSMutableArray array];
    for (NSNumber *buttonType in @[@(NSWindowCloseButton), @(NSWindowMiniaturizeButton), @(NSWindowZoomButton)]) {
        NSButton *button = [window standardWindowButton:buttonType.unsignedIntegerValue];
        if (button && !button.hidden) {
            [_buttonsToRestore addObject:button];
            button.hidden = YES;
        }
    }
    _toolbar.visible = NO;
    if (!_nativeFullscreen) {
        NSApplicationPresentationOptions options = _presentation;
        // Forced Dock hiding can hand activation to another application when
        // it is released. Auto-hide leaves ownership with this browser window.
        options &= ~(NSApplicationPresentationHideDock | NSApplicationPresentationHideMenuBar);
        NSApp.presentationOptions = options | NSApplicationPresentationAutoHideDock | NSApplicationPresentationAutoHideMenuBar;
        if (_addedFullSizeContent) window.styleMask |= NSWindowStyleMaskFullSizeContentView;
        if (_titleVisibility != NSWindowTitleHidden) window.titleVisibility = NSWindowTitleHidden;
        if (!_transparentTitleBar) window.titlebarAppearsTransparent = YES;
        window.movable = NO;
        fmExpandCinemaWindow(window, screen);
    }
    host.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    host.layer.cornerRadius = 0;
    host.frame = host.superview.bounds;
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
    if (!_nativeFullscreen) {
        objc_setAssociatedObject(window, &fmCinemaFrameKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        if (_addedFullSizeContent) window.styleMask &= ~NSWindowStyleMaskFullSizeContentView;
        if (window.titleVisibility != _titleVisibility) window.titleVisibility = _titleVisibility;
        if (window.titlebarAppearsTransparent != _transparentTitleBar) window.titlebarAppearsTransparent = _transparentTitleBar;
        window.movable = _movable;
        NSRect destination = _windowFrame;
        BOOL screenAvailable = NO;
        for (NSScreen *screen in NSScreen.screens) {
            if (NSIntersectsRect(screen.frame, destination)) { screenAvailable = YES; break; }
        }
        if (!screenAvailable && NSScreen.mainScreen)
            destination = [window constrainFrameRect:destination toScreen:NSScreen.mainScreen];
        [window setFrame:destination display:NO animate:NO];
        NSApp.presentationOptions = _presentation;
    }
    if (_toolbar && _toolbar.visible != _toolbarVisible) _toolbar.visible = _toolbarVisible;
    for (NSButton *button in _buttonsToRestore) button.hidden = NO;
    _buttonsToRestore = nil;
    host.autoresizingMask = _autoresizing;
    host.frame = _hostFrame;
    host.layer.cornerRadius = _cornerRadius;
    [window displayIfNeeded];
    _toolbar = nil;
    _window = nil;
    _host = nil;
}
@end

// AppKit can reset the key window or its first responder independently while
// replacing the titlebar or ordering out a panel. Capture both before either.
@interface FMCinemaFocus : NSObject
@property (nonatomic, weak, readonly) NSView *originalResponder;
- (instancetype)initWithPlayer:(NSView *)player entering:(BOOL)entering previous:(NSView *)previous;
- (void)restoreAfterResize:(BOOL)afterResize;
- (void)orderPlayerFrontForReveal;
- (BOOL)playerHasKeyboardFocus;
@end

@implementation FMCinemaFocus {
    __weak NSWindow *_window;
    __weak NSView *_player;
    __weak NSView *_destination;
    BOOL _wasKey;
    BOOL _wasMain;
}

- (instancetype)initWithPlayer:(NSView *)player entering:(BOOL)entering previous:(NSView *)previous {
    if (!(self = [super init])) return nil;
    NSWindow *window = player.window;
    if (!window || !NSApp.isActive || window.attachedSheet || NSApp.modalWindow ||
        (NSApp.keyWindow && NSApp.keyWindow != window) ||
        (NSApp.mainWindow && NSApp.mainWindow != window)) return nil;
    _wasMain = window.isMainWindow;
    _wasKey = window.isKeyWindow || (!NSApp.keyWindow && _wasMain);
    if (!_wasKey && !_wasMain) return nil;
    _window = window;
    _player = player;
    NSResponder *first = window.firstResponder;
    NSView *view = [first isKindOfClass:NSView.class] ? (NSView *)first : nil;
    _originalResponder = view;
    BOOL pageFocused = view == player || [view isDescendantOf:player];
    if (entering) _destination = pageFocused ? view : player;
    else if (view && view != window.contentView) _destination = view;
    else _destination = (previous == player || [previous isDescendantOf:player]) ? previous : player;
    return self;
}

- (BOOL)ownsForegroundWindow {
    NSWindow *window = _window;
    NSView *player = _player;
    return window && player.window == window && !player.isHiddenOrHasHiddenAncestor &&
        NSApp.isActive && window.isVisible && !window.isMiniaturized && window.isOnActiveSpace &&
        !window.attachedSheet && !NSApp.modalWindow && (!NSApp.keyWindow || NSApp.keyWindow == window) &&
        (!NSApp.mainWindow || NSApp.mainWindow == window);
}

- (void)orderPlayerFrontForReveal {
    // Key status and WindowServer ordering are independent. Only a window
    // that owned input at the start and still owns the foreground may rise.
    if (_wasKey && [self ownsForegroundWindow]) [_window orderFront:nil];
}

- (BOOL)playerHasKeyboardFocus {
    NSWindow *window = _window;
    if (![self ownsForegroundWindow] || !window.isKeyWindow) return NO;
    NSResponder *first = window.firstResponder;
    return first == _player || ([first isKindOfClass:NSView.class] && [(NSView *)first isDescendantOf:_player]);
}

- (void)restoreAfterResize:(BOOL)afterResize {
    if (![self ownsForegroundWindow]) return;
    NSWindow *window = _window;
    NSView *player = _player;
    NSResponder *current = window.firstResponder;
    BOOL lostFocus = !current || current == window || current == window.contentView;
    if (_wasMain && !window.isMainWindow && window.canBecomeMainWindow) [window makeMainWindow];
    if (_wasKey && !window.isKeyWindow && window.canBecomeKeyWindow) [window makeKeyWindow];
    if (!window.isKeyWindow) return;
    // Once the resize has completed, only repair genuinely lost focus. A
    // click or Tab to a different control during the transition takes priority.
    if (!lostFocus && !(afterResize && current == _originalResponder)) return;
    NSView *target = _destination;
    if (target.window != window || target.isHiddenOrHasHiddenAncestor || !target.acceptsFirstResponder) target = player;
    if (target != window.firstResponder && target.acceptsFirstResponder) [window makeFirstResponder:target];
}
@end
