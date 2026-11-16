#pragma once
#import <Cocoa/Cocoa.h>

// A static vector illustration keeps the cover crisp on Retina screens and
// leaves the compositor free to run the fullscreen transition underneath it.
@interface FMCinemaArtworkView : NSView
@property (nonatomic, copy) NSString *label;
@end

@implementation FMCinemaArtworkView
- (BOOL)isOpaque { return YES; }
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }

static NSColor *fmCoverColor(CGFloat r, CGFloat g, CGFloat b) {
    return [NSColor colorWithSRGBRed:r / 255 green:g / 255 blue:b / 255 alpha:1];
}

static void fmDrawHourglass(void) {
    // Draw in a 92 × 120 point artboard. Deliberately unequal curves give the
    // glass and the woodcut-like cap strokes a hand-drawn silhouette.
    NSColor *ink = fmCoverColor(243, 214, 232);
    NSColor *rose = fmCoverColor(216, 137, 184);
    NSBezierPath *glass = [NSBezierPath bezierPath];
    [glass moveToPoint:NSMakePoint(16, 15)];
    [glass curveToPoint:NSMakePoint(37, 53) controlPoint1:NSMakePoint(16, 33) controlPoint2:NSMakePoint(23, 43)];
    [glass curveToPoint:NSMakePoint(39, 64) controlPoint1:NSMakePoint(44, 58) controlPoint2:NSMakePoint(44, 60)];
    [glass curveToPoint:NSMakePoint(15, 105) controlPoint1:NSMakePoint(20, 76) controlPoint2:NSMakePoint(15, 87)];
    [glass lineToPoint:NSMakePoint(77, 105)];
    [glass curveToPoint:NSMakePoint(53, 65) controlPoint1:NSMakePoint(75, 88) controlPoint2:NSMakePoint(69, 76)];
    [glass curveToPoint:NSMakePoint(54, 53) controlPoint1:NSMakePoint(47, 61) controlPoint2:NSMakePoint(46, 59)];
    [glass curveToPoint:NSMakePoint(76, 15) controlPoint1:NSMakePoint(70, 42) controlPoint2:NSMakePoint(77, 30)];
    [glass closePath];
    [[fmCoverColor(78, 49, 68) colorWithAlphaComponent:.5] setFill]; [glass fill];
    glass.lineWidth = 1.8; glass.lineJoinStyle = NSLineJoinStyleRound;
    [ink setStroke]; [glass stroke];

    NSBezierPath *sand = [NSBezierPath bezierPath];
    [sand moveToPoint:NSMakePoint(27, 37)];
    [sand curveToPoint:NSMakePoint(65, 36) controlPoint1:NSMakePoint(40, 39) controlPoint2:NSMakePoint(57, 33)];
    [sand curveToPoint:NSMakePoint(46, 57) controlPoint1:NSMakePoint(62, 44) controlPoint2:NSMakePoint(50, 51)];
    [sand curveToPoint:NSMakePoint(27, 37) controlPoint1:NSMakePoint(42, 51) controlPoint2:NSMakePoint(30, 45)];
    [sand closePath];
    [sand moveToPoint:NSMakePoint(19, 101)];
    [sand curveToPoint:NSMakePoint(45, 85) controlPoint1:NSMakePoint(32, 98) controlPoint2:NSMakePoint(38, 89)];
    [sand curveToPoint:NSMakePoint(72, 101) controlPoint1:NSMakePoint(51, 86) controlPoint2:NSMakePoint(58, 97)];
    [sand closePath]; [rose setFill]; [sand fill];

    NSBezierPath *details = [NSBezierPath bezierPath];
    [details moveToPoint:NSMakePoint(22, 20)];
    [details curveToPoint:NSMakePoint(25, 32) controlPoint1:NSMakePoint(22, 24) controlPoint2:NSMakePoint(23, 29)];
    [details moveToPoint:NSMakePoint(69, 94)];
    [details curveToPoint:NSMakePoint(62, 81) controlPoint1:NSMakePoint(68, 89) controlPoint2:NSMakePoint(65, 84)];
    details.lineWidth = 1.2; details.lineCapStyle = NSLineCapStyleRound;
    [[ink colorWithAlphaComponent:.65] setStroke]; [details stroke];
    [rose setFill];
    for (int i = 0; i < 4; i++) {
        CGFloat radius = 1.1 - .12 * i;
        [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(46 - radius, 62 + i * 5.3, 2 * radius, 2 * radius)] fill];
    }

    NSBezierPath *caps = [NSBezierPath bezierPath];
    for (int i = 0; i < 2; i++) {
        CGFloat y = i ? 106 : 10;
        [caps moveToPoint:NSMakePoint(11, y + .5)];
        [caps curveToPoint:NSMakePoint(81, y) controlPoint1:NSMakePoint(34, y - .8) controlPoint2:NSMakePoint(58, y + 1)];
        [caps lineToPoint:NSMakePoint(80, y + 4.5)];
        [caps lineToPoint:NSMakePoint(12, y + 4.8)]; [caps closePath];
    }
    caps.lineJoinStyle = NSLineJoinStyleRound; caps.lineWidth = 1.8;
    [fmCoverColor(55, 36, 49) setFill]; [caps fill]; [ink setStroke]; [caps stroke];
}

