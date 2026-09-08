#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <sys/stat.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler,
                                   NSTableViewDataSource, NSTableViewDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) WKWebView *projectWebView;
@property(nonatomic, strong) NSView *matchView;
@property(nonatomic, strong) NSButton *dashboardModeButton;
@property(nonatomic, strong) NSButton *matchModeButton;
@property(nonatomic, strong) NSButton *refreshButton;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSTask *refreshTask;
@property(nonatomic, strong) NSTask *advisoryTask;
@property(nonatomic, strong) NSTask *providerTask;
@property(nonatomic, strong) NSTimer *dailyTimer;
@property(nonatomic, strong) NSTimer *advisoryPollTimer;
@property(nonatomic, strong) NSTextField *requirementField;
@property(nonatomic, strong) NSPopUpButton *domainPopup;
@property(nonatomic, strong) NSPopUpButton *depthPopup;
@property(nonatomic, strong) NSButton *matchButton;
@property(nonatomic, strong) NSProgressIndicator *matchProgress;
@property(nonatomic, strong) NSTextField *matchStatus;
@property(nonatomic, strong) NSTableView *resultsTable;
@property(nonatomic, strong) NSArray<NSDictionary *> *matchCandidates;
@property(nonatomic, strong) NSURL *activeJobDirectory;
@property(nonatomic) NSInteger projectLoadAttempts;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self buildMainMenu];
    [self buildWindow];
    [self startProvider];
    [self loadLatestReport];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    if ([[[NSProcessInfo processInfo] arguments] containsObject:@"--open-match"]) {
        [self switchMode:self.matchModeButton];
    }
    if (![[[NSProcessInfo processInfo] arguments] containsObject:@"--show-latest"]) {
        [self refresh:nil];
    }
    [self scheduleNextDailyRefresh];
}

- (void)buildMainMenu {
    NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@""];

    NSMenuItem *appMenuItem = [[NSMenuItem alloc] initWithTitle:@"" action:nil keyEquivalent:@""];
    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"Technology Exploration Agent"];
    [appMenu addItemWithTitle:@"退出 Technology Exploration Agent"
                       action:@selector(terminate:) keyEquivalent:@"q"];
    appMenuItem.submenu = appMenu;
    [mainMenu addItem:appMenuItem];

    NSMenuItem *editMenuItem = [[NSMenuItem alloc] initWithTitle:@"编辑" action:nil keyEquivalent:@""];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"编辑"];
    [editMenu addItemWithTitle:@"撤销" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"剪切" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"复制" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"粘贴" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"全选" action:@selector(selectAll:) keyEquivalent:@"a"];
    editMenuItem.submenu = editMenu;
    [mainMenu addItem:editMenuItem];

    NSApp.mainMenu = mainMenu;
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    [self.advisoryPollTimer invalidate];
    if (self.advisoryTask.running) [self.advisoryTask terminate];
    if (self.providerTask.running) [self.providerTask terminate];
}

