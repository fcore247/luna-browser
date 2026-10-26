#import "../../internal/web/web_darwin.m"
static NSMutableDictionary *results;
void goWebEvent(char *json) {}
void goSnapshotDone(int req,char *value) { results[@(req)] = [NSString stringWithUTF8String:value]; }
static void pump(double seconds) { NSDate *end=[NSDate dateWithTimeIntervalSinceNow:seconds];while (end.timeIntervalSinceNow>0) [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]]; }
static void check(BOOL condition,NSString *reason) { if (!condition) {fprintf(stderr,"FAILED: %s\n",reason.UTF8String);exit(1);} }
static void call(NSString *op,NSString *path) {
 static int seq=0;int req=++seq;NSDictionary *args=@{@"id":@"abcdef0123456789abcdef0123456789",@"path":path?:@"",@"tab":@1};
 NSData *j=[NSJSONSerialization dataWithJSONObject:@{@"op":op,@"args":args} options:0 error:nil];NSString *s=[[NSString alloc]initWithData:j encoding:NSUTF8StringEncoding];fmwExtension(s.UTF8String,req);
 NSDate *end=[NSDate dateWithTimeIntervalSinceNow:20];while (!results[@(req)]&&end.timeIntervalSinceNow>0) pump(.05);
 check(results[@(req)]!=nil,@"Native extension command timed out");
 NSDictionary *response=[NSJSONSerialization JSONObjectWithData:[results[@(req)] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
 check([response[@"error"] length]==0,response[@"error"]);printf("%s passed\n",op.UTF8String);
}
static NSString *marker(void) {
 if (!gTabs[@1]) { pump(.1); return @""; }
 __block BOOL done=NO;__block NSString *value=nil;[gTabs[@1].view evaluateJavaScript:@"document.body?.dataset.lunaExtension || ''" completionHandler:^(id result,NSError *error){value=[result isKindOfClass:NSString.class]?result:@"";done=YES;}];NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:3];while(!done && deadline.timeIntervalSinceNow>0)pump(.02);return value?:@"";
}
int main(int argc,const char **argv) { @autoreleasepool {
 check(argc==3,@"Usage: extensions-macos packageDir httpURL");results=[NSMutableDictionary new];[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
 NSWindow *window=[[NSWindow alloc]initWithContentRect:NSMakeRect(50,50,800,600) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];WKWebView *ui=[[WKWebView alloc]initWithFrame:window.contentView.bounds];[window.contentView addSubview:ui];[window makeKeyAndOrderFront:nil];
 NSString *path=[NSString stringWithUTF8String:argv[1]],*url=[NSString stringWithUTF8String:argv[2]];
 call(@"supported",path);call(@"load",path);
 call(@"open",path);pump(.3);
 check([gExtensionContexts[@"abcdef0123456789abcdef0123456789"] actionForTab:nil].popupWebView != nil,@"Default extension control did not open without a website");
 [gExtensionAction closePopup];
 fmwLoad(1,url.UTF8String);fmwShow(1);
 NSDate *end=[NSDate dateWithTimeIntervalSinceNow:20];while(!marker().length&&end.timeIntervalSinceNow>0)pump(.1);check(marker().intValue>=1,@"Extension did not inject or chrome.storage.local failed");
 int first=marker().intValue;
 fmwShow(-1);pump(.1);call(@"open",path);
 WKWebExtensionContext *context=gExtensionContexts[@"abcdef0123456789abcdef0123456789"];
 WKWebView *popup=[context actionForTab:gTabs[@1]].popupWebView;
 __block NSString *target=@"";end=[NSDate dateWithTimeIntervalSinceNow:10];
 while (![target containsString:@"127.0.0.1"] && end.timeIntervalSinceNow>0) {
  __block BOOL done=NO;[popup evaluateJavaScript:@"document.querySelector('#target')?.textContent || ''" completionHandler:^(id v,NSError *e){target=[v isKindOfClass:NSString.class]?v:@"";done=YES;}];
  NSDate *wait=[NSDate dateWithTimeIntervalSinceNow:2];while(!done && wait.timeIntervalSinceNow>0)pump(.02);pump(.1);
 }
 check([target containsString:@"127.0.0.1"],@"Popup lost the last active webpage while Luna settings are visible");[gExtensionAction closePopup];
 call(@"unload",path);fmwLoad(1,[[url stringByAppendingString:@"?phase=disabled"] UTF8String]);pump(.1);
 end=[NSDate dateWithTimeIntervalSinceNow:15];while ((gTabs[@1].view.loading || ![gTabs[@1].view.URL.query isEqual:@"phase=disabled"]) && end.timeIntervalSinceNow>0)pump(.1);
 check([gTabs[@1].view.URL.query isEqual:@"phase=disabled"] && marker().length==0,@"Disabled extension still injected");
 call(@"load",path);fmwLoad(1,[[url stringByAppendingString:@"?phase=reenabled"] UTF8String]);pump(.1);
 end=[NSDate dateWithTimeIntervalSinceNow:20];while((gTabs[@1].view.loading || ![gTabs[@1].view.URL.query isEqual:@"phase=reenabled"] || marker().intValue<=first)&&end.timeIntervalSinceNow>0)pump(.1);
 check([gTabs[@1].view.URL.query isEqual:@"phase=reenabled"] && marker().intValue>first,@"Extension storage did not persist after reactivation");
 call(@"unload",path);printf("MACOS_EXTENSIONS_PASSED (injection, isolated storage, disable, re-enable, persistence)\n");
 }return 0;}
