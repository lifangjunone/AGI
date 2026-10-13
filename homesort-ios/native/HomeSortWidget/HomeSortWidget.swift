import SwiftUI
import WidgetKit

struct LauncherEntry: TimelineEntry {
    let date: Date
    let predictions: [Prediction]
}

struct LauncherProvider: TimelineProvider {
    private let store = SharedLauncherStore.shared

    func placeholder(in context: Context) -> LauncherEntry {
        LauncherEntry(date: .now, predictions: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (LauncherEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LauncherEntry>) -> Void) {
        let entry = makeEntry()
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func makeEntry() -> LauncherEntry {
        let profile = store.loadProfile()
        let destinations = profile.selectedDestinationIDs.compactMap(AppCatalog.destination)
        let predictions = PredictionEngine.rank(
            destinations: destinations,
            events: store.loadEvents(),
            preferredOrder: profile.selectedDestinationIDs
        )
        return LauncherEntry(date: .now, predictions: Array(predictions.prefix(6)))
    }
}

struct HomeSortWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LauncherEntry

    var body: some View {
        if entry.predictions.isEmpty {
            emptyState
        } else {
            switch family {
            case .accessoryCircular:
                accessoryCircularWidget
            case .accessoryRectangular:
                accessoryRectangularWidget
            case .systemSmall:
                smallWidget
            case .systemLarge:
                largeWidget
            default:
                mediumWidget
            }
        }
    }

    private var accessoryCircularWidget: some View {
        Group {
            if let first = entry.predictions.first {
                VStack(spacing: 2) {
                    Image(systemName: first.destination.symbol)
                        .font(.title3.weight(.semibold))
                    Text(first.destination.name.prefix(2))
                        .font(.system(size: 9, weight: .bold))
                }
                .widgetAccentable()
                .widgetURL(deepLink(for: first.destination))
            }
        }
        .containerBackground(for: .widget) {
            AccessoryWidgetBackground()
        }
    }

    private var accessoryRectangularWidget: some View {
        Group {
            if let first = entry.predictions.first {
                HStack(spacing: 8) {
                    Image(systemName: first.destination.symbol)
                        .font(.title2.weight(.semibold))
                        .frame(width: 30)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("此刻最可能")
                            .font(.caption2)
                        Text(first.destination.name)
                            .font(.headline)
                            .lineLimit(1)
                        Text(first.reason)
                            .font(.caption2)
                            .lineLimit(1)
                    }
                }
                .widgetAccentable()
                .widgetURL(deepLink(for: first.destination))
            }
        }
        .containerBackground(for: .widget) {
            AccessoryWidgetBackground()
        }
    }

