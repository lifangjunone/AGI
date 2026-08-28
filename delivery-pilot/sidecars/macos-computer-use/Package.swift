// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "delivery-computer-use",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "delivery-computer-use", targets: ["DeliveryComputerUseV2"])
    ],
    targets: [
        .executableTarget(name: "DeliveryComputerUseV2"),
        .testTarget(
            name: "DeliveryComputerUseV2Tests",
            dependencies: ["DeliveryComputerUseV2"]
        )
    ]
)
