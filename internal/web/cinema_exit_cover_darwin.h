#pragma once
#import "cinema_artwork_darwin.h"

// The player and the web page keep keyboard focus in both directions.
@interface FMCinemaExitPanel : NSPanel
@end
@implementation FMCinemaExitPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
- (NSRect)constrainFrameRect:(NSRect)frame toScreen:(NSScreen *)screen { return frame; }
@end

@interface FMCinemaExitCover : NSObject
@property (nonatomic, strong, readonly) NSWindow *window;
- (BOOL)prepareForWindow:(NSWindow *)player label:(NSString *)label;
- (BOOL)showAboveWindow:(NSWindow *)player ticket:(NSInteger)ticket duration:(NSTimeInterval)duration
              onEscape:(void (^)(void))onEscape onInterrupt:(void (^)(BOOL cancelled))onInterrupt;
- (BOOL)canRevealTicket:(NSInteger)ticket;
- (void)dismissTicket:(NSInteger)ticket;
@end

@implementation FMCinemaExitCover {
    NSSize _imageSize;
    CGFloat _imageScale;
    NSString *_imageLabel;
    __weak NSWindow *_player;
    NSInteger _visibleTicket;
    NSTimeInterval _revealAt;
    void (^_onInterrupt)(BOOL cancelled);
    id _keyMonitor;
}

- (BOOL)prepareForWindow:(NSWindow *)player label:(NSString *)label {
    NSScreen *screen = player.screen;
    if (!screen) return NO;
    _player = player;
    NSRect bounds = { NSZeroPoint, screen.frame.size };
    if (!_window) {
        NSPanel *panel = [[FMCinemaExitPanel alloc] initWithContentRect:bounds
            styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
            backing:NSBackingStoreBuffered defer:NO screen:screen];
        panel.releasedWhenClosed = NO;
        // The bitmap covers every pixel. Keep the panel composited with the
        // browser underneath so WebKit can render its restored viewport.
        panel.opaque = NO;
        panel.backgroundColor = NSColor.clearColor;
        panel.hasShadow = NO;
        // A click on the hourglass outside the shrinking browser must not
        // activate the app underneath. This panel still cannot become key.
        panel.ignoresMouseEvents = NO;
        panel.movable = NO;
        // Order out explicitly on deactivation. AppKit must not bring a
        // previously hidden transition panel back when Luna becomes active.
        panel.hidesOnDeactivate = NO;
        panel.animationBehavior = NSWindowAnimationBehaviorNone;
        panel.collectionBehavior = NSWindowCollectionBehaviorMoveToActiveSpace |
                                   NSWindowCollectionBehaviorFullScreenAuxiliary |
                                   NSWindowCollectionBehaviorIgnoresCycle;
        _window = panel;
    }
    if (!NSEqualRects(_window.frame, screen.frame)) [_window setFrame:screen.frame display:NO];
    CGFloat scale = screen.backingScaleFactor;
    if (NSEqualSizes(_imageSize, bounds.size) && _imageScale == scale && [_imageLabel isEqualToString:label])
        return YES;

    FMCinemaArtworkView *art = [[FMCinemaArtworkView alloc] initWithFrame:bounds];
    art.label = label;
    _window.contentView = art;
    // Assign the pixel and point sizes explicitly. A hidden window's initial
    // backing scale can still belong to the previous monitor.
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:NULL pixelsWide:(NSInteger)ceil(NSWidth(bounds) * scale)
        pixelsHigh:(NSInteger)ceil(NSHeight(bounds) * scale) bitsPerSample:8 samplesPerPixel:4
        hasAlpha:YES isPlanar:NO colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    if (!bitmap) {
        _imageLabel = nil;
        return NO;
    }
    bitmap.size = bounds.size;
    [art cacheDisplayInRect:bounds toBitmapImageRep:bitmap];
    NSImage *image = [[NSImage alloc] initWithSize:bounds.size];
    [image addRepresentation:bitmap];
    FMCinemaSurface *surface = [[FMCinemaSurface alloc] initWithFrame:bounds];
    surface.imageScaling = NSImageScaleAxesIndependently;
    surface.image = image;
    [surface prepareSandForLabel:label];
    [surface setAccessibilityLabel:label];
    _window.contentView = surface;
    [_window display];
    _imageSize = bounds.size;
    _imageScale = scale;
    _imageLabel = [label copy];
    return YES;
}

