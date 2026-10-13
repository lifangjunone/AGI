import Foundation

struct AppDestination: Identifiable, Codable, Hashable, Sendable {
    let id: String
    let name: String
    let category: String
    let symbol: String
    let colorHex: String
    let urlString: String
    let searchAliases: [String]

    var url: URL? {
        URL(string: urlString)
    }

    var candidateURLs: [URL] {
        let candidates: [String]
        if id == "didi-enterprise" {
            candidates = [
                "didiEnterprise://",
                "didi-enterprise://",
                "didi-esp://",
                "esdidi://",
                "com.xiaojukeji.esp://",
            ]
        } else if id == "clock" {
            candidates = [
                "clock-alarm://",
                "clock-worldclock://",
                "clock-timer://",
                "clock-stopwatch://",
            ]
        } else {
            candidates = [urlString]
        }
        return candidates.compactMap(URL.init(string:))
    }

    init(
        id: String,
        name: String,
        category: String,
        symbol: String,
        colorHex: String,
        urlString: String,
        searchAliases: [String] = []
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.symbol = symbol
        self.colorHex = colorHex
        self.urlString = urlString
        self.searchAliases = searchAliases
    }

    func matches(_ rawQuery: String) -> Bool {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return true }
        return ([name, category, id] + searchAliases).contains {
            $0.localizedCaseInsensitiveContains(query)
        }
    }
}

enum AppCatalog {
    static let all: [AppDestination] = [
        .init(id: "wechat", name: "微信", category: "沟通", symbol: "message.fill", colorHex: "#25B85A", urlString: "weixin://"),
        .init(id: "feishu", name: "飞书", category: "工作", symbol: "paperplane.fill", colorHex: "#3370FF", urlString: "feishu://"),
        .init(id: "dingtalk", name: "钉钉", category: "工作", symbol: "bolt.fill", colorHex: "#2878FF", urlString: "dingtalk://"),
        .init(id: "alipay", name: "支付宝", category: "生活", symbol: "creditcard.fill", colorHex: "#1677FF", urlString: "alipay://"),
        .init(id: "taobao", name: "淘宝", category: "购物", symbol: "bag.fill", colorHex: "#FF5000", urlString: "taobao://"),
        .init(id: "douyin", name: "抖音", category: "娱乐", symbol: "music.note", colorHex: "#171719", urlString: "snssdk1128://"),
        .init(id: "xiaohongshu", name: "小红书", category: "内容", symbol: "book.pages.fill", colorHex: "#FF3040", urlString: "xhsdiscover://"),
        .init(id: "didi", name: "滴滴出行", category: "出行", symbol: "car.fill", colorHex: "#FF7B21", urlString: "diditaxi://"),
        .init(
            id: "didi-enterprise",
            name: "滴滴企业版",
            category: "企业出行",
            symbol: "building.2.fill",
            colorHex: "#FF7B21",
            urlString: "didiEnterprise://",
            searchAliases: ["企业滴滴", "企业版滴滴", "企业用车", "企业打车"]
        ),
        .init(id: "amap", name: "高德地图", category: "出行", symbol: "map.fill", colorHex: "#4A87F7", urlString: "amapuri://"),
        .init(id: "bilibili", name: "哔哩哔哩", category: "娱乐", symbol: "play.rectangle.fill", colorHex: "#FB7299", urlString: "bilibili://"),
        .init(id: "zhihu", name: "知乎", category: "内容", symbol: "text.bubble.fill", colorHex: "#1772F6", urlString: "zhihu://"),
        .init(id: "calendar", name: "日历", category: "效率", symbol: "calendar", colorHex: "#E64B3C", urlString: "calshow://"),
        .init(
            id: "clock",
            name: "时钟",
            category: "工具",
            symbol: "clock.fill",
            colorHex: "#171612",
            urlString: "clock-alarm://",
            searchAliases: ["闹钟", "计时器", "秒表", "世界时钟"]
        ),
        .init(id: "mail", name: "邮件", category: "效率", symbol: "envelope.fill", colorHex: "#387FF1", urlString: "message://"),
        .init(id: "music", name: "音乐", category: "娱乐", symbol: "music.note", colorHex: "#F34A65", urlString: "music://"),
        .init(id: "notes", name: "备忘录", category: "效率", symbol: "note.text", colorHex: "#E6B72E", urlString: "mobilenotes://"),
        .init(id: "shortcuts", name: "快捷指令", category: "效率", symbol: "square.stack.3d.up.fill", colorHex: "#7357D8", urlString: "shortcuts://"),
    ]

    static func destination(id: String) -> AppDestination? {
        all.first { $0.id == id }
    }
}

enum LaunchSource: String, Codable, Sendable {
    case app
    case widget
    case suggestion
}

struct LaunchEvent: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let destinationID: String
    let timestamp: Date
    let source: LaunchSource

    init(
        id: UUID = UUID(),
        destinationID: String,
        timestamp: Date = .now,
        source: LaunchSource
    ) {
        self.id = id
        self.destinationID = destinationID
        self.timestamp = timestamp
        self.source = source
    }
}

struct LauncherProfile: Codable, Equatable, Sendable {
    var selectedDestinationIDs: [String]
    var hasCompletedOnboarding: Bool
    var cloudSyncEnabled: Bool
    var updatedAt: Date

