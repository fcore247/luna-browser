#pragma once
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>

static const NSTimeInterval FMCinemaCoverDuration = 3.0;

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

static NSDictionary *fmCoverType(void) {
    NSFont *font = [NSFont systemFontOfSize:54 weight:NSFontWeightMedium];
    NSFontDescriptor *rounded = [font.fontDescriptor fontDescriptorWithDesign:NSFontDescriptorSystemDesignRounded];
    if (rounded) font = [NSFont fontWithDescriptor:rounded size:54] ?: font;
    return @{ NSFontAttributeName:font,
                                   NSForegroundColorAttributeName:fmCoverColor(251, 238, 246),
                                   NSKernAttributeName:@(-1.6) };
}

typedef struct { NSPoint origin; CGFloat scale; } FMCinemaArtLayout;

static FMCinemaArtLayout fmCoverLayout(NSRect bounds, NSSize word) {
    CGFloat width = 92 + 24 + word.width;
    CGFloat scale = MAX(.01, MIN(1.25, MIN(NSWidth(bounds) * .76 / width, NSHeight(bounds) * .23 / 120)));
    return (FMCinemaArtLayout){NSMakePoint(NSMidX(bounds) - width * scale / 2,
                                           NSMidY(bounds) - 60 * scale), scale};
}

static void fmDrawHourglass(void) {
    // Draw in a 92 × 120 point artboard. Deliberately unequal curves give the
    // glass and the woodcut-like cap strokes a hand-drawn silhouette.
    NSColor *ink = fmCoverColor(243, 214, 232);
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

    NSBezierPath *details = [NSBezierPath bezierPath];
    [details moveToPoint:NSMakePoint(22, 20)];
    [details curveToPoint:NSMakePoint(25, 32) controlPoint1:NSMakePoint(22, 24) controlPoint2:NSMakePoint(23, 29)];
    [details moveToPoint:NSMakePoint(69, 94)];
    [details curveToPoint:NSMakePoint(62, 81) controlPoint1:NSMakePoint(68, 89) controlPoint2:NSMakePoint(65, 84)];
    details.lineWidth = 1.2; details.lineCapStyle = NSLineCapStyleRound;
    [[ink colorWithAlphaComponent:.65] setStroke]; [details stroke];
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

    NSString *label = self.label ?: @"Augenblick";
    NSDictionary *attributes = fmCoverType();
    NSSize word = [label sizeWithAttributes:attributes];
    FMCinemaArtLayout layout = fmCoverLayout(bounds, word);
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *transform = [NSAffineTransform transform];
    [transform translateXBy:layout.origin.x yBy:layout.origin.y];
    [transform scaleBy:layout.scale]; [transform concat];
    fmDrawHourglass();
    [label drawAtPoint:NSMakePoint(116, (120 - word.height) / 2) withAttributes:attributes];
    [NSGraphicsContext restoreGraphicsState];
}
@end

// The sand uses the two original hand-drawn outlines. Its layers share the
// background's artboard and scale, so the ink, glass and lettering stay still.
static CGPathRef fmCoverSandPath(BOOL upper, CGFloat progress) CF_RETURNS_RETAINED {
    CGFloat scaleY = upper ? 1 - .97 * progress : 1 + .72 * progress;
    CGFloat scaleX = upper ? sqrt(scaleY) : 1 + .055 * progress;
    CGFloat anchorY = upper ? 57 : 101;
    // Flip the illustration's top-down coordinates into Core Animation space.
    CGAffineTransform t = CGAffineTransformMake(scaleX, 0, 0, -scaleY,
                                                46 * (1 - scaleX), 120 - anchorY * (1 - scaleY));
    CGMutablePathRef path = CGPathCreateMutable();
    if (upper) {
        CGPathMoveToPoint(path, &t, 27, 37);
        CGPathAddCurveToPoint(path, &t, 40, 39, 57, 33, 65, 36);
        CGPathAddCurveToPoint(path, &t, 62, 44, 50, 51, 46, 57);
        CGPathAddCurveToPoint(path, &t, 42, 51, 30, 45, 27, 37);
    } else {
        CGPathMoveToPoint(path, &t, 19, 101);
        CGPathAddCurveToPoint(path, &t, 32, 98, 38, 89, 45, 85);
        CGPathAddCurveToPoint(path, &t, 51, 86, 58, 97, 72, 101);
    }
    CGPathCloseSubpath(path);
    return path;
}

