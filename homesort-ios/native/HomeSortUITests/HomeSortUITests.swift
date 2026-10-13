import XCTest

@MainActor
final class HomeSortUITests: XCTestCase {
    private func launchApp() -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-reset"]
        app.launch()
        return app
    }

    func testOnboardingCreatesPredictiveLauncher() {
        let app = launchApp()
        XCTAssertTrue(app.staticTexts["先选出你真正\n会用到的 App。"].waitForExistence(timeout: 5))

        ["微信，未选择", "飞书，未选择", "钉钉，未选择", "支付宝，未选择", "淘宝，未选择"].forEach { label in
            let button = app.buttons[label]
            XCTAssertTrue(button.exists, "Missing selection button: \(label)")
            button.tap()
        }

        let createButton = app.buttons["创建我的智能入口"]
        XCTAssertTrue(createButton.isEnabled)
        createButton.tap()

        XCTAssertTrue(app.staticTexts["此刻最可能"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["searchAllApps"].exists)
        XCTAssertTrue(app.buttons["使用记忆"].exists)
        XCTAssertTrue(app.buttons["设置"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        XCTAssertFalse(app.buttons["换一组"].exists)
        XCTAssertFalse(app.staticTexts["我的入口"].exists)
        ["微信", "飞书", "钉钉", "支付宝", "淘宝"].forEach { name in
            XCTAssertTrue(app.staticTexts[name].exists, "Missing home prediction: \(name)")
        }

        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = "Predictive launcher home"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testMemoryStartsFromRealUsageOnly() {
        let app = launchApp()
        ["微信，未选择", "飞书，未选择", "钉钉，未选择", "支付宝，未选择"].forEach {
            app.buttons[$0].tap()
        }
        app.buttons["创建我的智能入口"].tap()
        app.buttons["使用记忆"].tap()

        XCTAssertTrue(app.staticTexts["记忆正在形成"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["从 HomeSort 打开 App 后，这里才会出现真实使用规律。"].exists)
    }

    func testSearchFindsAppsOutsidePredictionSlots() {
        let app = launchApp()
        ["微信，未选择", "飞书，未选择", "钉钉，未选择", "支付宝，未选择"].forEach {
            app.buttons[$0].tap()
        }
        app.buttons["创建我的智能入口"].tap()

        let searchButton = app.buttons["searchAllApps"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 5))
        searchButton.tap()

        let searchField = app.textFields["输入 App 名称或类别"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 5))
        searchField.typeText("时钟")

        XCTAssertTrue(app.staticTexts["时钟"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["工具"].exists)
    }

    func testManageAppsCanSearchAdditionalEntrances() {
        let app = launchApp()
        ["微信，未选择", "飞书，未选择", "钉钉，未选择", "支付宝，未选择"].forEach {
            app.buttons[$0].tap()
        }
        app.buttons["创建我的智能入口"].tap()
        app.buttons["设置"].tap()
        app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "管理 App")
        ).firstMatch.tap()

        let searchField = app.textFields["搜索要添加的 App"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 5))
        searchField.typeText("企业滴滴")

        XCTAssertTrue(app.buttons["滴滴企业版，未选择"].waitForExistence(timeout: 5))
    }

    func testManagementCapsSelectionsToHomeCapacity() {
        let app = launchApp()
        ["微信，未选择", "飞书，未选择", "钉钉，未选择", "支付宝，未选择"].forEach {
            app.buttons[$0].tap()
        }
        app.buttons["创建我的智能入口"].tap()
        app.buttons["设置"].tap()
        app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@", "管理 App")
        ).firstMatch.tap()

        let searchField = app.textFields["搜索要添加的 App"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 5))
        searchField.typeText("淘宝")
        app.buttons["淘宝，未选择"].tap()
        app.buttons["清除搜索"].tap()
        searchField.typeText("抖音")
        XCTAssertFalse(app.buttons["抖音，未选择"].isEnabled)
        app.buttons["完成"].tap()

        XCTAssertTrue(app.staticTexts["5 个入口"].waitForExistence(timeout: 5))
        app.swipeDown()

        XCTAssertTrue(app.staticTexts["淘宝"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["抖音"].exists)
    }
}