- (NSURL *)reportsDirectory {
    NSURL *support = [[[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                              inDomains:NSUserDomainMask] firstObject];
    NSURL *directory = [support URLByAppendingPathComponent:@"Technology Exploration Agent/reports" isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:directory
                              withIntermediateDirectories:YES attributes:nil error:nil];
    return directory;
}

- (NSURL *)configURL {
    return [[[self reportsDirectory] URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"config.json"];
}

- (void)buildWindow {
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1180, 820)
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                                                        NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Technology Radar";
    self.window.titleVisibility = NSWindowTitleHidden;
    self.window.titlebarAppearsTransparent = YES;
    self.window.styleMask |= NSWindowStyleMaskFullSizeContentView;
    self.window.toolbarStyle = NSWindowToolbarStyleUnified;
    self.window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    self.window.minSize = NSMakeSize(920, 640);
    self.window.backgroundColor = NSColor.windowBackgroundColor;
    self.window.restorable = YES;
    self.window.frameAutosaveName = @"TechnologyExplorerMainWindow";
    self.window.collectionBehavior = NSWindowCollectionBehaviorMoveToActiveSpace |
                                     NSWindowCollectionBehaviorFullScreenPrimary;
    if (![self.window setFrameUsingName:@"TechnologyExplorerMainWindow"]) {
        NSPoint pointer = NSEvent.mouseLocation;
        NSScreen *targetScreen = NSScreen.mainScreen;
        for (NSScreen *screen in NSScreen.screens) {
            if (NSPointInRect(pointer, screen.frame)) {
                targetScreen = screen;
                break;
            }
        }
        NSRect targetFrame = targetScreen.visibleFrame;
        NSRect windowFrame = self.window.frame;
        windowFrame.origin.x = NSMidX(targetFrame) - NSWidth(windowFrame) / 2;
        windowFrame.origin.y = NSMidY(targetFrame) - NSHeight(windowFrame) / 2;
        [self.window setFrame:windowFrame display:NO];
    }

    NSVisualEffectView *root = [[NSVisualEffectView alloc] init];
    root.material = NSVisualEffectMaterialContentBackground;
    root.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    root.state = NSVisualEffectStateActive;
    root.translatesAutoresizingMaskIntoConstraints = NO;
    self.window.contentView = root;

    NSImageView *brandIcon = [[NSImageView alloc] initWithFrame:NSZeroRect];
    brandIcon.image = [NSImage imageWithSystemSymbolName:@"scope"
                                accessibilityDescription:@"Signal Desk"];
    brandIcon.contentTintColor = NSColor.controlAccentColor;
    [brandIcon.widthAnchor constraintEqualToConstant:18].active = YES;
    [brandIcon.heightAnchor constraintEqualToConstant:18].active = YES;
    NSTextField *brand = [NSTextField labelWithString:@"SIGNAL DESK"];
    brand.font = [NSFont systemFontOfSize:12 weight:NSFontWeightBold];
    brand.textColor = NSColor.labelColor;
    NSStackView *brandGroup = [NSStackView stackViewWithViews:@[brandIcon, brand]];
    brandGroup.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    brandGroup.alignment = NSLayoutAttributeCenterY;
    brandGroup.spacing = 7;

    self.dashboardModeButton = [NSButton buttonWithTitle:@"情报工作台"
                                                   target:self action:@selector(switchMode:)];
    self.dashboardModeButton.tag = 0;
    self.dashboardModeButton.identifier = @"technology.match.dashboard";
    self.matchModeButton = [NSButton buttonWithTitle:@"需求匹配"
                                               target:self action:@selector(switchMode:)];
    self.matchModeButton.tag = 1;
    self.matchModeButton.identifier = @"technology.match.mode";
    for (NSButton *button in @[self.dashboardModeButton, self.matchModeButton]) {
        button.bezelStyle = NSBezelStyleTexturedRounded;
        button.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
        [button setButtonType:NSButtonTypeToggle];
        [button.widthAnchor constraintGreaterThanOrEqualToConstant:92].active = YES;
    }
    self.dashboardModeButton.state = NSControlStateValueOn;
    NSStackView *modeGroup = [NSStackView stackViewWithViews:@[
        self.dashboardModeButton, self.matchModeButton
    ]];
    modeGroup.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    modeGroup.spacing = 2;

    self.refreshButton = [NSButton buttonWithImage:[NSImage imageWithSystemSymbolName:@"arrow.clockwise" accessibilityDescription:@"刷新"]
                                             target:self action:@selector(refresh:)];
    self.refreshButton.toolTip = @"刷新数据";
    self.refreshButton.bezelStyle = NSBezelStyleTexturedRounded;
    NSButton *settingsButton = [NSButton buttonWithImage:[NSImage imageWithSystemSymbolName:@"slider.horizontal.3" accessibilityDescription:@"设置"]
                                                  target:self action:@selector(openSettings:)];
    settingsButton.toolTip = @"检索主题、数据源与通知设置";
    settingsButton.bezelStyle = NSBezelStyleTexturedRounded;
    NSButton *folderButton = [NSButton buttonWithImage:[NSImage imageWithSystemSymbolName:@"folder" accessibilityDescription:@"报告目录"]
                                                target:self action:@selector(openReports:)];
    folderButton.toolTip = @"打开报告目录";
    folderButton.bezelStyle = NSBezelStyleTexturedRounded;
    self.statusLabel = [NSTextField labelWithString:@"最新报告"];
    self.statusLabel.font = [NSFont systemFontOfSize:11 weight:NSFontWeightRegular];
    self.statusLabel.textColor = NSColor.secondaryLabelColor;

    NSView *spacer = [[NSView alloc] init];
    [spacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
    NSStackView *toolbar = [NSStackView stackViewWithViews:@[
        brandGroup, modeGroup, spacer, self.statusLabel, folderButton, settingsButton, self.refreshButton
    ]];
    toolbar.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    toolbar.alignment = NSLayoutAttributeCenterY;
    toolbar.spacing = 10;
    toolbar.edgeInsets = NSEdgeInsetsMake(11, 76, 9, 16);
    toolbar.translatesAutoresizingMaskIntoConstraints = NO;
    [toolbar setHuggingPriority:NSLayoutPriorityRequired forOrientation:NSLayoutConstraintOrientationVertical];

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    NSDictionary *boardPreferences = [self loadConfig][@"board_preferences"];
    if (![boardPreferences isKindOfClass:NSDictionary.class]) boardPreferences = @{};
    NSData *preferencesData = [NSJSONSerialization dataWithJSONObject:boardPreferences options:0 error:nil];
    NSString *preferencesJSON = [[NSString alloc] initWithData:preferencesData encoding:NSUTF8StringEncoding] ?: @"{}";
    NSString *injection = [NSString stringWithFormat:
        @"window.__nativeBoardPreferences = %@;"
         "if ('scrollRestoration' in history) history.scrollRestoration = 'manual';",
        preferencesJSON];
    WKUserScript *preferencesScript = [[WKUserScript alloc] initWithSource:injection
                                                             injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                                          forMainFrameOnly:YES];
    [configuration.userContentController addUserScript:preferencesScript];
    [configuration.userContentController addScriptMessageHandler:self name:@"technologyRadar"];
    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;
    self.webView.translatesAutoresizingMaskIntoConstraints = NO;
    self.matchView = [self buildMatchView];
    self.matchView.hidden = YES;

    [root addSubview:toolbar];
    [root addSubview:self.webView];
    [root addSubview:self.matchView];
    [NSLayoutConstraint activateConstraints:@[
        [toolbar.topAnchor constraintEqualToAnchor:root.topAnchor],
        [toolbar.leadingAnchor constraintEqualToAnchor:root.safeAreaLayoutGuide.leadingAnchor],
        [toolbar.trailingAnchor constraintEqualToAnchor:root.safeAreaLayoutGuide.trailingAnchor],
        [self.webView.topAnchor constraintEqualToAnchor:toolbar.bottomAnchor constant:1],
        [self.webView.leadingAnchor constraintEqualToAnchor:root.leadingAnchor],
        [self.webView.trailingAnchor constraintEqualToAnchor:root.trailingAnchor],
        [self.webView.bottomAnchor constraintEqualToAnchor:root.bottomAnchor],
        [self.matchView.topAnchor constraintEqualToAnchor:toolbar.bottomAnchor constant:1],
        [self.matchView.leadingAnchor constraintEqualToAnchor:root.leadingAnchor],
        [self.matchView.trailingAnchor constraintEqualToAnchor:root.trailingAnchor],
        [self.matchView.bottomAnchor constraintEqualToAnchor:root.bottomAnchor]
    ]];
}

- (NSView *)buildMatchView {
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    self.projectWebView = [[WKWebView alloc] initWithFrame:NSZeroRect
                                             configuration:configuration];
    self.projectWebView.navigationDelegate = self;
    self.projectWebView.translatesAutoresizingMaskIntoConstraints = NO;
    return self.projectWebView;
/*
    NSVisualEffectView *container = [[NSVisualEffectView alloc] init];
    container.material = NSVisualEffectMaterialContentBackground;
    container.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    container.translatesAutoresizingMaskIntoConstraints = NO;

    NSTextField *title = [NSTextField labelWithString:@"需求匹配工作台"];
    title.font = [NSFont systemFontOfSize:28 weight:NSFontWeightBold];
    NSTextField *subtitle = [NSTextField labelWithString:@"把业务需求映射到开源项目、模块和验证证据。"];
    subtitle.font = [NSFont systemFontOfSize:13];
    subtitle.textColor = NSColor.secondaryLabelColor;

    NSTextField *requirementLabel = [NSTextField labelWithString:@"需求摘要"];
    requirementLabel.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
    self.requirementField = [[NSTextField alloc] init];
    self.requirementField.placeholderString = @"例如：设备检修工单、审批流、状态流转和知识库";
    self.requirementField.identifier = @"technology.match.requirement";
    self.requirementField.cell.wraps = YES;
    self.requirementField.cell.scrollable = NO;
    [self.requirementField.heightAnchor constraintEqualToConstant:64].active = YES;

    NSTextField *domainLabel = [NSTextField labelWithString:@"业务领域"];
    domainLabel.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
    self.domainPopup = [[NSPopUpButton alloc] init];
    [self.domainPopup addItemsWithTitles:@[@"自动识别", @"设备运维", @"企业管理", @"研发效能", @"数据智能", @"客户服务"]];
    self.domainPopup.identifier = @"technology.match.domain";

    NSTextField *depthLabel = [NSTextField labelWithString:@"分析深度"];
    depthLabel.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
    self.depthPopup = [[NSPopUpButton alloc] init];
    [self.depthPopup addItemsWithTitles:@[@"快速建议", @"工程验证", @"代码图谱"]];
    self.depthPopup.identifier = @"technology.match.depth";

    self.matchButton = [NSButton buttonWithTitle:@"开始匹配" target:self action:@selector(startMatch:)];
    self.matchButton.bezelStyle = NSBezelStyleTexturedRounded;
    self.matchButton.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
    self.matchButton.keyEquivalent = @"\r";
    [self.matchButton.widthAnchor constraintEqualToConstant:112].active = YES;
    [self.matchButton.heightAnchor constraintEqualToConstant:32].active = YES;
    self.matchButton.identifier = @"technology.match.start";

    NSStackView *domainGroup = [NSStackView stackViewWithViews:@[domainLabel, self.domainPopup]];
    domainGroup.orientation = NSUserInterfaceLayoutOrientationVertical;
    domainGroup.alignment = NSLayoutAttributeLeading;
    domainGroup.spacing = 6;
    NSStackView *depthGroup = [NSStackView stackViewWithViews:@[depthLabel, self.depthPopup]];
    depthGroup.orientation = NSUserInterfaceLayoutOrientationVertical;
    depthGroup.alignment = NSLayoutAttributeLeading;
    depthGroup.spacing = 6;
    NSView *formSpacer = [[NSView alloc] init];
    [formSpacer setContentHuggingPriority:NSLayoutPriorityDefaultLow
                           forOrientation:NSLayoutConstraintOrientationHorizontal];
    NSStackView *options = [NSStackView stackViewWithViews:@[
        domainGroup, depthGroup, formSpacer, self.matchButton
    ]];
    options.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    options.alignment = NSLayoutAttributeBottom;
    options.spacing = 18;

    self.matchProgress = [[NSProgressIndicator alloc] init];
    self.matchProgress.indeterminate = NO;
    self.matchProgress.minValue = 0;
    self.matchProgress.maxValue = 100;
    self.matchProgress.doubleValue = 0;
    self.matchProgress.identifier = @"technology.match.progress";
    self.matchStatus = [NSTextField labelWithString:@"等待开始"];
    self.matchStatus.font = [NSFont systemFontOfSize:12];
    self.matchStatus.textColor = NSColor.secondaryLabelColor;
    self.matchStatus.identifier = @"technology.match.completed";
    NSStackView *progressRow = [NSStackView stackViewWithViews:@[self.matchProgress, self.matchStatus]];
    progressRow.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    progressRow.alignment = NSLayoutAttributeCenterY;
    progressRow.spacing = 12;
    [self.matchProgress.widthAnchor constraintGreaterThanOrEqualToConstant:420].active = YES;

    self.resultsTable = [[NSTableView alloc] init];
    self.resultsTable.delegate = self;
    self.resultsTable.dataSource = self;
    self.resultsTable.identifier = @"technology.match.results";
    self.resultsTable.usesAlternatingRowBackgroundColors = NO;
    self.resultsTable.style = NSTableViewStyleFullWidth;
    self.resultsTable.rowHeight = 40;
    self.resultsTable.intercellSpacing = NSMakeSize(0, 1);
    NSArray<NSArray<NSString *> *> *columns = @[
        @[@"repository", @"候选项目", @"430"],
        @[@"score", @"匹配分", @"100"],
        @[@"verdict", @"建议", @"140"],
        @[@"license", @"许可证", @"120"],
    ];
    for (NSArray<NSString *> *definition in columns) {
        NSTableColumn *column = [[NSTableColumn alloc] initWithIdentifier:definition[0]];
        column.title = definition[1];
        column.width = definition[2].doubleValue;
        [self.resultsTable addTableColumn:column];
    }
    NSScrollView *scroll = [[NSScrollView alloc] init];
    scroll.documentView = self.resultsTable;
    scroll.hasVerticalScroller = YES;
    scroll.borderType = NSNoBorder;
    scroll.drawsBackground = NO;
    [scroll.heightAnchor constraintGreaterThanOrEqualToConstant:280].active = YES;

    NSStackView *content = [NSStackView stackViewWithViews:@[
        title, subtitle, requirementLabel, self.requirementField, options, progressRow, scroll
    ]];
    content.orientation = NSUserInterfaceLayoutOrientationVertical;
    content.alignment = NSLayoutAttributeLeading;
    content.spacing = 12;
    content.translatesAutoresizingMaskIntoConstraints = NO;
    [content setCustomSpacing:28 afterView:subtitle];
    [content setCustomSpacing:20 afterView:self.requirementField];
    [content setCustomSpacing:22 afterView:options];
    [container addSubview:content];
    [NSLayoutConstraint activateConstraints:@[
        [content.topAnchor constraintEqualToAnchor:container.topAnchor constant:40],
        [content.leadingAnchor constraintEqualToAnchor:container.leadingAnchor constant:48],
        [content.trailingAnchor constraintEqualToAnchor:container.trailingAnchor constant:-48],
        [content.bottomAnchor constraintLessThanOrEqualToAnchor:container.bottomAnchor constant:-28],
        [self.requirementField.widthAnchor constraintEqualToAnchor:content.widthAnchor],
        [options.widthAnchor constraintEqualToAnchor:content.widthAnchor],
        [progressRow.widthAnchor constraintEqualToAnchor:content.widthAnchor],
        [scroll.widthAnchor constraintEqualToAnchor:content.widthAnchor]
    ]];
    self.matchCandidates = @[];
    return container;
*/
}

- (NSURL *)jobsDirectory {
    NSURL *directory = [[[self reportsDirectory] URLByDeletingLastPathComponent]
                        URLByAppendingPathComponent:@"jobs" isDirectory:YES];
    [[NSFileManager defaultManager] createDirectoryAtURL:directory
                              withIntermediateDirectories:YES attributes:nil error:nil];
    return directory;
}

- (NSDictionary *)JSONAtURL:(NSURL *)url {
    NSData *data = [NSData dataWithContentsOfURL:url];
    if (!data) return nil;
    id payload = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [payload isKindOfClass:NSDictionary.class] ? payload : nil;
}

- (NSURL *)latestRequestDirectory {
    NSArray<NSURL *> *directories = [[NSFileManager defaultManager]
        contentsOfDirectoryAtURL:[self jobsDirectory]
      includingPropertiesForKeys:@[NSURLContentModificationDateKey, NSURLIsDirectoryKey]
                         options:0 error:nil];
    NSArray<NSURL *> *sorted = [directories sortedArrayUsingComparator:^NSComparisonResult(NSURL *left, NSURL *right) {
        NSDate *leftDate = nil, *rightDate = nil;
        [left getResourceValue:&leftDate forKey:NSURLContentModificationDateKey error:nil];
        [right getResourceValue:&rightDate forKey:NSURLContentModificationDateKey error:nil];
        return [(rightDate ?: NSDate.distantPast) compare:(leftDate ?: NSDate.distantPast)];
    }];
    for (NSURL *directory in sorted) {
        if ([[NSFileManager defaultManager] fileExistsAtPath:
             [[directory URLByAppendingPathComponent:@"request.json"] path]]) return directory;
    }
    return nil;
}

- (void)loadLatestMatchRequest {
    NSURL *directory = [self latestRequestDirectory];
    if (!directory) return;
    NSDictionary *request = [self JSONAtURL:[directory URLByAppendingPathComponent:@"request.json"]];
    NSDictionary *profile = [request[@"requirementProfile"] isKindOfClass:NSDictionary.class]
        ? request[@"requirementProfile"] : @{};
    NSString *summary = [profile[@"summary"] isKindOfClass:NSString.class] ? profile[@"summary"] : @"";
    NSArray *capabilities = [profile[@"capabilities"] isKindOfClass:NSArray.class] ? profile[@"capabilities"] : @[];
    if (summary.length == 0 && capabilities.count) summary = [capabilities componentsJoinedByString:@"、"];
    self.requirementField.stringValue = summary;
    NSString *domain = [profile[@"businessDomain"] isKindOfClass:NSString.class] ? profile[@"businessDomain"] : @"";
    if ([self.domainPopup itemWithTitle:domain]) [self.domainPopup selectItemWithTitle:domain];
    NSDictionary *depthMap = @{@"recommend": @"快速建议", @"verify": @"工程验证", @"code_graph": @"代码图谱"};
    NSString *depth = depthMap[request[@"depth"]];
    if (depth) [self.depthPopup selectItemWithTitle:depth];
    self.activeJobDirectory = directory;
    self.matchStatus.stringValue = [NSString stringWithFormat:@"已载入任务 %@", directory.lastPathComponent];
}

- (void)switchMode:(NSButton *)sender {
    BOOL showMatch = sender.tag == 1;
    self.dashboardModeButton.state = showMatch ? NSControlStateValueOff : NSControlStateValueOn;
    self.matchModeButton.state = showMatch ? NSControlStateValueOn : NSControlStateValueOff;
    self.webView.hidden = showMatch;
    self.matchView.hidden = !showMatch;
    self.statusLabel.hidden = showMatch;
    if (showMatch) {
        self.projectLoadAttempts = 0;
        [self loadProjectCenter];
    }
}

- (void)loadProjectCenter {
    NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:43128/projects"];
    [self.projectWebView loadRequest:[NSURLRequest requestWithURL:url
                                                     cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                 timeoutInterval:10]];
}

- (void)startProvider {
    NSURL *script = [[NSBundle mainBundle] URLForResource:@"technology_explorer" withExtension:@"py"];
    if (!script) return;
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/python3"];
    task.arguments = @[script.path, @"--serve-provider"];
    task.standardOutput = NSFileHandle.fileHandleWithNullDevice;
    task.standardError = NSFileHandle.fileHandleWithNullDevice;
    NSError *error = nil;
    if ([task launchAndReturnError:&error]) self.providerTask = task;
}

- (void)startMatch:(id)sender {
    NSString *summary = [self.requirementField.stringValue
        stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (summary.length == 0) {
        self.matchStatus.stringValue = @"请先输入需求摘要";
        return;
    }
    NSURL *script = [[NSBundle mainBundle] URLForResource:@"technology_explorer" withExtension:@"py"];
    if (!script) {
        self.matchStatus.stringValue = @"缺少需求匹配模块";
        return;
    }
    NSDictionary *existing = self.activeJobDirectory
        ? [self JSONAtURL:[self.activeJobDirectory URLByAppendingPathComponent:@"request.json"]]
        : nil;
    NSMutableDictionary *request = existing ? [existing mutableCopy] : [NSMutableDictionary dictionary];
    NSString *jobID = [request[@"jobId"] isKindOfClass:NSString.class]
        ? request[@"jobId"] : NSUUID.UUID.UUIDString.lowercaseString;
    if (!self.activeJobDirectory) {
        self.activeJobDirectory = [[self jobsDirectory] URLByAppendingPathComponent:jobID isDirectory:YES];
        [[NSFileManager defaultManager] createDirectoryAtURL:self.activeJobDirectory
                                  withIntermediateDirectories:YES attributes:nil error:nil];
    }
    NSMutableDictionary *profile = [request[@"requirementProfile"] isKindOfClass:NSDictionary.class]
        ? [request[@"requirementProfile"] mutableCopy] : [NSMutableDictionary dictionary];
    profile[@"summary"] = summary;
    if (![self.domainPopup.titleOfSelectedItem isEqualToString:@"自动识别"]) {
        profile[@"businessDomain"] = self.domainPopup.titleOfSelectedItem;
    }
    NSDictionary *depthMap = @{@"快速建议": @"recommend", @"工程验证": @"verify", @"代码图谱": @"code_graph"};
    request[@"schemaVersion"] = @"1.0";
    request[@"jobId"] = jobID;
    request[@"requirementProfile"] = profile;
    request[@"depth"] = depthMap[self.depthPopup.titleOfSelectedItem] ?: @"recommend";
    if (!request[@"maxCandidates"]) request[@"maxCandidates"] = @8;
    request[@"requestedAt"] = [NSISO8601DateFormatter.new stringFromDate:[NSDate date]];

    NSData *data = [NSJSONSerialization dataWithJSONObject:request options:NSJSONWritingPrettyPrinted error:nil];
    NSURL *requestURL = [self.activeJobDirectory URLByAppendingPathComponent:@"request.json"];
    if (![data writeToURL:requestURL atomically:YES]) {
        self.matchStatus.stringValue = @"无法写入任务文件";
        return;
    }
    NSFileManager *files = NSFileManager.defaultManager;
    for (NSString *name in @[@"progress.json", @"result.json", @"events.jsonl", @"cancel.json"]) {
        [files removeItemAtURL:[self.activeJobDirectory URLByAppendingPathComponent:name] error:nil];
    }

    self.matchCandidates = @[];
    [self.resultsTable reloadData];
    self.matchProgress.doubleValue = 0;
    self.matchStatus.stringValue = @"正在启动技术参考任务";
    self.matchButton.enabled = NO;
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/python3"];
    task.arguments = @[script.path, @"--advisory-job", requestURL.path];
    task.standardOutput = [NSPipe pipe];
    task.standardError = [NSPipe pipe];
    self.advisoryTask = task;
    __weak typeof(self) weakSelf = self;
    task.terminationHandler = ^(NSTask *completed) {
        dispatch_async(dispatch_get_main_queue(), ^{
            AppDelegate *strongSelf = weakSelf;
            if (!strongSelf) return;
            [strongSelf pollAdvisory:nil];
            if (completed.terminationStatus != 0 && strongSelf.matchButton.enabled == NO) {
                strongSelf.matchStatus.stringValue = @"技术参考任务执行失败";
                strongSelf.matchButton.enabled = YES;
            }
            strongSelf.advisoryTask = nil;
        });
    };
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        self.matchStatus.stringValue = [NSString stringWithFormat:@"启动失败：%@", error.localizedDescription];
        self.matchButton.enabled = YES;
        self.advisoryTask = nil;
        return;
    }
    [self.advisoryPollTimer invalidate];
    self.advisoryPollTimer = [NSTimer scheduledTimerWithTimeInterval:0.5
                                                              target:self
                                                            selector:@selector(pollAdvisory:)
                                                            userInfo:nil
                                                             repeats:YES];
}

- (void)pollAdvisory:(NSTimer *)timer {
    if (!self.activeJobDirectory) return;
    NSDictionary *progress = [self JSONAtURL:
        [self.activeJobDirectory URLByAppendingPathComponent:@"progress.json"]];
    if (progress) {
        self.matchProgress.doubleValue = [progress[@"percent"] doubleValue];
        NSString *message = [progress[@"message"] isKindOfClass:NSString.class] ? progress[@"message"] : @"正在分析";
        self.matchStatus.stringValue = message;
    }
    NSDictionary *result = [self JSONAtURL:
        [self.activeJobDirectory URLByAppendingPathComponent:@"result.json"]];
    NSString *state = [result[@"state"] isKindOfClass:NSString.class] ? result[@"state"] : @"";
    if ([state isEqualToString:@"completed"]) {
        self.matchCandidates = [result[@"candidates"] isKindOfClass:NSArray.class] ? result[@"candidates"] : @[];
        [self.resultsTable reloadData];
        self.matchProgress.doubleValue = 100;
        self.matchStatus.stringValue = [result[@"summary"] isKindOfClass:NSString.class]
            ? result[@"summary"] : @"需求匹配已完成";
        self.matchButton.enabled = YES;
        [self.advisoryPollTimer invalidate];
        self.advisoryPollTimer = nil;
    } else if ([state isEqualToString:@"failed"]) {
        self.matchStatus.stringValue = [result[@"message"] isKindOfClass:NSString.class]
            ? result[@"message"] : @"需求匹配失败";
        self.matchButton.enabled = YES;
        [self.advisoryPollTimer invalidate];
        self.advisoryPollTimer = nil;
    }
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView {
    return self.matchCandidates.count;
}

- (NSView *)tableView:(NSTableView *)tableView
    viewForTableColumn:(NSTableColumn *)tableColumn
                   row:(NSInteger)row {
    if (row < 0 || row >= (NSInteger)self.matchCandidates.count) return nil;
    NSDictionary *candidate = self.matchCandidates[(NSUInteger)row];
    NSString *identifier = tableColumn.identifier;
    NSTextField *field = [tableView makeViewWithIdentifier:identifier owner:self];
    if (!field) {
        field = [NSTextField labelWithString:@""];
        field.identifier = identifier;
        field.lineBreakMode = NSLineBreakByTruncatingTail;
    }
    if ([identifier isEqualToString:@"repository"]) {
        field.stringValue = [candidate[@"fullName"] isKindOfClass:NSString.class] ? candidate[@"fullName"] : @"";
    } else if ([identifier isEqualToString:@"score"]) {
        field.stringValue = [NSString stringWithFormat:@"%@ / 100", candidate[@"fitScore"] ?: @0];
    } else if ([identifier isEqualToString:@"verdict"]) {
        field.stringValue = [candidate[@"verdict"] isKindOfClass:NSString.class] ? candidate[@"verdict"] : @"待验证";
    } else if ([identifier isEqualToString:@"license"]) {
        field.stringValue = [candidate[@"license"] isKindOfClass:NSString.class] ? candidate[@"license"] : @"待核实";
    }
    return field;
}

- (NSURL *)latestReport {
    NSArray<NSURL *> *files = [[NSFileManager defaultManager] contentsOfDirectoryAtURL:[self reportsDirectory]
                                                           includingPropertiesForKeys:@[NSURLContentModificationDateKey]
                                                                              options:0 error:nil];
    NSPredicate *htmlOnly = [NSPredicate predicateWithBlock:^BOOL(NSURL *url, NSDictionary *bindings) {
        return [url.pathExtension.lowercaseString isEqualToString:@"html"];
    }];
    NSArray<NSURL *> *htmlFiles = [files filteredArrayUsingPredicate:htmlOnly];
    return [htmlFiles sortedArrayUsingComparator:^NSComparisonResult(NSURL *left, NSURL *right) {
        NSDate *leftDate = nil, *rightDate = nil;
        [left getResourceValue:&leftDate forKey:NSURLContentModificationDateKey error:nil];
        [right getResourceValue:&rightDate forKey:NSURLContentModificationDateKey error:nil];
        return [rightDate compare:leftDate];
    }].firstObject;
}

- (void)loadLatestReport {
    NSURL *report = [self latestReport];
    if (report) {
        [self.webView loadFileURL:report allowingReadAccessToURL:[self reportsDirectory]];
    } else {
        NSString *empty = @"<html><body style='font:16px -apple-system;padding:40px;color:#68717d'>正在生成第一份报告…</body></html>";
        [self.webView loadHTMLString:empty baseURL:nil];
    }
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if (webView == self.projectWebView &&
        [webView.URL.host isEqualToString:@"127.0.0.1"]) {
        self.projectLoadAttempts = 0;
    }
    [webView evaluateJavaScript:
        @"if (!location.hash) {"
         "  document.activeElement?.blur();"
         "  window.scrollTo(0, 0);"
         "  setTimeout(() => window.scrollTo(0, 0), 180);"
         "}"
        completionHandler:nil];
}

- (void)webView:(WKWebView *)webView
didFailProvisionalNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
    if (webView != self.projectWebView || self.matchView.hidden) return;
    self.projectLoadAttempts += 1;
    if (self.projectLoadAttempts > 5) {
        NSString *failureHTML =
            @"<html><meta name='viewport' content='width=device-width'>"
             "<body style='margin:0;background:#f3f5f7;color:#171a1f;"
             "font:13px -apple-system;display:grid;place-items:center;height:100vh'>"
             "<main style='width:360px;text-align:center'>"
             "<h2 style='margin:0 0 8px'>需求匹配服务暂未启动</h2>"
             "<p style='color:#6d7580;line-height:1.6'>应用已尝试重新连接。"
             "请确认本机 Provider 可用后重试。</p>"
             "<button onclick=\"location.href='http://127.0.0.1:43128/projects'\" "
             "style='height:34px;padding:0 14px;border:0;border-radius:7px;"
             "background:#356fd6;color:white;font-weight:650'>重新连接</button>"
             "</main></body></html>";
        [webView loadHTMLString:failureHTML baseURL:nil];
        return;
    }
    NSTimeInterval delay = MIN(4.0, 0.5 * self.projectLoadAttempts);
    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)),
        dispatch_get_main_queue(),
        ^{
            [self loadProjectCenter];
        }
    );
}