@interface FMCinemaSurface : NSImageView
- (void)prepareSandForLabel:(NSString *)label;
- (void)startSand;
- (void)stopSand;
@end

@implementation FMCinemaSurface {
    CAShapeLayer *_upperSand;
    CAShapeLayer *_lowerSand;
    NSArray<CALayer *> *_grains;
}
- (BOOL)isFlipped { return NO; }

- (void)prepareSandForLabel:(NSString *)label {
    self.wantsLayer = YES;
    FMCinemaArtLayout layout = fmCoverLayout(self.bounds, [label sizeWithAttributes:fmCoverType()]);
    CALayer *sand = [CALayer layer];
    sand.bounds = CGRectMake(0, 0, 92, 120);
    sand.anchorPoint = CGPointZero;
    sand.position = layout.origin;
    sand.transform = CATransform3DMakeScale(layout.scale, layout.scale, 1);
    // NSImageView also installs an image backing layer when attached to a window.
    sand.zPosition = 1;
    [self.layer addSublayer:sand];

    NSColor *rose = fmCoverColor(216, 137, 184);
    _upperSand = [CAShapeLayer layer];
    _lowerSand = [CAShapeLayer layer];
    for (CAShapeLayer *pile in @[_upperSand, _lowerSand]) {
        pile.frame = sand.bounds;
        CGPathRef path = fmCoverSandPath(pile == _upperSand, 0);
        pile.path = path;
        CGPathRelease(path);
        pile.fillColor = rose.CGColor;
        pile.contentsScale = self.window.backingScaleFactor ?: NSScreen.mainScreen.backingScaleFactor;
        [sand addSublayer:pile];
    }
    NSMutableArray *grains = [NSMutableArray array];
    for (int i = 0; i < 4; i++) {
        CGFloat radius = 1.1 - .12 * i;
        CALayer *grain = [CALayer layer];
        grain.bounds = CGRectMake(0, 0, 2 * radius, 2 * radius);
        grain.cornerRadius = radius;
        grain.backgroundColor = rose.CGColor;
        grain.position = CGPointMake(46, 120 - (62 + i * 5.3 + radius));
        [sand addSublayer:grain];
        [grains addObject:grain];
    }
    _grains = [grains copy];
}

- (void)startSand {
    [self stopSand];
    if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) return;
    for (CAShapeLayer *pile in @[_upperSand, _lowerSand]) {
        CGPathRef end = fmCoverSandPath(pile == _upperSand, 1);
        CABasicAnimation *flow = [CABasicAnimation animationWithKeyPath:@"path"];
        flow.fromValue = (__bridge id)pile.path;
        flow.toValue = (__bridge id)end;
        flow.duration = FMCinemaCoverDuration;
        flow.fillMode = kCAFillModeForwards;
        flow.removedOnCompletion = NO;
        [pile addAnimation:flow forKey:@"sand-level"];
        CGPathRelease(end);
    }
    for (NSUInteger i = 0; i < _grains.count; i++) {
        CALayer *grain = _grains[i];
        CABasicAnimation *fall = [CABasicAnimation animationWithKeyPath:@"position.y"];
        fall.fromValue = @61;
        fall.toValue = @33;
        fall.duration = .49;
        fall.repeatCount = HUGE_VALF;
        fall.timeOffset = i * fall.duration / _grains.count;
        fall.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseIn];
        [grain addAnimation:fall forKey:@"fall"];
    }
}

- (void)stopSand {
    [_upperSand removeAnimationForKey:@"sand-level"];
    [_lowerSand removeAnimationForKey:@"sand-level"];
    for (CALayer *grain in _grains) [grain removeAnimationForKey:@"fall"];
}
@end
