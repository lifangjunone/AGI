#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>


@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSButton *refreshButton;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSTask *refreshTask;
@property(nonatomic, strong) NSTimer *dailyTimer;
@end


@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self buildMenu];
    [self buildWindow];
    [self loadLatestOrGenerate];
    [self scheduleDailyRefresh];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    [self.dailyTimer invalidate];
    if (self.refreshTask.running) {
        [self.refreshTask terminate];
    }
}

- (void)buildMenu {
    NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@""];

    NSMenuItem *appItem = [[NSMenuItem alloc] initWithTitle:@"" action:nil keyEquivalent:@""];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"商机罗盘"];
    [appMenu addItemWithTitle:@"关于商机罗盘" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"退出商机罗盘" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    [mainMenu addItem:appItem];

    NSMenuItem *editItem = [[NSMenuItem alloc] initWithTitle:@"编辑" action:nil keyEquivalent:@""];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"编辑"];
    [editMenu addItemWithTitle:@"撤销" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"重做" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"剪切" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"复制" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"粘贴" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"全选" action:@selector(selectAll:) keyEquivalent:@"a"];
    editItem.submenu = editMenu;
    [mainMenu addItem:editItem];

    NSMenuItem *viewItem = [[NSMenuItem alloc] initWithTitle:@"显示" action:nil keyEquivalent:@""];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"显示"];
    [viewMenu addItemWithTitle:@"更新数据" action:@selector(refresh:) keyEquivalent:@"r"];
    [viewMenu addItemWithTitle:@"重新载入界面" action:@selector(reloadWebView:) keyEquivalent:@"R"];
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [viewMenu addItemWithTitle:@"进入全屏幕" action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    viewItem.submenu = viewMenu;
    [mainMenu addItem:viewItem];
    NSApp.mainMenu = mainMenu;
}

- (NSURL *)supportDirectory {
    NSURL *base = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                          inDomains:NSUserDomainMask] firstObject];
    NSURL *directory = [base URLByAppendingPathComponent:@"Opportunity Compass" isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:directory
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];
    return directory;
}

- (NSURL *)reportsDirectory {
    NSURL *directory = [[self supportDirectory] URLByAppendingPathComponent:@"reports" isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:directory
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];
    return directory;
}

- (NSURL *)latestHTMLURL {
    return [[self supportDirectory] URLByAppendingPathComponent:@"latest.html"];
}

- (NSURL *)engineURL {
    return [[NSBundle mainBundle] URLForResource:@"opportunity_engine" withExtension:@"py"];
}

- (NSString *)updateLabelForURL:(NSURL *)url {
    NSDate *modifiedAt = nil;
    [url getResourceValue:&modifiedAt forKey:NSURLContentModificationDateKey error:nil];
    if (!modifiedAt) {
        return @"数据更新时间未知";
    }
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.locale = [NSLocale localeWithLocaleIdentifier:@"zh_CN"];
    formatter.dateFormat = @"MM-dd HH:mm";
    return [NSString stringWithFormat:@"数据更新于 %@", [formatter stringFromDate:modifiedAt]];
}

