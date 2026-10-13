import Charts
import StoreKit
import SwiftUI

private enum HomeSortTheme {
    static let paper = Color(hex: "#F5F1E8")
    static let ink = Color(hex: "#171612")
    static let muted = Color(hex: "#777168")
    static let line = Color(hex: "#D7CFC1")
    static let accent = Color(hex: "#F05B3D")
    static let green = Color(hex: "#3F7657")
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.profile.hasCompletedOnboarding {
                MainTabView()
            } else {
                OnboardingView()
            }
        }
        .tint(HomeSortTheme.accent)
        .background(HomeSortTheme.paper)
        .alert(
            "暂时无法打开",
            isPresented: Binding(
                get: { model.launchError != nil },
                set: { if !$0 { model.launchError = nil } }
            ),
            actions: {
                Button("知道了", role: .cancel) { model.launchError = nil }
            },
            message: {
                Text(model.launchError ?? "")
            }
        )
    }
}

struct MainTabView: View {
    var body: some View {
        NowView()
    }
}

struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedIDs: [String] = []

    var body: some View {
        ZStack {
            PaperBackground()

            VStack(spacing: 0) {
                HStack {
                    BrandLockup()
                    Spacer()
                    Text("\(selectedIDs.count)/\(AppModel.maximumHomeEntrances) 已选")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(HomeSortTheme.muted)
                }
                .padding(.horizontal, 22)
                .padding(.top, 14)

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("先选出你真正\n会用到的 App。")
                                .font(.system(size: 38, weight: .bold, design: .serif))
                                .tracking(0)
                                .foregroundStyle(HomeSortTheme.ink)

                            Text("HomeSort 不扫描安装列表。你选择入口后，它才会根据真实点击逐步学习。")
                                .font(.subheadline)
                                .foregroundStyle(HomeSortTheme.muted)
                                .lineSpacing(4)
                        }

                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                        ], spacing: 16) {
                            ForEach(AppCatalog.all) { destination in
                                SelectionTile(
                                    destination: destination,
                                    isSelected: selectedIDs.contains(destination.id)
                                ) {
                                    toggle(destination.id)
                                }
                            .disabled(
                                !selectedIDs.contains(destination.id)
                                    && selectedIDs.count >= AppModel.maximumHomeEntrances
                            )
                            }
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 34)
                    .padding(.bottom, 120)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                Button {
                    model.completeOnboarding(selectedIDs: selectedIDs)
                } label: {
                    HStack {
                        Label("创建我的智能入口", systemImage: "wand.and.stars")
                        Spacer()
                        Image(systemName: "arrow.right")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 56)
                    .background(HomeSortTheme.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .disabled(selectedIDs.count < 4)
                .opacity(selectedIDs.count < 4 ? 0.4 : 1)

                Text("选择 4-\(AppModel.maximumHomeEntrances) 个，可随时修改")
                    .font(.caption2)
                    .foregroundStyle(HomeSortTheme.muted)
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)
            .background(.ultraThinMaterial)
        }
    }

    private func toggle(_ id: String) {
        if let index = selectedIDs.firstIndex(of: id) {
            selectedIDs.remove(at: index)
        } else if selectedIDs.count < AppModel.maximumHomeEntrances {
            selectedIDs.append(id)
        }
    }
}

struct NowView: View {
    @Environment(AppModel.self) private var model
    @State private var showAppSearch = false
    @State private var showMemory = false
    @State private var showSettings = false
    @StateObject private var localWeather = LocalWeatherModel()

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()

