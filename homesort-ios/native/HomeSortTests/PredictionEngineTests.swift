import XCTest
@testable import HomeSort

final class PredictionEngineTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    func testPreferenceOrderIsStableWithoutHistory() throws {
        let selected = ["wechat", "feishu", "calendar"]
        let destinations = selected.compactMap(AppCatalog.destination)
        let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 9)))

        let result = PredictionEngine.rank(
            destinations: destinations,
            events: [],
            preferredOrder: selected,
            now: now,
            calendar: calendar
        )

        XCTAssertEqual(result.map(\.id), selected)
        XCTAssertTrue(result.allSatisfy { $0.reason == "你的常用选择" })
    }

    func testEnterpriseDidiMatchesCommonSearchAlias() throws {
        let destination = try XCTUnwrap(AppCatalog.destination(id: "didi-enterprise"))

        XCTAssertTrue(destination.matches("企业滴滴"))
        XCTAssertTrue(destination.matches("滴滴企业版"))
        XCTAssertFalse(destination.matches("普通购物"))
    }

    func testClockMatchesClockAndAlarmSearches() throws {
        let destination = try XCTUnwrap(AppCatalog.destination(id: "clock"))

        XCTAssertTrue(destination.matches("时钟"))
        XCTAssertTrue(destination.matches("闹钟"))
    }

    @MainActor
    func testHomeShowsFiveSelectedPredictions() {
        let suiteName = "HomeSortTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let store = SharedLauncherStore(defaults: defaults)
        let selected = ["wechat", "feishu", "dingtalk", "alipay", "taobao"]
        store.saveProfile(
            LauncherProfile(
                selectedDestinationIDs: selected,
                hasCompletedOnboarding: true,
                cloudSyncEnabled: false,
                updatedAt: .now
            )
        )

        let model = AppModel(store: store)

        XCTAssertEqual(model.visiblePredictions.map(\.id), selected)
        defaults.removePersistentDomain(forName: suiteName)
    }

    @MainActor
    func testExistingSelectionIsNormalizedToHomeCapacity() {
        let suiteName = "HomeSortTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let store = SharedLauncherStore(defaults: defaults)
        store.saveProfile(
            LauncherProfile(
                selectedDestinationIDs: [
                    "wechat", "feishu", "dingtalk", "alipay", "taobao", "douyin",
                ],
                hasCompletedOnboarding: true,
                cloudSyncEnabled: false,
                updatedAt: .now
            )
        )

        let model = AppModel(store: store)

        XCTAssertEqual(model.profile.selectedDestinationIDs.count, AppModel.maximumHomeEntrances)
        XCTAssertEqual(store.loadProfile().selectedDestinationIDs, model.profile.selectedDestinationIDs)
        defaults.removePersistentDomain(forName: suiteName)
    }

    func testRepeatedSameHourUsageOutranksInitialPreference() throws {
        let selected = ["wechat", "feishu"]
        let destinations = selected.compactMap(AppCatalog.destination)
        let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 9)))
        let feishuEvents = (1...5).map { dayOffset in
            LaunchEvent(
                destinationID: "feishu",
                timestamp: calendar.date(byAdding: .day, value: -dayOffset, to: now)!,
                source: .app
            )
        }

        let result = PredictionEngine.rank(
            destinations: destinations,
            events: feishuEvents,
            preferredOrder: selected,
            now: now,
            calendar: calendar
        )

        XCTAssertEqual(result.first?.id, "feishu")
        XCTAssertEqual(result.first?.reason, "你常在这个时间使用")
    }

    func testMemorySummaryUsesRecordedEventsOnly() throws {
        let morning = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 28, hour: 9)))
        let nextMorning = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 9)))
        let events = [
            LaunchEvent(destinationID: "wechat", timestamp: morning, source: .app),
            LaunchEvent(destinationID: "wechat", timestamp: nextMorning, source: .widget),
            LaunchEvent(destinationID: "feishu", timestamp: nextMorning, source: .suggestion),
        ]

        let summary = MemorySummary.make(events: events, calendar: calendar)

        XCTAssertEqual(summary.totalLaunches, 3)
        XCTAssertEqual(summary.topDestination?.id, "wechat")
        XCTAssertEqual(summary.strongestHour, 9)
        XCTAssertEqual(summary.activeDays, 2)
    }

    func testStoreRoundTripAndDeleteMemory() {
        let suiteName = "HomeSortTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let store = SharedLauncherStore(defaults: defaults)
        let profile = LauncherProfile(
            selectedDestinationIDs: ["wechat", "feishu"],
            hasCompletedOnboarding: true,
            cloudSyncEnabled: false,
            updatedAt: .now
        )

        store.saveProfile(profile)
        store.recordLaunch(destinationID: "wechat", source: .app)

        XCTAssertEqual(store.loadProfile(), profile)
        XCTAssertEqual(store.loadEvents().count, 1)

        store.deleteAllMemory()
        XCTAssertTrue(store.loadEvents().isEmpty)
        XCTAssertEqual(store.loadProfile(), profile)
        defaults.removePersistentDomain(forName: suiteName)
    }
}