- (void)drawRect:(NSRect)dirtyRect {
    NSRect bounds = self.bounds;
    NSGradient *background = [[NSGradient alloc] initWithStartingColor:fmCoverColor(52, 32, 46)
                                                            endingColor:fmCoverColor(28, 17, 25)];
    [background drawInRect:bounds angle:24];

    NSFont *font = [NSFont systemFontOfSize:54 weight:NSFontWeightMedium];
    NSFontDescriptor *rounded = [font.fontDescriptor fontDescriptorWithDesign:NSFontDescriptorSystemDesignRounded];
    if (rounded) font = [NSFont fontWithDescriptor:rounded size:54] ?: font;
    NSDictionary *attributes = @{ NSFontAttributeName:font,
                                   NSForegroundColorAttributeName:fmCoverColor(251, 238, 246),
                                   NSKernAttributeName:@(-1.6) };
    NSString *label = self.label ?: @"Augenblick";
    NSSize word = [label sizeWithAttributes:attributes];
    CGFloat width = 92 + 24 + word.width;
    CGFloat scale = MAX(.01, MIN(1.25, MIN(NSWidth(bounds) * .76 / width, NSHeight(bounds) * .23 / 120)));
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *transform = [NSAffineTransform transform];
    [transform translateXBy:NSMidX(bounds) - width * scale / 2 yBy:NSMidY(bounds) - 60 * scale];
    [transform scaleBy:scale]; [transform concat];
    fmDrawHourglass();
    [label drawAtPoint:NSMakePoint(116, (120 - word.height) / 2) withAttributes:attributes];
    [NSGraphicsContext restoreGraphicsState];
}
@end

// Neither the player nor the web page may lose keyboard focus during exit.
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
- (BOOL)showAboveWindow:(NSWindow *)player ticket:(NSInteger)ticket onInterrupt:(void (^)(void))onInterrupt;
- (void)dismissTicket:(NSInteger)ticket;
@end

@implementation FMCinemaExitCover {
    NSSize _imageSize;
    CGFloat _imageScale;
    NSString *_imageLabel;
    __weak NSWindow *_player;
    NSInteger _visibleTicket;
    void (^_onInterrupt)(void);
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
        panel.ignoresMouseEvents = YES;
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
    NSImageView *surface = [[NSImageView alloc] initWithFrame:bounds];
    surface.imageScaling = NSImageScaleAxesIndependently;
    surface.image = image;
    [surface setAccessibilityLabel:label];
    _window.contentView = surface;
    [_window display];
    _imageSize = bounds.size;
    _imageScale = scale;
    _imageLabel = [label copy];
    return YES;
}

- (BOOL)showAboveWindow:(NSWindow *)player ticket:(NSInteger)ticket onInterrupt:(void (^)(void))onInterrupt {
    if (player != _player || !_imageLabel || !NSApp.isActive ||
        !player.isVisible || !player.isOnActiveSpace || !NSEqualRects(_window.frame, player.screen.frame))
        return NO;
    // This is the same desktop as the playing window. A transient, independent
    // panel stays display-sized when the browser restores its previous frame.
    // The menu bar and Dock may return while the browser is being restored.
    // The foreground-app and active-Space guards bound this transient level.
    if (_visibleTicket) [self interrupt:nil];
    _visibleTicket = ticket;
    _onInterrupt = [onInterrupt copy];
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(interrupt:) name:NSApplicationWillResignActiveNotification object:NSApp];
    [center addObserver:self selector:@selector(interrupt:) name:NSApplicationWillHideNotification object:NSApp];
    [center addObserver:self selector:@selector(interrupt:) name:NSWindowWillCloseNotification object:player];
    [center addObserver:self selector:@selector(interrupt:) name:NSWindowWillMiniaturizeNotification object:player];
    [NSWorkspace.sharedWorkspace.notificationCenter addObserver:self selector:@selector(interrupt:)
        name:NSWorkspaceActiveSpaceDidChangeNotification object:nil];
    // This deadline belongs to the visible window, including time spent before
    // the browser has restored its frame or WebKit has accepted any script.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 400 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        if (self->_visibleTicket == ticket) [self interrupt:nil];
    });
    _window.level = MAX(NSPopUpMenuWindowLevel, player.level + 1);
    [_window orderFront:nil];
    if (_window.isVisible) return YES;
    [self dismissTicket:ticket];
    return NO;
}

- (void)interrupt:(NSNotification *)notification {
    if (!_visibleTicket) return;
    void (^onInterrupt)(void) = _onInterrupt;
    [self dismissTicket:_visibleTicket];
    if (onInterrupt) onInterrupt();
}

- (void)dismissTicket:(NSInteger)ticket {
    if (!ticket || ticket != _visibleTicket) return;
    _visibleTicket = 0;
    _onInterrupt = nil;
    [NSNotificationCenter.defaultCenter removeObserver:self];
    [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:self];
    [_window orderOut:nil];
}
@end