                GeometryReader { proxy in
                    let compactHeight = proxy.size.height < 660
                    let secondaryHeight: CGFloat = compactHeight ? 68 : 78
                    VStack(alignment: .leading, spacing: 0) {
                        ClockWeatherHeader(model: localWeather)

                        Spacer()
                            .frame(height: compactHeight ? 14 : 24)

                        if let primary = model.visiblePredictions.first {
                            PrimaryLaunchButton(
                                prediction: primary,
                                height: compactHeight ? 116 : 126
                            ) {
                                model.open(primary.destination, source: .suggestion)
                            }
                        }

                        if model.visiblePredictions.count > 1 {
                            VStack(alignment: .leading, spacing: compactHeight ? 8 : 10) {
                                Text("接下来")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(HomeSortTheme.muted)

                                LazyVGrid(
                                    columns: [
                                        GridItem(.flexible(), spacing: 8),
                                        GridItem(.flexible(), spacing: 8),
                                    ],
                                    spacing: 8
                                ) {
                                    ForEach(model.visiblePredictions.dropFirst().prefix(4)) { prediction in
                                        CompactLaunchButton(
                                            prediction: prediction,
                                            height: secondaryHeight,
                                            showsReason: false
                                        ) {
                                            model.open(prediction.destination, source: .suggestion)
                                        }
                                    }
                                }
                            }
                            .padding(.top, compactHeight ? 14 : 20)
                        }

                        Spacer(minLength: 12)

                        Button {
                            showAppSearch = true
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "magnifyingglass")
                                    .font(.headline)
                                Text("搜索所有 App")
                                    .font(.subheadline.weight(.semibold))
                                Spacer()
                                Text("\(AppCatalog.all.count)")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(HomeSortTheme.muted)
                                Image(systemName: "chevron.up")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(HomeSortTheme.muted)
                            }
                            .foregroundStyle(HomeSortTheme.ink)
                            .padding(.horizontal, 16)
                            .frame(height: 58)
                            .background(Color.white.opacity(0.58))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(HomeSortTheme.line)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("searchAllApps")
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, compactHeight ? 12 : 20)
                    .padding(.bottom, 12)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    BrandLockup()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showMemory = true
                    } label: {
                        Image(systemName: "waveform.path.ecg")
                    }
                    .accessibilityLabel("使用记忆")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .accessibilityLabel("设置")
                }
            }
            .toolbarBackground(HomeSortTheme.paper.opacity(0.96), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .fullScreenCover(isPresented: $showAppSearch) {
                AppSearchView()
            }
            .sheet(isPresented: $showMemory) {
                MemoryView()
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .task {
                localWeather.start()
            }
        }
    }
}

private struct ClockWeatherHeader: View {
    @ObservedObject var model: LocalWeatherModel

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日 EEEE"
        return formatter
    }()

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            VStack(alignment: .leading, spacing: 4) {
                Text(context.date, format: .dateTime.hour().minute())
                    .font(.system(size: 66, weight: .bold, design: .serif))
                    .monospacedDigit()
                    .tracking(0)
                    .foregroundStyle(HomeSortTheme.ink)

                Text(Self.dateFormatter.string(from: context.date))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(HomeSortTheme.accent)

                weatherLine
                    .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private var weatherLine: some View {
        switch model.status {
        case let .ready(weather):
            HStack(spacing: 7) {
                Image(systemName: weather.condition.symbolName)
                    .foregroundStyle(HomeSortTheme.ink)
                Text("\(weather.temperatureCelsius)°  \(weather.condition.rawValue)")
                    .foregroundStyle(HomeSortTheme.ink)
                Text("·")
                    .foregroundStyle(HomeSortTheme.line)
                Image(systemName: "location.fill")
                    .font(.caption)
                    .foregroundStyle(HomeSortTheme.muted)
                Text(weather.locationName)
                    .foregroundStyle(HomeSortTheme.muted)
                    .lineLimit(1)
            }
            .font(.subheadline)

        case .loading:
            Text("正在获取当前位置和天气…")
                .font(.subheadline)
                .foregroundStyle(HomeSortTheme.muted)

        case .permissionNeeded:
            Button {
                model.requestPermission()
            } label: {
                Label("开启位置，显示当地天气", systemImage: "location.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeSortTheme.accent)
            }
            .buttonStyle(.plain)

        case .unavailable:
            Button {
                model.start()
            } label: {
                Label("天气暂不可用，点击重试", systemImage: "arrow.clockwise")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeSortTheme.accent)
            }
            .buttonStyle(.plain)
        }
    }
}