- (void)refresh:(id)sender {
    if (self.refreshTask && self.refreshTask.running) return;
    self.refreshButton.enabled = NO;
    self.refreshButton.toolTip = @"正在刷新数据";
    self.statusLabel.stringValue = @"正在收集和清洗信息…";
    NSURL *script = [[NSBundle mainBundle] URLForResource:@"technology_explorer" withExtension:@"py"];
    if (!script) {
        self.statusLabel.stringValue = @"缺少数据采集模块";
        self.refreshButton.enabled = YES;
        self.refreshButton.toolTip = @"刷新数据";
        return;
    }
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/usr/bin/python3"];
    task.arguments = @[script.path, @"--collect"];
    task.standardOutput = [NSPipe pipe];
    task.standardError = [NSPipe pipe];
    self.refreshTask = task;
    __weak typeof(self) weakSelf = self;
    task.terminationHandler = ^(NSTask *completed) {
        dispatch_async(dispatch_get_main_queue(), ^{
            AppDelegate *strongSelf = weakSelf;
            if (!strongSelf) return;
            [strongSelf loadLatestReport];
            NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
            formatter.dateFormat = @"HH:mm";
            strongSelf.statusLabel.stringValue = completed.terminationStatus == 0
                ? [NSString stringWithFormat:@"已整理完成 · %@", [formatter stringFromDate:[NSDate date]]]
                : @"刷新失败，已显示上次报告";
            strongSelf.refreshButton.enabled = YES;
            strongSelf.refreshButton.toolTip = @"刷新数据";
            strongSelf.refreshTask = nil;
        });
    };
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        self.statusLabel.stringValue = [NSString stringWithFormat:@"启动失败：%@", error.localizedDescription];
        self.refreshButton.enabled = YES;
        self.refreshButton.toolTip = @"刷新数据";
        self.refreshTask = nil;
    }
}