    private var smallWidget: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(WidgetTheme.accent)
                Text("此刻")
                    .font(.caption.weight(.bold))
                Spacer()
            }

            if let first = entry.predictions.first {
                Link(destination: deepLink(for: first.destination)) {
                    HStack(spacing: 10) {
                        WidgetGlyph(destination: first.destination, size: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(first.destination.name)
                                .font(.headline)
                                .foregroundStyle(WidgetTheme.ink)
                            Text(first.reason)
                                .font(.system(size: 9))
                                .foregroundStyle(WidgetTheme.muted)
                                .lineLimit(2)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(2)
        .containerBackground(WidgetTheme.paper, for: .widget)
    }

    private var mediumWidget: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 5) {
                Text("HOMESORT")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(WidgetTheme.accent)
                Text(timeTitle)
                    .font(.system(size: 19, weight: .bold, design: .serif))
                    .foregroundStyle(WidgetTheme.ink)
                Text("预测入口")
                    .font(.caption2)
                    .foregroundStyle(WidgetTheme.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 12) {
                ForEach(entry.predictions.prefix(4)) { prediction in
                    Link(destination: deepLink(for: prediction.destination)) {
                        VStack(spacing: 5) {
                            WidgetGlyph(destination: prediction.destination, size: 42)
                            Text(prediction.destination.name)
                                .font(.system(size: 9, weight: .medium))
                                .foregroundStyle(WidgetTheme.ink)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
        .containerBackground(WidgetTheme.paper, for: .widget)
    }

    private var largeWidget: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(timeTitle)
                        .font(.system(size: 25, weight: .bold, design: .serif))
                        .foregroundStyle(WidgetTheme.ink)
                    Text("根据你的真实使用动态排序")
                        .font(.caption)
                        .foregroundStyle(WidgetTheme.muted)
                }
                Spacer()
                Image(systemName: "square.grid.2x2.fill")
                    .foregroundStyle(WidgetTheme.accent)
            }

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10),
                ],
                spacing: 10
            ) {
                ForEach(entry.predictions.prefix(6)) { prediction in
                    Link(destination: deepLink(for: prediction.destination)) {
                        HStack(spacing: 10) {
                            WidgetGlyph(destination: prediction.destination, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(prediction.destination.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(WidgetTheme.ink)
                                    .lineLimit(1)
                                Text(prediction.reason)
                                    .font(.system(size: 9))
                                    .foregroundStyle(WidgetTheme.muted)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(8)
                        .background(WidgetTheme.ink.opacity(0.045))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
        .containerBackground(WidgetTheme.paper, for: .widget)
    }

    @ViewBuilder
    private var emptyState: some View {
        if family == .accessoryCircular {
            Image(systemName: "square.grid.2x2.fill")
                .widgetAccentable()
                .containerBackground(for: .widget) {
                    AccessoryWidgetBackground()
                }
                .widgetURL(URL(string: "homesort://setup"))
        } else if family == .accessoryRectangular {
            VStack(alignment: .leading, spacing: 2) {
                Text("HomeSort")
                    .font(.headline)
                Text("打开并选择常用 App")
                    .font(.caption)
            }
            .widgetAccentable()
            .containerBackground(for: .widget) {
                AccessoryWidgetBackground()
            }
            .widgetURL(URL(string: "homesort://setup"))
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "square.grid.2x2.fill")
                    .foregroundStyle(WidgetTheme.accent)
                Text("完成 HomeSort 设置")
                    .font(.headline)
                    .foregroundStyle(WidgetTheme.ink)
                Text("选择常用 App 后，预测入口会出现在这里。")
                    .font(.caption)
                    .foregroundStyle(WidgetTheme.muted)
            }
            .containerBackground(WidgetTheme.paper, for: .widget)
            .widgetURL(URL(string: "homesort://setup"))
        }
    }

    private var timeTitle: String {
        let hour = Calendar.current.component(.hour, from: entry.date)
        switch hour {
        case 5..<11: return "早上好"
        case 11..<14: return "中午好"
        case 14..<18: return "下午好"
        default: return "晚上好"
        }
    }

    private func deepLink(for destination: AppDestination) -> URL {
        URL(string: "homesort://open?id=\(destination.id)")!
    }
}

private struct WidgetGlyph: View {
    let destination: AppDestination
    let size: CGFloat

    var body: some View {
        Image(systemName: destination.symbol)
            .font(.system(size: size * 0.34, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(widgetHex: destination.colorHex))
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22))
    }
}

private enum WidgetTheme {
    static let paper = Color(widgetHex: "#F5F1E8")
    static let ink = Color(widgetHex: "#171612")
    static let muted = Color(widgetHex: "#777168")
    static let accent = Color(widgetHex: "#F05B3D")
}

private extension Color {
    init(widgetHex hex: String) {
        let sanitized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

@main
struct HomeSortWidgetBundle: WidgetBundle {
    var body: some Widget {
        HomeSortLauncherWidget()
    }
}

struct HomeSortLauncherWidget: Widget {
    let kind = "HomeSortLauncherWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LauncherProvider()) { entry in
            HomeSortWidgetView(entry: entry)
        }
        .configurationDisplayName("此刻最可能")
        .description("把当前最可能使用的 App 放到第一眼。")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryRectangular,
        ])
        .contentMarginsDisabled()
    }
}