struct AppSearchView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchIsFocused: Bool

    private var results: [AppDestination] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return AppCatalog.all
        }
        return AppCatalog.all.filter { $0.matches(query) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(HomeSortTheme.muted)
                    TextField("输入 App 名称或类别", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($searchIsFocused)
                        .submitLabel(.search)
                    if !query.isEmpty {
                        Button {
                            query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(HomeSortTheme.muted)
                        }
                        .accessibilityLabel("清除搜索")
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Color.white.opacity(0.66))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(HomeSortTheme.line)
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 18)
                .padding(.vertical, 12)

                if results.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    List(results) { destination in
                        Button {
                            model.open(destination)
                        } label: {
                            HStack(spacing: 14) {
                                DestinationGlyph(destination: destination, size: 42)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(destination.name)
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(HomeSortTheme.ink)
                                    Text(destination.category)
                                        .font(.caption)
                                        .foregroundStyle(HomeSortTheme.muted)
                                }
                                Spacer()
                                if model.profile.selectedDestinationIDs.contains(destination.id) {
                                    Text("常用")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(HomeSortTheme.green)
                                }
                                Image(systemName: "arrow.up.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(HomeSortTheme.muted)
                            }
                            .padding(.vertical, 5)
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(PaperBackground())
            .navigationTitle("快速打开")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
            .onAppear {
                searchIsFocused = true
            }
        }
        .presentationDetents([.large])
    }
}

struct MemoryView: View {
    @Environment(AppModel.self) private var model