- (void)scheduleNextDailyRefresh {
    [self.dailyTimer invalidate];
    NSDateComponents *components = [[NSDateComponents alloc] init];
    components.hour = 9;
    components.minute = 0;
    components.second = 0;
    NSDate *next = [[NSCalendar currentCalendar] nextDateAfterDate:[NSDate date]
                                                matchingComponents:components
                                                           options:NSCalendarMatchNextTime];
    NSTimeInterval delay = MAX(1, [next timeIntervalSinceNow]);
    self.dailyTimer = [NSTimer scheduledTimerWithTimeInterval:delay
                                                       target:self
                                                     selector:@selector(runDailyRefresh:)
                                                     userInfo:nil
                                                      repeats:NO];
}

- (void)runDailyRefresh:(NSTimer *)timer {
    [self refresh:nil];
    [self scheduleNextDailyRefresh];
}

- (void)openReports:(id)sender {
    [[NSWorkspace sharedWorkspace] openURL:[self reportsDirectory]];
}

- (void)openSourceGuide:(id)sender {
    NSURL *guide = [[NSBundle mainBundle] URLForResource:@"DATA_SOURCE_SETUP" withExtension:@"md"];
    if (guide) {
        [[NSWorkspace sharedWorkspace] openURL:guide];
    }
}

