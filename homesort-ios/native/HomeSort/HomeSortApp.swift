import Observation
import StoreKit
import SwiftUI
import UIKit
import WidgetKit

@main
struct HomeSortApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.light)
                .onOpenURL { url in
                    model.handleDeepLink(url)
                }
                .task {
                    await model.loadProducts()
                }
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                model.reload()
            }
        }
    }
}

@MainActor
@Observable
final class AppModel {
    static let maximumHomeEntrances = 5

    enum Tab: Hashable {
        case now
        case memory
        case settings
    }

    private let store: SharedLauncherStore
    private let productID = "com.huimiying.homesort.pro.yearly"

    var profile: LauncherProfile
    var events: [LaunchEvent]
    var selectedTab: Tab = .now
    var batchIndex = 0
    var launchError: String?
    var products: [Product] = []
    var isPro = false
    var isPurchasing = false

    init(store: SharedLauncherStore = .shared) {
        self.store = store
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-reset") {
            store.reset()
        }
#endif
        self.profile = store.loadProfile()
        self.events = store.loadEvents()
        if profile.selectedDestinationIDs.count > Self.maximumHomeEntrances {
            profile.selectedDestinationIDs = Array(
                profile.selectedDestinationIDs.prefix(Self.maximumHomeEntrances)
            )
            profile.updatedAt = .now
            store.saveProfile(profile)
        }
    }

    var selectedDestinations: [AppDestination] {
        profile.selectedDestinationIDs.compactMap(AppCatalog.destination)
    }

    var predictions: [Prediction] {
        PredictionEngine.rank(
            destinations: selectedDestinations,
            events: events,
            preferredOrder: profile.selectedDestinationIDs
        )
    }

    var visiblePredictions: [Prediction] {
        guard !predictions.isEmpty else { return [] }
        let batchSize = Self.maximumHomeEntrances
        let start = (batchIndex * batchSize) % predictions.count
        return (0..<min(batchSize, predictions.count)).map { offset in
            predictions[(start + offset) % predictions.count]
        }
    }

    var memorySummary: MemorySummary {
        MemorySummary.make(events: events)
    }

    func reload() {
        profile = store.loadProfile()
        events = store.loadEvents()
    }

    func completeOnboarding(selectedIDs: [String]) {
        profile = LauncherProfile(
            selectedDestinationIDs: Array(selectedIDs.prefix(Self.maximumHomeEntrances)),
            hasCompletedOnboarding: true,
            cloudSyncEnabled: false,
            updatedAt: .now
        )
        store.saveProfile(profile)
        WidgetCenter.shared.reloadAllTimelines()
    }

    func updateSelection(_ selectedIDs: [String]) {
        profile.selectedDestinationIDs = Array(selectedIDs.prefix(Self.maximumHomeEntrances))
        profile.updatedAt = .now
        store.saveProfile(profile)
        batchIndex = 0
        // #region debug-point A-B:model-updated
        Task { var request = URLRequest(url: URL(string: "http://127.0.0.1:7777/event")!); request.httpMethod = "POST"; request.httpBody = try? JSONSerialization.data(withJSONObject: ["sessionId": "app-management-sync", "runId": "post-fix", "hypothesisId": "A-B", "location": "HomeSortApp.swift:AppModel.updateSelection", "msg": "[DEBUG] Model selection saved", "data": ["selectedIDs": profile.selectedDestinationIDs, "visiblePredictionIDs": visiblePredictions.map(\.id)]]); _ = try? await URLSession.shared.data(for: request) }
        // #endregion
        WidgetCenter.shared.reloadAllTimelines()
    }

    func showNextBatch() {
        guard predictions.count > Self.maximumHomeEntrances else { return }
        batchIndex = (batchIndex + 1) % Int(
            ceil(Double(predictions.count) / Double(Self.maximumHomeEntrances))
        )
    }

    func open(_ destination: AppDestination, source: LaunchSource = .app) {
        guard let url = destination.candidateURLs.first(where: UIApplication.shared.canOpenURL) else {
            launchError = "未检测到\(destination.name)，或该应用暂不支持快捷打开。"
            return
        }

        store.recordLaunch(destinationID: destination.id, source: source)
        events = store.loadEvents()
        WidgetCenter.shared.reloadAllTimelines()
        UIApplication.shared.open(url)
    }

    func handleDeepLink(_ url: URL) {
        guard
            url.scheme == "homesort",
            url.host == "open",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let id = components.queryItems?.first(where: { $0.name == "id" })?.value,
            let destination = AppCatalog.destination(id: id)
        else {
            return
        }

        Task {
            try? await Task.sleep(for: .milliseconds(180))
            open(destination, source: .widget)
        }
    }

    func deleteMemory() {
        store.deleteAllMemory()
        events = []
        WidgetCenter.shared.reloadAllTimelines()
    }

    func resetProduct() {
        store.reset()
        profile = .empty
        events = []
        selectedTab = .now
        batchIndex = 0
        WidgetCenter.shared.reloadAllTimelines()
    }

    func setCloudSync(_ enabled: Bool) {
        profile.cloudSyncEnabled = enabled
        profile.updatedAt = .now
        store.saveProfile(profile)
    }

    func loadProducts() async {
        do {
            products = try await Product.products(for: [productID])
            await refreshEntitlements()
        } catch {
            products = []
        }
    }

    func purchase() async {
        guard let product = products.first else { return }
        isPurchasing = true
        defer { isPurchasing = false }

        do {
            let result = try await product.purchase()
            if case let .success(verification) = result,
               case let .verified(transaction) = verification {
                isPro = true
                await transaction.finish()
            }
        } catch {
            launchError = "购买未完成，请稍后重试。"
        }
    }

    private func refreshEntitlements() async {
        var entitled = false
        for await result in Transaction.currentEntitlements {
            if case let .verified(transaction) = result,
               transaction.productID == productID,
               transaction.revocationDate == nil {
                entitled = true
            }
        }
        isPro = entitled
    }
}

struct CloudSyncEnvelope: Codable, Sendable {
    let profile: LauncherProfile
    let events: [LaunchEvent]
    let deviceTimestamp: Date
}

struct AliyunSyncClient {
    enum SyncError: Error {
        case invalidResponse
    }

    let endpoint: URL
    let session: URLSession

    init(endpoint: URL, session: URLSession = .shared) {
        self.endpoint = endpoint
        self.session = session
    }

    func push(_ envelope: CloudSyncEnvelope, bearerToken: String) async throws {
        var request = URLRequest(url: endpoint.appending(path: "v1/launcher/sync"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(envelope)

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw SyncError.invalidResponse
        }
    }
}