    private var hourlyData: [(hour: Int, count: Int)] {
        let grouped = Dictionary(grouping: model.events) {
            Calendar.current.component(.hour, from: $0.timestamp)
        }
        return (0..<24).map { ($0, grouped[$0]?.count ?? 0) }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                PaperBackground()

                if model.events.isEmpty {
                    ContentUnavailableView {
                        Label("记忆正在形成", systemImage: "waveform.path.ecg")
                    } description: {
                        Text("从 HomeSort 打开 App 后，这里才会出现真实使用规律。")
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 28) {
                            HStack(spacing: 0) {
                                Metric(value: "\(model.memorySummary.totalLaunches)", label: "记录次数")
                                Divider()
                                Metric(value: "\(model.memorySummary.activeDays)", label: "活跃天数")
                                Divider()
                                Metric(
                                    value: model.memorySummary.strongestHour.map { String(format: "%02d:00", $0) } ?? "--",
                                    label: "高频时段"
                                )
                            }
                            .frame(height: 72)
                            .overlay(alignment: .top) { Divider() }
                            .overlay(alignment: .bottom) { Divider() }

                            VStack(alignment: .leading, spacing: 14) {
                                SectionHeader(title: "一天中的使用分布", detail: "仅统计从 HomeSort 发起的打开")
                                Chart(hourlyData, id: \.hour) { item in
                                    BarMark(
                                        x: .value("小时", item.hour),
                                        y: .value("次数", item.count)
                                    )
                                    .foregroundStyle(item.count > 0 ? HomeSortTheme.accent : HomeSortTheme.line)
                                    .cornerRadius(2)
                                }
                                .chartXAxis {
                                    AxisMarks(values: [0, 6, 12, 18, 23])
                                }
                                .frame(height: 160)
                            }

                            if let top = model.memorySummary.topDestination {
                                HStack(spacing: 16) {
                                    DestinationGlyph(destination: top, size: 58)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("当前最常用")
                                            .font(.caption)
                                            .foregroundStyle(HomeSortTheme.muted)
                                        Text(top.name)
                                            .font(.title3.weight(.bold))
                                    }
                                    Spacer()
                                }
                                .padding(.vertical, 18)
                                .overlay(alignment: .top) { Divider() }
                                .overlay(alignment: .bottom) { Divider() }
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 24)
                        .padding(.bottom, 32)
                    }
                }
            }
            .navigationTitle("使用记忆")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var showSelection = false
    @State private var showPaywall = false
    @State private var showDeleteConfirmation = false
    @State private var showResetConfirmation = false

    var body: some View {
        NavigationStack {
            List {
                Section("智能入口") {
                    Button {
                        showSelection = true
                    } label: {
                        SettingsRow(
                            icon: "square.grid.2x2",
                            title: "管理 App",
                            detail: "\(model.selectedDestinations.count) 个入口"
                        )
                    }
                }

                Section("HomeSort Pro") {
                    Button {
                        showPaywall = true
                    } label: {
                        SettingsRow(
                            icon: "sparkles",
                            title: model.isPro ? "Pro 已启用" : "升级 Pro",
                            detail: model.isPro ? "长期记忆与云同步" : "查看订阅方案"
                        )
                    }
                }

                Section("数据与隐私") {
                    LabeledContent("存储位置", value: "本机")
                    LabeledContent("行为记录", value: "\(model.events.count) 条")
                    Button("删除使用记忆", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                    Button("重新设置 HomeSort", role: .destructive) {
                        showResetConfirmation = true
                    }
                }

                Section {
                    Text("HomeSort 只能记录从自身发起的 App 打开，不读取完整系统使用记录，也不会接管或覆盖 iOS 主屏幕。")
                        .font(.caption)
                        .foregroundStyle(HomeSortTheme.muted)
                }
            }
            .scrollContentBackground(.hidden)
            .background(PaperBackground())
            .navigationTitle("设置")
            .sheet(isPresented: $showSelection) {
                ManageAppsView()
            }
            .sheet(isPresented: $showPaywall) {
                PaywallView()
            }
            .confirmationDialog("删除全部使用记忆？", isPresented: $showDeleteConfirmation) {
                Button("删除", role: .destructive) {
                    model.deleteMemory()
                }
            } message: {
                Text("入口选择会保留，预测排序将重新学习。")
            }
            .confirmationDialog("重新设置 HomeSort？", isPresented: $showResetConfirmation) {
                Button("重新设置", role: .destructive) {
                    model.resetProduct()
                }
            } message: {
                Text("这会删除入口选择和全部本地使用记忆。")
            }
        }
    }
}

