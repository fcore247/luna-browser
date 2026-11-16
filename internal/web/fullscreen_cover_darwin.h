#pragma once
#import <Cocoa/Cocoa.h>

// A static vector illustration keeps the cover crisp on Retina screens and
// leaves the compositor free to run the fullscreen transition underneath it.
@interface FMFullscreenCoverView : NSView
@property (nonatomic, copy) NSString *label;
@end

@implementation FMFullscreenCoverView
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

static NSWindow *newFullscreenCover(NSScreen *screen, NSString *label) {
    if (!screen) return nil;
    NSPanel *panel = [[NSPanel alloc] initWithContentRect:screen.frame
                                               styleMask:(NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel)
                                                 backing:NSBackingStoreBuffered defer:NO];
    panel.releasedWhenClosed = NO;
    panel.opaque = YES;
    panel.backgroundColor = fmCoverColor(36, 22, 32);
    panel.hasShadow = NO;
    panel.hidesOnDeactivate = NO;
    panel.ignoresMouseEvents = YES;
    panel.level = NSStatusWindowLevel;
    panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                               NSWindowCollectionBehaviorFullScreenAuxiliary |
                               NSWindowCollectionBehaviorStationary |
                               NSWindowCollectionBehaviorIgnoresCycle;
    panel.animationBehavior = NSWindowAnimationBehaviorNone;
    FMFullscreenCoverView *art = [[FMFullscreenCoverView alloc] initWithFrame:NSMakeRect(0,0,NSWidth(screen.frame),NSHeight(screen.frame))];
    art.label = label;
    panel.contentView = art;
    [panel setFrame:screen.frame display:NO];
    return panel;
}