- (void)buildWindow {
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1260, 800)
                                              styleMask:NSWindowStyleMaskTitled |
                                                        NSWindowStyleMaskClosable |
                                                        NSWindowStyleMaskMiniaturizable |
                                                        NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    self.window.title = @"商机罗盘";
    self.window.titleVisibility = NSWindowTitleHidden;
    self.window.titlebarAppearsTransparent = YES;
    self.window.styleMask |= NSWindowStyleMaskFullSizeContentView;
    self.window.toolbarStyle = NSWindowToolbarStyleUnified;
    self.window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    self.window.minSize = NSMakeSize(980, 640);
    self.window.backgroundColor = NSColor.windowBackgroundColor;
    self.window.restorable = YES;
    self.window.frameAutosaveName = @"OpportunityCompassMainWindow";
    self.window.collectionBehavior = NSWindowCollectionBehaviorMoveToActiveSpace |
                                     NSWindowCollectionBehaviorFullScreenPrimary;

    if (![self.window setFrameUsingName:@"OpportunityCompassMainWindow"]) {
        NSPoint pointer = NSEvent.mouseLocation;
        NSScreen *targetScreen = NSScreen.mainScreen;
        for (NSScreen *screen in NSScreen.screens) {
            if (NSPointInRect(pointer, screen.frame)) {
                targetScreen = screen;
                break;
            }
        }
        NSRect visible = targetScreen.visibleFrame;
        NSRect frame = self.window.frame;
        frame.origin.x = NSMidX(visible) - NSWidth(frame) / 2;
        frame.origin.y = NSMidY(visible) - NSHeight(frame) / 2;
        [self.window setFrame:frame display:NO];
    }

    NSVisualEffectView *root = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
    root.material = NSVisualEffectMaterialContentBackground;
    root.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    root.state = NSVisualEffectStateFollowsWindowActiveState;
    self.window.contentView = root;

    NSImageView *icon = [[NSImageView alloc] initWithFrame:NSZeroRect];
    icon.image = [NSImage imageWithSystemSymbolName:@"scope"
                           accessibilityDescription:@"商机罗盘"];
    icon.contentTintColor = NSColor.controlAccentColor;
    [icon.widthAnchor constraintEqualToConstant:18].active = YES;
    [icon.heightAnchor constraintEqualToConstant:18].active = YES;

    NSTextField *brand = [NSTextField labelWithString:@"商机罗盘"];
    brand.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];

    NSTextField *subtitle = [NSTextField labelWithString:@"每天 1-3 个可验证商机"];
    subtitle.font = [NSFont systemFontOfSize:10 weight:NSFontWeightRegular];
    subtitle.textColor = NSColor.secondaryLabelColor;

    NSStackView *brandText = [NSStackView stackViewWithViews:@[brand, subtitle]];
    brandText.orientation = NSUserInterfaceLayoutOrientationVertical;
    brandText.spacing = 0;
    brandText.alignment = NSLayoutAttributeLeading;

    NSStackView *brandGroup = [NSStackView stackViewWithViews:@[icon, brandText]];
    brandGroup.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    brandGroup.spacing = 8;
    brandGroup.alignment = NSLayoutAttributeCenterY;

    NSView *spacer = [[NSView alloc] initWithFrame:NSZeroRect];
    [spacer setContentHuggingPriority:NSLayoutPriorityDefaultLow
                       forOrientation:NSLayoutConstraintOrientationHorizontal];

    self.statusLabel = [NSTextField labelWithString:@"读取本机情报"];
    self.statusLabel.font = [NSFont systemFontOfSize:10 weight:NSFontWeightRegular];
    self.statusLabel.textColor = NSColor.secondaryLabelColor;

    NSButton *folderButton = [NSButton buttonWithImage:
        [NSImage imageWithSystemSymbolName:@"folder" accessibilityDescription:@"报告目录"]
                                               target:self
                                               action:@selector(openReports:)];
    folderButton.bezelStyle = NSBezelStyleTexturedRounded;
    folderButton.toolTip = @"打开商机报告目录";

    self.refreshButton = [NSButton buttonWithTitle:@"更新数据"
                                            target:self
                                            action:@selector(refresh:)];
    self.refreshButton.image = [NSImage imageWithSystemSymbolName:@"arrow.clockwise"
                                         accessibilityDescription:@"更新数据"];
    self.refreshButton.imagePosition = NSImageLeading;
    self.refreshButton.bezelStyle = NSBezelStyleTexturedRounded;
    self.refreshButton.toolTip = @"更新数据（⌘R）";

    NSStackView *toolbar = [NSStackView stackViewWithViews:@[
        brandGroup, spacer, self.statusLabel, folderButton, self.refreshButton
    ]];
    toolbar.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    toolbar.alignment = NSLayoutAttributeCenterY;
    toolbar.spacing = 10;
    toolbar.edgeInsets = NSEdgeInsetsMake(10, 15, 9, 16);
    toolbar.translatesAutoresizingMaskIntoConstraints = NO;

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    [configuration.userContentController addScriptMessageHandler:self name:@"opportunityCompass"];
    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.webView.allowsBackForwardNavigationGestures = NO;

    [root addSubview:toolbar];
    [root addSubview:self.webView];
    [NSLayoutConstraint activateConstraints:@[
        [toolbar.topAnchor constraintEqualToAnchor:root.safeAreaLayoutGuide.topAnchor],
        [toolbar.leadingAnchor constraintEqualToAnchor:root.safeAreaLayoutGuide.leadingAnchor],
        [toolbar.trailingAnchor constraintEqualToAnchor:root.safeAreaLayoutGuide.trailingAnchor],
        [self.webView.topAnchor constraintEqualToAnchor:toolbar.bottomAnchor constant:1],
        [self.webView.leadingAnchor constraintEqualToAnchor:root.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:root.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:root.bottomAnchor]
    ]];
}

- (void)loadLatestOrGenerate {
    NSURL *latest = [self latestHTMLURL];
    if ([[NSFileManager defaultManager] fileExistsAtPath:latest.path]) {
        [self.webView loadFileURL:latest allowingReadAccessToURL:[self supportDirectory]];
        self.statusLabel.stringValue = [self updateLabelForURL:latest];
    } else {
        NSString *loading = @"<!doctype html><meta charset='utf-8'><style>"
            "body{margin:0;height:100vh;display:grid;place-items:center;background:#f2f3f5;"
            "color:#737a84;font:13px -apple-system}.box{text-align:center}.dot{width:9px;height:9px;"
            "margin:0 auto 12px;border-radius:50%;background:#16866f;box-shadow:0 0 0 6px #dceee9}"
            "</style><div class='box'><div class='dot'></div>正在从本机情报中筛选今日商机…</div>";
        [self.webView loadHTMLString:loading baseURL:nil];
        [self refresh:nil];
    }
}