struct ManageAppsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var selectedIDs: [String] = []
    @State private var query = ""
    @FocusState private var searchIsFocused: Bool

    private var results: [AppDestination] {
        AppCatalog.all.filter { $0.matches(query) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(HomeSortTheme.muted)
                    TextField("搜索要添加的 App", text: $query)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($searchIsFocused)
                    Text("\(selectedIDs.count)/\(AppModel.maximumHomeEntrances)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(HomeSortTheme.muted)
                    if !query.isEmpty {
                        Button {
                            query = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(HomeSortTheme.muted)
                        }
                        .accessibilityLabel("清除搜索")
                    }
                }
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Color.white.opacity(0.66))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(HomeSortTheme.line)
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 18)
                .padding(.vertical, 12)

                if results.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    ScrollView {
                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                        ], spacing: 18) {
                            ForEach(results) { destination in
                                SelectionTile(
                                    destination: destination,
                                    isSelected: selectedIDs.contains(destination.id)
                                ) {
                                    if let index = selectedIDs.firstIndex(of: destination.id) {
                                        selectedIDs.remove(at: index)
                                    } else if selectedIDs.count < AppModel.maximumHomeEntrances {
                                        selectedIDs.append(destination.id)
                                    }
                                    // #region debug-point C:selection-toggle
                                    Task { var request = URLRequest(url: URL(string: "http://127.0.0.1:7777/event")!); request.httpMethod = "POST"; request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": "app-management-sync", "runId": "post-fix", "hypothesisId": "C", "location": "ContentView.swift:ManageAppsView.toggle", "msg": "[DEBUG] Management selection toggled", "data": ["destinationID": destination.id, "selectedIDs": selectedIDs]]); _ = try? await URLSession.shared.data(for: request) }
                                    // #endregion
                                }
                                .disabled(
                                    !selectedIDs.contains(destination.id)
                                        && selectedIDs.count >= AppModel.maximumHomeEntrances
                                )
                            }
                        }
                        .padding(20)
                    }
                }
            }
            .background(PaperBackground())
            .navigationTitle("管理入口")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        // #region debug-point C-D:save-tapped
                        Task { var request = URLRequest(url: URL(string: "http://127.0.0.1:7777/event")!); request.httpMethod = "POST"; request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": "app-management-sync", "runId": "post-fix", "hypothesisId": "C-D", "location": "ContentView.swift:ManageAppsView.done", "msg": "[DEBUG] Management save tapped", "data": ["selectedIDs": selectedIDs]]); _ = try? await URLSession.shared.data(for: request) }
                        // #endregion
                        model.updateSelection(selectedIDs)
                        dismiss()
                    }
                    .disabled(selectedIDs.count < 4)
                }
            }
            .onAppear {
                selectedIDs = model.profile.selectedDestinationIDs
                // #region debug-point C:management-appear
                Task { var request = URLRequest(url: URL(string: "http://127.0.0.1:7777/event")!); request.httpMethod = "POST"; request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": "app-management-sync", "runId": "post-fix", "hypothesisId": "C", "location": "ContentView.swift:ManageAppsView.onAppear", "msg": "[DEBUG] Management loaded selection", "data": ["selectedIDs": selectedIDs]]); _ = try? await URLSession.shared.data(for: request) }
                // #endregion
                searchIsFocused = true
            }
        }
    }
}

struct PaywallView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HStack {
                BrandLockup()
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .frame(width: 36, height: 36)
                        .background(HomeSortTheme.line.opacity(0.45))
                        .clipShape(Circle())
                }
                .accessibilityLabel("关闭")
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("让记忆跨越\n每一次换机。")
                    .font(.system(size: 38, weight: .bold, design: .serif))
                Text("Pro 将启用加密云同步、更长的使用记忆和跨设备偏好。")
                    .foregroundStyle(HomeSortTheme.muted)
            }

            VStack(spacing: 0) {
                PaywallFeature(icon: "brain.head.profile", title: "长期记忆", copy: "保留完整时间偏好")
                Divider()
                PaywallFeature(icon: "icloud.fill", title: "加密同步", copy: "换机后恢复个人入口")
                Divider()
                PaywallFeature(icon: "chart.line.uptrend.xyaxis", title: "趋势洞察", copy: "看见真实使用节奏")
            }

            Spacer()

            if let product = model.products.first {
                Button {
                    Task { await model.purchase() }
                } label: {
                    HStack {
                        Text(model.isPurchasing ? "正在连接 App Store" : "订阅 HomeSort Pro")
                        Spacer()
                        Text(product.displayPrice + "/年")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 56)
                    .background(HomeSortTheme.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .disabled(model.isPurchasing)
            } else {
                Text("App Store 商品尚未配置")
                    .frame(maxWidth: .infinity)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeSortTheme.muted)
                    .frame(height: 56)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(HomeSortTheme.line)
                    }
            }

            Text("订阅由 Apple 管理，可随时在系统设置中取消。")
                .font(.caption2)
                .foregroundStyle(HomeSortTheme.muted)
                .frame(maxWidth: .infinity)
        }
        .padding(22)
        .background(PaperBackground())
    }
}

private struct PrimaryLaunchButton: View {
    let prediction: Prediction
    var height: CGFloat = 126
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 18) {
                DestinationGlyph(destination: prediction.destination, size: 70)

                VStack(alignment: .leading, spacing: 4) {
                    Text("此刻最可能")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.6))
                    Text(prediction.destination.name)
                        .font(.system(size: 28, weight: .bold, design: .serif))
                    Text(prediction.reason)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.68))
                }

                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.title3.weight(.bold))
            }
            .foregroundStyle(.white)
            .padding(20)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(HomeSortTheme.ink)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

