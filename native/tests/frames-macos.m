// Verifies that Luna can list and drive cross-origin iframes (MCP browser_page frame_id).
// Usage: frames-macos http://127.0.0.1:18771/outer.html
// The fixture needs two servers: 127.0.0.1:18771 (outer) and localhost:18772 (inner, another origin).
#import "../../internal/web/web_darwin.m"
static NSMutableDictionary *results;
void goWebEvent(char *json) {}
void goCredSubmit(int tab, char *origin, char *user, char *pass) {}
void goSnapshotDone(int req, char *value) { results[@(req)] = [NSString stringWithUTF8String:value]; }
static void pump(double seconds) { NSDate *end = [NSDate dateWithTimeIntervalSinceNow:seconds]; while (end.timeIntervalSinceNow > 0) [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]]; }
static void check(BOOL condition, NSString *reason) { if (!condition) { fprintf(stderr, "FAILED: %s\n", reason.UTF8String); exit(1); } }
static int seq = 100;
static NSString *await(int req) {
	NSDate *end = [NSDate dateWithTimeIntervalSinceNow:20];
	while (!results[@(req)] && end.timeIntervalSinceNow > 0) pump(.05);
	check(results[@(req)] != nil, @"Native call timed out");
	return results[@(req)];
}
static NSArray *frames(void) { int r = ++seq; fmwFrames(1, r); return [NSJSONSerialization JSONObjectWithData:[await(r) dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil]; }
static NSDictionary *inFrame(int frame, NSString *script) {
	int r = ++seq; fmwEvaluateInFrame(1, frame, script.UTF8String, r);
	return [NSJSONSerialization JSONObjectWithData:[await(r) dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
}
static NSArray *waitForFrames(void) {
	NSDate *end = [NSDate dateWithTimeIntervalSinceNow:20]; NSArray *list = @[];
	while (!list.count && end.timeIntervalSinceNow > 0) { pump(.2); list = frames(); }
	return list;
}
int main(int argc, const char **argv) { @autoreleasepool {
	check(argc == 2, @"Usage: frames-macos outerURL"); results = [NSMutableDictionary new];
	[NSApplication sharedApplication]; [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
	NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(50, 50, 800, 600) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
	WKWebView *ui = [[WKWebView alloc] initWithFrame:window.contentView.bounds]; [window.contentView addSubview:ui]; [window makeKeyAndOrderFront:nil];
	fmwSetFrame(0, 0, 800, 600);
	fmwLoad(1, argv[1]); fmwShow(1);
	NSArray *list = waitForFrames();
	check(list.count == 1, [NSString stringWithFormat:@"Expected exactly the visible iframe, got %@", list]);
	check([list[0][@"url"] hasSuffix:@"/inner.html"] && [list[0][@"id"] intValue] == 1 && [list[0][@"title"] isEqual:@"Inner quiz"], @"Frame metadata wrong");
	// The outer page really cannot see inside (cross-origin), but Luna can.
	__block id crossOrigin = nil; __block BOOL done = NO;
	[gTabs[@1].view evaluateJavaScript:@"(function(){try{return document.querySelector('#lesson').contentDocument===null?'blocked':'open'}catch(e){return 'blocked'}})()" completionHandler:^(id v, NSError *e) { crossOrigin = v; done = YES; }];
	while (!done) pump(.02);
	check([crossOrigin isEqual:@"blocked"], @"Fixture is not cross-origin");
	NSDictionary *read = inFrame(1, @"JSON.stringify({text:document.body.innerText,origin:location.origin})");
	check([read[@"text"] containsString:@"Question 1"] && [read[@"origin"] containsString:@"18772"], @"Could not read inside the cross-origin frame");
	NSDictionary *click = inFrame(1, @"document.querySelector('#q1').click();JSON.stringify({checked:document.querySelector('#q1').checked})");
	check([click[@"checked"] boolValue], @"Could not click inside the cross-origin frame");
	NSDictionary *bad = inFrame(7, @"1");
	check([bad[@"error"] length] > 0, @"Unknown frame_id must fail with an error");
	// Reload the outer page: stale frame entries must not leak or duplicate.
	fmwLoad(1, argv[1]); pump(1.5);
	list = waitForFrames();
	check(list.count == 1, [NSString stringWithFormat:@"Frame list after reload should have one entry, got %@", list]);
	check(![inFrame(1, @"JSON.stringify({checked:document.querySelector('#q1').checked})")[@"checked"] boolValue], @"Frame state survived the reload");
	printf("MACOS_FRAMES_PASSED (list, cross-origin read, click, unknown id, reload)\n");
	return 0;
}}
