import XCTest
@testable import HomeSort

final class WeatherConditionTests: XCTestCase {
    func testMapsOpenMeteoWeatherCodes() {
        XCTAssertEqual(WeatherCondition(code: 0), .clear)
        XCTAssertEqual(WeatherCondition(code: 2), .partlyCloudy)
        XCTAssertEqual(WeatherCondition(code: 45), .fog)
        XCTAssertEqual(WeatherCondition(code: 63), .rain)
        XCTAssertEqual(WeatherCondition(code: 75), .snow)
        XCTAssertEqual(WeatherCondition(code: 95), .thunderstorm)
        XCTAssertEqual(WeatherCondition(code: -1), .unknown)
    }
}