private struct CompactLaunchButton: View {
    let prediction: Prediction
    var height: CGFloat = 132
    var showsReason = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    DestinationGlyph(destination: prediction.destination, size: height < 80 ? 34 : 40)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(HomeSortTheme.muted)
                }
                Text(prediction.destination.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeSortTheme.ink)
                    .lineLimit(1)
                if showsReason {
                    Text(prediction.reason)
                        .font(.caption2)
                        .foregroundStyle(HomeSortTheme.muted)
                        .lineLimit(1)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: height)
            .background(Color.white.opacity(0.58))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(HomeSortTheme.line)
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

private struct AppLaunchIcon: View {
    let destination: AppDestination
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                DestinationGlyph(destination: destination, size: 54)
                Text(destination.name)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(HomeSortTheme.ink)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct SelectionTile: View {
    let destination: AppDestination
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                ZStack(alignment: .topTrailing) {
                    DestinationGlyph(destination: destination, size: 56)
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(HomeSortTheme.accent, .white)
                            .offset(x: 5, y: -5)
                    }
                }
                Text(destination.name)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(isSelected ? HomeSortTheme.ink : HomeSortTheme.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(destination.name)，\(isSelected ? "已选择" : "未选择")")
    }
}

private struct DestinationGlyph: View {
    let destination: AppDestination
    let size: CGFloat

    var body: some View {
        Image(systemName: destination.symbol)
            .font(.system(size: size * 0.36, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hex: destination.colorHex))
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
            .shadow(color: .black.opacity(0.12), radius: 7, y: 4)
    }
}

private struct BrandLockup: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "square.grid.2x2.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(HomeSortTheme.ink)
                .clipShape(RoundedRectangle(cornerRadius: 7))
            Text("HomeSort")
                .font(.headline.weight(.bold))
                .foregroundStyle(HomeSortTheme.ink)
        }
    }
}

private struct SectionHeader: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.headline)
                .foregroundStyle(HomeSortTheme.ink)
            Spacer()
            Text(detail)
                .font(.caption2)
                .foregroundStyle(HomeSortTheme.muted)
        }
    }
}

private struct Metric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3.bold())
                .foregroundStyle(HomeSortTheme.ink)
            Text(label)
                .font(.caption2)
                .foregroundStyle(HomeSortTheme.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct SettingsRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundStyle(HomeSortTheme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .foregroundStyle(HomeSortTheme.ink)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(HomeSortTheme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(HomeSortTheme.muted)
        }
    }
}

private struct PaywallFeature: View {
    let icon: String
    let title: String
    let copy: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .foregroundStyle(HomeSortTheme.accent)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(copy)
                    .font(.caption)
                    .foregroundStyle(HomeSortTheme.muted)
            }
            Spacer()
        }
        .padding(.vertical, 16)
    }
}

private struct PaperBackground: View {
    var body: some View {
        HomeSortTheme.paper
            .overlay {
                Canvas { context, size in
                    let spacing: CGFloat = 28
                    var path = Path()
                    stride(from: CGFloat.zero, through: size.width, by: spacing).forEach { x in
                        path.move(to: CGPoint(x: x, y: 0))
                        path.addLine(to: CGPoint(x: x, y: size.height))
                    }
                    stride(from: CGFloat.zero, through: size.height, by: spacing).forEach { y in
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: size.width, y: y))
                    }
                    context.stroke(path, with: .color(HomeSortTheme.ink.opacity(0.025)), lineWidth: 0.5)
                }
            }
            .ignoresSafeArea()
    }
}

extension Color {
    init(hex: String) {
        let sanitized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&value)
        let red = Double((value >> 16) & 0xFF) / 255
        let green = Double((value >> 8) & 0xFF) / 255
        let blue = Double(value & 0xFF) / 255
        self.init(red: red, green: green, blue: blue)
    }
}