- (void)reloadWebView:(id)sender {
    [self loadLatestOrGenerate];
}

- (void)refresh:(id)sender {
    if (self.refreshTask.running) {
        return;
    }
    NSURL *engine = [self engineURL];
    if (!engine) {
        [self showError:@"应用资源不完整" detail:@"找不到 opportunity_engine.py。"];
        return;
    }

    self.refreshButton.enabled = NO;
    self.refreshButton.toolTip = @"正在更新数据";
    self.statusLabel.stringValue = @"正在读取情报并重新计算…";

    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/python3"];
    task.arguments = @[engine.path, @"--generate"];
    NSPipe *output = [NSPipe pipe];
    NSPipe *error = [NSPipe pipe];
    task.standardOutput = output;
    task.standardError = error;
    self.refreshTask = task;

    __weak typeof(self) weakSelf = self;
    task.terminationHandler = ^(NSTask *finishedTask) {
        NSData *errorData = [[error fileHandleForReading] readDataToEndOfFile];
        NSString *errorText = [[NSString alloc] initWithData:errorData encoding:NSUTF8StringEncoding] ?: @"";
        dispatch_async(dispatch_get_main_queue(), ^{
            __strong typeof(weakSelf) self = weakSelf;
            self.refreshButton.enabled = YES;
            self.refreshButton.toolTip = @"更新数据（⌘R）";
            self.refreshTask = nil;
            if (finishedTask.terminationStatus == 0) {
                [self loadLatestOrGenerate];
            } else {
                NSString *lastUpdate = [self updateLabelForURL:[self latestHTMLURL]];
                self.statusLabel.stringValue = [NSString stringWithFormat:@"更新失败 · %@", lastUpdate];
                [self showError:@"无法生成今日商机"
                         detail:errorText.length ? errorText : @"请先在 Technology Exploration 中完成一次数据刷新。"];
            }
        });
    };

    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
        self.refreshButton.enabled = YES;
        self.refreshButton.toolTip = @"更新数据（⌘R）";
        self.refreshTask = nil;
        self.statusLabel.stringValue = [NSString stringWithFormat:@"启动失败 · %@",
            [self updateLabelForURL:[self latestHTMLURL]]];
        [self showError:@"无法启动商机引擎" detail:launchError.localizedDescription];
    }
}

- (void)scheduleDailyRefresh {
    [self.dailyTimer invalidate];
    NSDate *now = [NSDate date];
    NSCalendar *calendar = [NSCalendar currentCalendar];
    NSDateComponents *components = [calendar components:
        NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay fromDate:now];
    components.hour = 9;
    components.minute = 10;
    components.second = 0;
    NSDate *next = [calendar dateFromComponents:components];
    if ([next compare:now] != NSOrderedDescending) {
        next = [calendar dateByAddingUnit:NSCalendarUnitDay value:1 toDate:next options:0];
    }
    self.dailyTimer = [[NSTimer alloc] initWithFireDate:next
                                              interval:24 * 60 * 60
                                                target:self
                                              selector:@selector(refresh:)
                                              userInfo:nil
                                               repeats:YES];
    [[NSRunLoop mainRunLoop] addTimer:self.dailyTimer forMode:NSRunLoopCommonModes];
}

- (void)showError:(NSString *)title detail:(NSString *)detail {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = title;
    alert.informativeText = detail;
    alert.alertStyle = NSAlertStyleWarning;
    [alert addButtonWithTitle:@"好"];
    [alert beginSheetModalForWindow:self.window completionHandler:nil];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:NSDictionary.class]) {
        return;
    }
    NSDictionary *payload = (NSDictionary *)message.body;
    NSString *action = payload[@"action"];
    if ([action isEqualToString:@"open-url"]) {
        NSString *value = payload[@"url"];
        NSURL *url = [NSURL URLWithString:value ?: @""];
        if (url && [@[@"http", @"https"] containsObject:url.scheme.lowercaseString]) {
            [[NSWorkspace sharedWorkspace] openURL:url];
        }
    } else if ([action isEqualToString:@"refresh"]) {
        [self refresh:nil];
    } else if ([action isEqualToString:@"copy-text"]) {
        NSString *text = [payload[@"text"] isKindOfClass:NSString.class] ? payload[@"text"] : @"";
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        [pasteboard clearContents];
        [pasteboard setString:text forType:NSPasteboardTypeString];
    }
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated &&
        [@[@"http", @"https"] containsObject:url.scheme.lowercaseString]) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

@end


int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
