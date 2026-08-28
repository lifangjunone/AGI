import CoreGraphics
import XCTest
@testable import DeliveryComputerUseV2

final class DisplayGeometryTests: XCTestCase {
    private let displays = [
        CGRect(x: 0, y: 0, width: 1512, height: 982),
        CGRect(x: -408, y: -1080, width: 1920, height: 1080),
        CGRect(x: 1512, y: -938, width: 1080, height: 1920)
    ]

    func testWindowRelativePointPreservesNegativeDisplayOrigin() {
        let frame = CGRect(x: -300, y: -900, width: 1200, height: 800)
        let point = windowRelativePoint(frame, x: 0.25, y: 0.5)

        XCTAssertEqual(point.x, 0)
        XCTAssertEqual(point.y, -500)
    }

    func testDisplaySelectionUsesLargestWindowIntersection() {
        let mostlyVerticalDisplay = CGRect(
            x: 1450,
            y: -700,
            width: 900,
            height: 1400
        )

        XCTAssertEqual(
            overlappingDisplayIndex(
                for: mostlyVerticalDisplay,
                displays: displays
            ),
            2
        )
    }

    func testSafeClickAllowsNegativeAndRotatedDisplayCoordinates() {
        let frame = CGRect(x: 1600, y: -700, width: 800, height: 1200)
        let point = windowRelativePoint(frame, x: 0.5, y: 0.5)

        XCTAssertTrue(
            pointIsSafeForClick(
                point,
                expectedFrame: frame,
                displays: displays
            )
        )
    }

    func testSafeClickRejectsAnotherDisplayAndDesktopGap() {
        let frame = CGRect(x: 100, y: 100, width: 900, height: 700)

        XCTAssertFalse(
            pointIsSafeForClick(
                CGPoint(x: 1800, y: -400),
                expectedFrame: frame,
                displays: displays
            )
        )
        XCTAssertFalse(
            pointIsSafeForClick(
                CGPoint(x: -300, y: 400),
                expectedFrame: nil,
                displays: displays
            )
        )
    }

    func testDisplaySelectionRejectsWindowOutsideEveryDisplay() {
        XCTAssertEqual(
            overlappingDisplayIndex(
                for: CGRect(x: 5000, y: 5000, width: 600, height: 400),
                displays: displays
            ),
            -1
        )
    }
}
