// Included after FMTab so extensions only see page tabs, never the trusted Wails UI.
API_AVAILABLE(macos(15.4))
@interface FMExtensionHost : NSObject <WKWebExtensionControllerDelegate, WKWebExtensionWindow>
@end
static WKWebExtensionController *gExtensionController API_AVAILABLE(macos(15.4));
static NSMutableDictionary<NSString *, WKWebExtensionContext *> *gExtensionContexts API_AVAILABLE(macos(15.4));
static FMExtensionHost *gExtensionHost API_AVAILABLE(macos(15.4));
static WKWebExtensionAction *gExtensionAction API_AVAILABLE(macos(15.4));

@implementation FMExtensionHost
- (NSArray *)tabsForWebExtensionContext:(WKWebExtensionContext *)context { return [gTabs.allValues sortedArrayUsingComparator:^NSComparisonResult(FMTab *a, FMTab *b) { return a.tid < b.tid ? NSOrderedAscending : NSOrderedDescending; }] ?: @[]; }
- (id<WKWebExtensionTab>)activeTabForWebExtensionContext:(WKWebExtensionContext *)context { return gTabs[@(gActive >= 0 ? gActive : gLastWebTab)]; }
- (NSArray *)webExtensionController:(WKWebExtensionController *)controller openWindowsForExtensionContext:(WKWebExtensionContext *)context { return @[self]; }
- (id<WKWebExtensionWindow>)webExtensionController:(WKWebExtensionController *)controller focusedWindowForExtensionContext:(WKWebExtensionContext *)context { return self; }
- (void)webExtensionController:(WKWebExtensionController *)controller openNewTabUsingConfiguration:(WKWebExtensionTabConfiguration *)configuration forExtensionContext:(WKWebExtensionContext *)context completionHandler:(void (^)(id<WKWebExtensionTab>, NSError *))done {
 int tid = gNextPopup++;
 FMTab *tab = tabFor(tid, nil);
 if (configuration.url) [tab.view loadRequest:[NSURLRequest requestWithURL:configuration.url]];
 emit(@{@"t":@"popup", @"tab":@(tid), @"opener":@(gActive)});
 done(tab,nil);
}
- (void)webExtensionController:(WKWebExtensionController *)controller presentPopupForAction:(WKWebExtensionAction *)action forExtensionContext:(WKWebExtensionContext *)context completionHandler:(void (^)(NSError *))done {
 NSView *anchor = fmWindow().contentView;
 if (!anchor) { done([NSError errorWithDomain:@"Luna" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Kein Browserfenster geöffnet"}]); return; }
 [gExtensionAction closePopup]; gExtensionAction = action;
 NSPopover *popover = action.popupPopover;
 popover.behavior = NSPopoverBehaviorTransient;
 [popover showRelativeToRect:NSMakeRect(MAX(0,anchor.bounds.size.width-110),anchor.bounds.size.height-75,30,20) ofView:anchor preferredEdge:NSRectEdgeMinY];
 done(nil);
}
@end
static id extensionWindow(void) { return gExtensionHost; }
static WKWebExtensionController *extensionController(void) {
 if (!gExtensionController) {
  gExtensionHost=[FMExtensionHost new];gExtensionContexts=[NSMutableDictionary new];
  gExtensionController=[WKWebExtensionController new];gExtensionController.delegate=gExtensionHost;
 }
 return gExtensionController;
}
static void extensionReply(int req, NSString *value, NSString *error) {
 NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"value":value?:@"",@"error":error?:@""} options:0 error:nil];
 NSString *json=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
 char *c=strdup(json.UTF8String);goSnapshotDone(req,c);free(c);
}
void fmwExtension(const char *json, int req) {
 NSString *input=[NSString stringWithUTF8String:json];
 dispatch_async(dispatch_get_main_queue(), ^{
  if (@available(macOS 15.4, *)) {
   NSDictionary *call=[NSJSONSerialization JSONObjectWithData:[input dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
   NSString *op=call[@"op"];NSDictionary *args=call[@"args"];if (![args isKindOfClass:NSDictionary.class]) args=@{};
   NSString *ident=args[@"id"]?:@"";
   WKWebExtensionController *controller=extensionController();
   if ([op isEqual:@"supported"]) {extensionReply(req,@"",nil);return;}
   WKWebExtensionContext *existing=gExtensionContexts[ident];
   if ([op isEqual:@"unload"] || [op isEqual:@"remove"]) {
    NSError *error=nil;
    if (existing && existing.isLoaded && ![controller unloadExtensionContext:existing error:&error]) {extensionReply(req,nil,error.localizedDescription);return;}
    if ([op isEqual:@"remove"]) [gExtensionContexts removeObjectForKey:ident];
    if (gExtensionAction.webExtensionContext == existing) { [gExtensionAction closePopup]; gExtensionAction=nil; }
    extensionReply(req,@"",nil);return;
   }
   if ([op isEqual:@"open"]) {
    if (!existing || !existing.isLoaded) {extensionReply(req,nil,@"Erweiterung ist nicht aktiv");return;}
    // Loading an extension does not imply its Chromium-only APIs are available.
    if ([existing.webExtension.manifest[@"permissions"] containsObject:@"proxy"]) {
     [gExtensionAction closePopup];gExtensionAction=nil;
     extensionReply(req,nil,@"Diese VPN-Erweiterung benötigt Chrome-Proxy-Funktionen, die Luna auf dem Mac derzeit nicht unterstützt. Deshalb kann ihr Steuerungsfenster nicht starten.");return;
    }
    for (NSError *error in existing.errors) {
     if ([error.domain isEqual:WKWebExtensionContextErrorDomain] && error.code == WKWebExtensionContextErrorBackgroundContentFailedToLoad) {
      [gExtensionAction closePopup];gExtensionAction=nil;gExtensionAction=nil;
      extensionReply(req,nil,@"Der Hintergrunddienst dieser Erweiterung ist abgestürzt. Möglicherweise benötigt sie Browserfunktionen, die Luna noch nicht unterstützt.");return;
     }
    }
    FMTab *tab=gTabs[@(gActive >= 0 ? gActive : gLastWebTab)];
    if (!tab) tab=gTabs[args[@"tab"]];
    if (tab) [existing userGesturePerformedInTab:tab];
    if (existing.webExtension.displayActionLabel || existing.webExtension.manifest[@"action"] || existing.webExtension.manifest[@"browser_action"]) {
     [existing performActionForTab:tab];extensionReply(req,@"",nil);
    } else if (existing.optionsPageURL) {
     int tid=gNextPopup++;FMTab *option=tabFor(tid,nil);[option.view loadRequest:[NSURLRequest requestWithURL:existing.optionsPageURL]];
     emit(@{@"t":@"popup",@"tab":@(tid),@"opener":@(gActive)});extensionReply(req,@"",nil);
    } else extensionReply(req,nil,@"Diese Erweiterung arbeitet im Hintergrund und hat kein Menü.");
    return;
   }
   if (![op isEqual:@"load"]) {extensionReply(req,nil,@"Unbekannte Erweiterungsaktion");return;}
   if (existing) {
    NSError *error=nil;
    if (!existing.isLoaded && ![controller loadExtensionContext:existing error:&error]) {extensionReply(req,nil,error.localizedDescription);return;}
    [existing didOpenWindow:gExtensionHost];for (FMTab *tab in gTabs.allValues) [existing didOpenTab:tab];
    extensionReply(req,ident,nil);return;
   }
   NSURL *url=[NSURL fileURLWithPath:args[@"path"] isDirectory:YES];
   [WKWebExtension extensionWithResourceBaseURL:url completionHandler:^(WKWebExtension *extension,NSError *error){
    if (!extension) {extensionReply(req,nil,error.localizedDescription?:@"Erweiterung kann nicht geladen werden");return;}
    WKWebExtensionContext *context=[[WKWebExtensionContext alloc] initForExtension:extension];
    context.uniqueIdentifier=ident;
    context.baseURL=[NSURL URLWithString:[NSString stringWithFormat:@"webkit-extension://%@/",ident]];
    // Only required manifest permissions were shown and accepted at installation.
    for (NSString *permission in extension.requestedPermissions) [context setPermissionStatus:WKWebExtensionContextPermissionStatusGrantedExplicitly forPermission:permission];
    for (WKWebExtensionMatchPattern *pattern in extension.allRequestedMatchPatterns) [context setPermissionStatus:WKWebExtensionContextPermissionStatusGrantedExplicitly forMatchPattern:pattern];
    NSError *loadError=nil;
    if (![controller loadExtensionContext:context error:&loadError]) {extensionReply(req,nil,loadError.localizedDescription);return;}
    gExtensionContexts[ident]=context;
    [context didOpenWindow:gExtensionHost];
    for (FMTab *tab in gTabs.allValues) [context didOpenTab:tab];
    extensionReply(req,ident,nil);
   }];
  } else extensionReply(req,nil,@"Chrome-Erweiterungen benötigen auf dem Mac mindestens macOS 15.4.");
 });
}