    static let empty = LauncherProfile(
        selectedDestinationIDs: [],
        hasCompletedOnboarding: false,
        cloudSyncEnabled: false,
        updatedAt: .now
    )
}

struct Prediction: Identifiable, Equatable, Sendable {
    let destination: AppDestination
    let score: Double
    let reason: String

    var id: String { destination.id }
}

enum PredictionEngine {
    static func rank(
        destinations: [AppDestination],
        events: [LaunchEvent],
        preferredOrder: [String],
        now: Date = .now,
        calendar: Calendar = .current
    ) -> [Prediction] {
        let currentHour = calendar.component(.hour, from: now)
        let currentWeekday = calendar.component(.weekday, from: now)

        return destinations.map { destination in
            let destinationEvents = events.filter { $0.destinationID == destination.id }
            let preferredIndex = preferredOrder.firstIndex(of: destination.id) ?? preferredOrder.count
            var score = Double(max(preferredOrder.count - preferredIndex, 0)) * 2
            score += log(Double(destinationEvents.count) + 1) * 2.2

            var timeMatches = 0
            var weekdayMatches = 0
            var recencyScore = 0.0

            for event in destinationEvents {
                let eventHour = calendar.component(.hour, from: event.timestamp)
                let hourDistance = min(abs(eventHour - currentHour), 24 - abs(eventHour - currentHour))
                if hourDistance == 0 {
                    score += 3.2
                    timeMatches += 1
                } else if hourDistance == 1 {
                    score += 1.4
                    timeMatches += 1
                }

                if calendar.component(.weekday, from: event.timestamp) == currentWeekday {
                    score += 0.8
                    weekdayMatches += 1
                }

                let ageInHours = max(now.timeIntervalSince(event.timestamp) / 3_600, 0)
                recencyScore += 2.6 * exp(-ageInHours / 72)
            }

            score += min(recencyScore, 7)

            let reason: String
            if destinationEvents.isEmpty {
                reason = "你的常用选择"
            } else if timeMatches >= 2 {
                reason = "你常在这个时间使用"
            } else if weekdayMatches >= 2 {
                reason = "你常在今天使用"
            } else {
                reason = "近期使用较多"
            }

            return Prediction(destination: destination, score: score, reason: reason)
        }
        .sorted {
            if abs($0.score - $1.score) < 0.001 {
                return preferredOrder.firstIndex(of: $0.id) ?? .max
                    < preferredOrder.firstIndex(of: $1.id) ?? .max
            }
            return $0.score > $1.score
        }
    }
}

struct MemorySummary: Equatable, Sendable {
    let totalLaunches: Int
    let topDestination: AppDestination?
    let strongestHour: Int?
    let activeDays: Int

    static func make(events: [LaunchEvent], calendar: Calendar = .current) -> MemorySummary {
        let destinationCounts = Dictionary(grouping: events, by: \.destinationID).mapValues(\.count)
        let topID = destinationCounts.max { $0.value < $1.value }?.key
        let hourCounts = Dictionary(grouping: events) { calendar.component(.hour, from: $0.timestamp) }.mapValues(\.count)
        let dayCount = Set(events.map { calendar.startOfDay(for: $0.timestamp) }).count

        return MemorySummary(
            totalLaunches: events.count,
            topDestination: topID.flatMap(AppCatalog.destination),
            strongestHour: hourCounts.max { $0.value < $1.value }?.key,
            activeDays: dayCount
        )
    }
}

final class SharedLauncherStore: @unchecked Sendable {
    static let appGroupID = "group.com.huimiying.homesort"
    static let shared = SharedLauncherStore()

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let profileKey = "launcher.profile.v1"
    private let eventsKey = "launcher.events.v1"
    private let maximumStoredEvents = 2_000

    init(defaults: UserDefaults? = UserDefaults(suiteName: appGroupID)) {
        self.defaults = defaults ?? .standard
    }

    func loadProfile() -> LauncherProfile {
        guard
            let data = defaults.data(forKey: profileKey),
            let profile = try? decoder.decode(LauncherProfile.self, from: data)
        else {
            return .empty
        }
        return profile
    }

    func saveProfile(_ profile: LauncherProfile) {
        guard let data = try? encoder.encode(profile) else { return }
        defaults.set(data, forKey: profileKey)
    }

    func loadEvents() -> [LaunchEvent] {
        guard
            let data = defaults.data(forKey: eventsKey),
            let events = try? decoder.decode([LaunchEvent].self, from: data)
        else {
            return []
        }
        return events
    }

    func recordLaunch(destinationID: String, source: LaunchSource, at date: Date = .now) {
        var events = loadEvents()
        events.append(LaunchEvent(destinationID: destinationID, timestamp: date, source: source))
        if events.count > maximumStoredEvents {
            events.removeFirst(events.count - maximumStoredEvents)
        }
        saveEvents(events)
    }

    func deleteAllMemory() {
        defaults.removeObject(forKey: eventsKey)
    }

    func reset() {
        defaults.removeObject(forKey: profileKey)
        defaults.removeObject(forKey: eventsKey)
    }

    private func saveEvents(_ events: [LaunchEvent]) {
        guard let data = try? encoder.encode(events) else { return }
        defaults.set(data, forKey: eventsKey)
    }
}
