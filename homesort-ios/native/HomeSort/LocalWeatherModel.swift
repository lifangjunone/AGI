@preconcurrency import CoreLocation
import Foundation

struct LocalWeather: Equatable {
    let temperatureCelsius: Int
    let weatherCode: Int
    let locationName: String

    var condition: WeatherCondition {
        WeatherCondition(code: weatherCode)
    }
}

enum WeatherCondition: String {
    case clear = "晴"
    case partlyCloudy = "多云"
    case fog = "有雾"
    case rain = "有雨"
    case snow = "有雪"
    case thunderstorm = "雷雨"
    case unknown = "天气"

    init(code: Int) {
        switch code {
        case 0: self = .clear
        case 1, 2, 3: self = .partlyCloudy
        case 45, 48: self = .fog
        case 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82: self = .rain
        case 71, 73, 75, 77, 85, 86: self = .snow
        case 95, 96, 99: self = .thunderstorm
        default: self = .unknown
        }
    }

    var symbolName: String {
        switch self {
        case .clear: "sun.max.fill"
        case .partlyCloudy: "cloud.sun.fill"
        case .fog: "cloud.fog.fill"
        case .rain: "cloud.rain.fill"
        case .snow: "cloud.snow.fill"
        case .thunderstorm: "cloud.bolt.rain.fill"
        case .unknown: "cloud.fill"
        }
    }
}

@MainActor
final class LocalWeatherModel: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    enum Status: Equatable {
        case permissionNeeded
        case loading
        case ready(LocalWeather)
        case unavailable
    }

    @Published private(set) var status: Status

    private let locationManager = CLLocationManager()
    private let geocoder = CLGeocoder()
    private let session: URLSession
    private var requestID = UUID()

    init(session: URLSession = .shared) {
        self.session = session
        status = .permissionNeeded
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func start() {
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            status = .loading
            requestID = UUID()
            let activeRequestID = requestID
            locationManager.requestLocation()
            Task {
                try? await Task.sleep(for: .seconds(12))
                if requestID == activeRequestID, status == .loading {
                    status = .unavailable
                }
            }
        case .notDetermined:
            status = .permissionNeeded
        case .denied, .restricted:
            status = .permissionNeeded
        @unknown default:
            status = .unavailable
        }
    }

    func requestPermission() {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            start()
        case .denied, .restricted:
            status = .permissionNeeded
        @unknown default:
            status = .unavailable
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse
            || manager.authorizationStatus == .authorizedAlways {
            start()
        } else if manager.authorizationStatus == .denied
                    || manager.authorizationStatus == .restricted {
            status = .permissionNeeded
        }
    }

    func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let location = locations.last else {
            status = .unavailable
            return
        }
        Task {
            await loadWeather(at: location)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        status = .unavailable
    }

    private func loadWeather(at location: CLLocation) async {
        async let placeName = reverseGeocode(location)
        do {
            let current = try await fetchCurrentWeather(location)
            status = .ready(
                LocalWeather(
                    temperatureCelsius: Int(current.temperature.rounded()),
                    weatherCode: current.weatherCode,
                    locationName: await placeName
                )
            )
        } catch {
            status = .unavailable
        }
    }

    private func reverseGeocode(_ location: CLLocation) async -> String {
        guard let placemark = try? await geocoder.reverseGeocodeLocation(location).first else {
            return "当前位置"
        }
        return placemark.locality
            ?? placemark.subAdministrativeArea
            ?? placemark.administrativeArea
            ?? "当前位置"
    }

    private func fetchCurrentWeather(_ location: CLLocation) async throws -> CurrentWeather {
        var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        components.queryItems = [
            URLQueryItem(name: "latitude", value: String(location.coordinate.latitude)),
            URLQueryItem(name: "longitude", value: String(location.coordinate.longitude)),
            URLQueryItem(name: "current", value: "temperature_2m,weather_code"),
        ]
        let (data, response) = try await session.data(from: components.url!)
        guard let response = response as? HTTPURLResponse,
              200..<300 ~= response.statusCode else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(WeatherResponse.self, from: data).current
    }
}

private struct WeatherResponse: Decodable {
    let current: CurrentWeather
}

private struct CurrentWeather: Decodable {
    let temperature: Double
    let weatherCode: Int

    enum CodingKeys: String, CodingKey {
        case temperature = "temperature_2m"
        case weatherCode = "weather_code"
    }
}