- (NSDictionary *)loadConfig {
    NSData *data = [NSData dataWithContentsOfURL:[self configURL]];
    if (!data) return @{};
    NSDictionary *config = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [config isKindOfClass:NSDictionary.class] ? config : @{};
}

- (void)openSettings:(id)sender {
    NSDictionary *config = [self loadConfig];
    NSArray<NSString *> *keys = @[@"ark_api_key", @"ark_base_url", @"ark_model", @"tikhub_api_token", @"tikhub_base_url", @"youtube_key", @"x_bearer_token", @"feishu_webhook", @"media_crawler_path"];
    NSArray<NSString *> *labels = @[@"方舟 ARK API Key", @"方舟 API Base URL", @"方舟模型 / 接入点 ID", @"TikHub API Token（一把 Key 接入多平台）", @"TikHub API Base URL", @"YouTube Data API Key", @"X Bearer Token", @"飞书机器人 Webhook", @"MediaCrawler JSON/JSONL 导出目录"];
    NSSet<NSString *> *secretKeys = [NSSet setWithArray:@[@"ark_api_key", @"tikhub_api_token", @"youtube_key", @"x_bearer_token", @"feishu_webhook"]];
    NSMutableArray<NSTextField *> *fields = [NSMutableArray array];
    NSStackView *stack = [[NSStackView alloc] initWithFrame:NSMakeRect(0, 0, 560, 820)];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeLeading;
    stack.spacing = 5;
    NSTextField *topicSection = [NSTextField labelWithString:@"关注主题"];
    topicSection.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
    [stack addArrangedSubview:topicSection];
    NSTextField *topicGuide = [NSTextField wrappingLabelWithString:
        @"请在“情报工作台 → 今日信号”顶部点击“管理主题”。那里支持同时关注多个主题、编辑各自关键词，并可切换单独查看。"];
    topicGuide.textColor = NSColor.secondaryLabelColor;
    [topicGuide.widthAnchor constraintEqualToConstant:520].active = YES;
    [stack addArrangedSubview:topicGuide];
    [stack setCustomSpacing:16 afterView:topicGuide];
    for (NSUInteger index = 0; index < keys.count; index++) {
        if (index == 0 || index == 3 || index == 7) {
            NSString *sectionTitle = index == 0 ? @"AI 分析"
                : (index == 3 ? @"数据增强（可选）" : @"通知与本地数据");
            NSTextField *section = [NSTextField labelWithString:sectionTitle];
            section.font = [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold];
            section.textColor = NSColor.labelColor;
            [stack addArrangedSubview:section];
            [stack setCustomSpacing:8 afterView:section];
        }
        NSTextField *label = [NSTextField labelWithString:labels[index]];
        label.font = [NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
        label.textColor = NSColor.secondaryLabelColor;
        [stack addArrangedSubview:label];
        NSTextField *field = [secretKeys containsObject:keys[index]] ? [[NSSecureTextField alloc] init] : [[NSTextField alloc] init];
        NSString *fallback = [keys[index] isEqualToString:@"ark_base_url"]
            ? @"https://ark.cn-beijing.volces.com/api/v3"
            : ([keys[index] isEqualToString:@"tikhub_base_url"]
                ? @"https://api.tikhub.dev" : @"");
        field.stringValue = config[keys[index]] ?: fallback;
        [field.widthAnchor constraintEqualToConstant:520].active = YES;
        [stack addArrangedSubview:field];
        [fields addObject:field];
        if (index == 2 || index == 6) [stack setCustomSpacing:16 afterView:field];
    }
    NSButton *sendFeishuButton = [NSButton checkboxWithTitle:@"发送每日 Top 10 到飞书机器人"
                                                     target:nil
                                                     action:nil];
    BOOL feishuPaused = config[@"feishu_paused"] ? [config[@"feishu_paused"] boolValue] : YES;
    sendFeishuButton.state = feishuPaused ? NSControlStateValueOff : NSControlStateValueOn;
    [stack addArrangedSubview:sendFeishuButton];
    NSButton *guideButton = [NSButton buttonWithTitle:@"打开数据源接入指南"
                                               target:self
                                               action:@selector(openSourceGuide:)];
    guideButton.bezelStyle = NSBezelStyleInline;
    [stack addArrangedSubview:guideButton];
    NSTextField *note = [NSTextField labelWithString:@"免费公共数据源无需配置。密钥仅保存在这台 Mac。"];
    note.font = [NSFont systemFontOfSize:11];
    note.textColor = NSColor.secondaryLabelColor;
    [stack addArrangedSubview:note];
    NSScrollView *scrollView = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 0, 580, 620)];
    scrollView.hasVerticalScroller = YES;
    scrollView.autohidesScrollers = YES;
    scrollView.drawsBackground = NO;
    scrollView.documentView = stack;

    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"设置";
    alert.informativeText = @"关注主题在“今日信号”页管理；这里配置数据增强与通知。";
    alert.accessoryView = scrollView;
    [alert addButtonWithTitle:@"保存并刷新"];
    [alert addButtonWithTitle:@"取消"];
    [stack layoutSubtreeIfNeeded];
    CGFloat topOffset = MAX(0, NSHeight(stack.bounds) - NSHeight(scrollView.contentView.bounds));
    [scrollView.contentView scrollToPoint:NSMakePoint(0, topOffset)];
    [scrollView reflectScrolledClipView:scrollView.contentView];
    [alert.window makeFirstResponder:fields.firstObject];
    if ([alert runModal] != NSAlertFirstButtonReturn) return;

    NSUInteger webhookIndex = [keys indexOfObject:@"feishu_webhook"];
    if (sendFeishuButton.state == NSControlStateValueOn &&
        [fields[webhookIndex].stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length == 0) {
        NSAlert *validation = [[NSAlert alloc] init];
        validation.messageText = @"请先填写飞书机器人 Webhook";
        validation.informativeText = @"关闭发送开关，或填写有效 Webhook 后再保存。";
        [validation runModal];
        return;
    }

    NSMutableDictionary *saved = [[self loadConfig] mutableCopy];
    for (NSUInteger index = 0; index < keys.count; index++) {
        NSString *value = [fields[index].stringValue
            stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        saved[keys[index]] = value;
    }
    saved[@"feishu_paused"] = @(sendFeishuButton.state != NSControlStateValueOn);
    NSData *data = [NSJSONSerialization dataWithJSONObject:saved options:NSJSONWritingPrettyPrinted error:nil];
    if (!data || ![data writeToURL:[self configURL] atomically:YES]) {
        NSAlert *failure = [[NSAlert alloc] init];
        failure.messageText = @"设置保存失败";
        failure.informativeText = @"无法写入本机配置文件，请检查磁盘空间和目录权限后重试。";
        [failure runModal];
        return;
    }
    chmod(self.configURL.fileSystemRepresentation, S_IRUSR | S_IWUSR);
    self.statusLabel.stringValue = @"设置已保存，正在刷新…";
    [self refresh:nil];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"technologyRadar"] ||
        ![message.body isKindOfClass:NSDictionary.class]) return;
    NSDictionary *body = message.body;
    NSMutableDictionary *config = [[self loadConfig] mutableCopy];
    if ([body[@"type"] isEqualToString:@"saveBoardPreferences"] &&
        [body[@"preferences"] isKindOfClass:NSDictionary.class]) {
        config[@"board_preferences"] = body[@"preferences"];
    } else if ([body[@"type"] isEqualToString:@"saveResearchTopics"] &&
               [body[@"topics"] isKindOfClass:NSArray.class]) {
        config[@"research_topics"] = body[@"topics"];
        [config removeObjectForKey:@"research_topic"];
        [config removeObjectForKey:@"research_keywords"];
    } else {
        return;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:config options:NSJSONWritingPrettyPrinted error:nil];
    if (!data || ![data writeToURL:[self configURL] atomically:YES]) {
        self.statusLabel.stringValue = @"配置保存失败";
        NSAlert *failure = [[NSAlert alloc] init];
        failure.messageText = @"配置保存失败";
        failure.informativeText = @"无法写入本机配置文件，请检查磁盘空间和目录权限后重试。";
        [failure beginSheetModalForWindow:self.window completionHandler:nil];
        return;
    }
    chmod(self.configURL.fileSystemRepresentation, S_IRUSR | S_IWUSR);
    if ([body[@"type"] isEqualToString:@"saveResearchTopics"]) {
        [self refresh:nil];
    }
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated) {
        [[NSWorkspace sharedWorkspace] openURL:navigationAction.request.URL];
        decisionHandler(WKNavigationActionPolicyCancel);
    } else {
        decisionHandler(WKNavigationActionPolicyAllow);
    }
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