- (BOOL)showAboveWindow:(NSWindow *)player ticket:(NSInteger)ticket duration:(NSTimeInterval)duration
              onEscape:(void (^)(void))onEscape onInterrupt:(void (^)(BOOL cancelled))onInterrupt {
    if (duration <= 0 || player != _player || !_imageLabel || !NSApp.isActive ||
        !player.isVisible || !player.isOnActiveSpace || !NSEqualRects(_window.frame, player.screen.frame))
        return NO;
    // This is the same desktop as the playing window. A transient, independent
    // panel stays display-sized when the browser changes its frame.
    // The menu bar and Dock may return while the browser is being restored.
    // The foreground-app and active-Space guards bound this transient level.
    if (_visibleTicket) {
        // A quick reversal reuses the visible surface. Retire the previous
        // owner's callbacks without flashing the intermediate browser frame.
        void (^previousInterrupt)(BOOL) = _onInterrupt;
        [self clearTicket];
        if (previousInterrupt) previousInterrupt(YES);
    }
    _visibleTicket = ticket;
    _onInterrupt = [onInterrupt copy];
    if (onEscape) {
        _keyMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
            if (event.window == player && event.keyCode == 53 &&
                !(event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl | NSEventModifierFlagOption))) {
                onEscape();
                return nil;
            }
            return event;
        }];
    }
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(interrupt:) name:NSApplicationWillResignActiveNotification object:NSApp];
    [center addObserver:self selector:@selector(interrupt:) name:NSApplicationWillHideNotification object:NSApp];
    [center addObserver:self selector:@selector(interrupt:) name:NSWindowWillCloseNotification object:player];
    [center addObserver:self selector:@selector(interrupt:) name:NSWindowWillMiniaturizeNotification object:player];
    [center addObserver:self selector:@selector(interrupt:) name:NSWindowWillBeginSheetNotification object:player];
    [center addObserver:self selector:@selector(keyWindowChanged:) name:NSWindowDidBecomeKeyNotification object:nil];
    [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self selector:@selector(interrupt:)
        name:NSWorkspaceActiveSpaceDidChangeNotification object:nil];
    _window.level = MAX(NSPopUpMenuWindowLevel, player.level + 1);
    [_window orderFront:nil];
    if (!_window.isVisible) {
        [self dismissTicket:ticket];
        return NO;
    }
    // Each showing captures its own duration, including a quick reversal.
    _revealAt = NSProcessInfo.processInfo.systemUptime + duration;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(duration * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (self->_visibleTicket == ticket) [self interrupt:nil];
    });
    [(FMCinemaSurface *)_window.contentView startSandWithDuration:duration];
    return YES;
}

- (BOOL)canRevealTicket:(NSInteger)ticket {
    return _visibleTicket != ticket || NSProcessInfo.processInfo.systemUptime >= _revealAt;
}

- (void)keyWindowChanged:(NSNotification *)notification {
    if (notification.object != _player) [self interrupt:notification];
}

- (void)interrupt:(NSNotification *)notification {
    if (!_visibleTicket) return;
    void (^onInterrupt)(BOOL) = _onInterrupt;
    NSInteger ticket = _visibleTicket;
    if (onInterrupt) onInterrupt(notification != nil);
    [self dismissTicket:ticket];
}

- (void)clearTicket {
    _visibleTicket = 0;
    _onInterrupt = nil;
    if (_keyMonitor) [NSEvent removeMonitor:_keyMonitor];
    _keyMonitor = nil;
    [NSNotificationCenter.defaultCenter removeObserver:self];
    [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self];
}

- (void)dismissTicket:(NSInteger)ticket {
    if (!ticket || ticket != _visibleTicket) return;
    [self clearTicket];
    [_window orderOut:nil];
    if ([_window.contentView isKindOfClass:FMCinemaSurface.class]) [(FMCinemaSurface *)_window.contentView stopSand];
}
@end
