import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let iconset = root.appendingPathComponent("AppIcon.iconset", isDirectory: true)
try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func makeIcon(size: Int, scale: Int, name: String) throws {
    let pixels = size * scale
    let image = NSImage(size: NSSize(width: pixels, height: pixels))
    image.lockFocus()

    let canvas = NSRect(x: 0, y: 0, width: pixels, height: pixels)
    let inset = CGFloat(pixels) * 0.055
    let tile = NSBezierPath(
        roundedRect: canvas.insetBy(dx: inset, dy: inset),
        xRadius: CGFloat(pixels) * 0.19,
        yRadius: CGFloat(pixels) * 0.19
    )
    NSColor(calibratedRed: 0.075, green: 0.38, blue: 0.33, alpha: 1).setFill()
    tile.fill()

    let center = NSPoint(x: CGFloat(pixels) / 2, y: CGFloat(pixels) / 2)
    let outerRadius = CGFloat(pixels) * 0.31
    let ring = NSBezierPath(
        ovalIn: NSRect(
            x: center.x - outerRadius,
            y: center.y - outerRadius,
            width: outerRadius * 2,
            height: outerRadius * 2
        )
    )
    ring.lineWidth = CGFloat(pixels) * 0.036
    NSColor(calibratedWhite: 1, alpha: 0.88).setStroke()
    ring.stroke()

    let innerRadius = CGFloat(pixels) * 0.075
    let hub = NSBezierPath(
        ovalIn: NSRect(
            x: center.x - innerRadius,
            y: center.y - innerRadius,
            width: innerRadius * 2,
            height: innerRadius * 2
        )
    )
    NSColor(calibratedWhite: 1, alpha: 0.96).setFill()
    hub.fill()

    let needle = NSBezierPath()
    needle.move(to: NSPoint(x: center.x - CGFloat(pixels) * 0.055, y: center.y - CGFloat(pixels) * 0.055))
    needle.line(to: NSPoint(x: center.x + CGFloat(pixels) * 0.08, y: center.y + CGFloat(pixels) * 0.245))
    needle.line(to: NSPoint(x: center.x + CGFloat(pixels) * 0.055, y: center.y + CGFloat(pixels) * 0.055))
    needle.line(to: NSPoint(x: center.x - CGFloat(pixels) * 0.08, y: center.y - CGFloat(pixels) * 0.245))
    needle.close()
    NSColor(calibratedRed: 0.96, green: 0.74, blue: 0.28, alpha: 1).setFill()
    needle.fill()

    let signalRadius = CGFloat(pixels) * 0.042
    for point in [
        NSPoint(x: center.x - CGFloat(pixels) * 0.23, y: center.y + CGFloat(pixels) * 0.14),
        NSPoint(x: center.x + CGFloat(pixels) * 0.26, y: center.y - CGFloat(pixels) * 0.08),
    ] {
        let signal = NSBezierPath(
            ovalIn: NSRect(
                x: point.x - signalRadius,
                y: point.y - signalRadius,
                width: signalRadius * 2,
                height: signalRadius * 2
            )
        )
        NSColor(calibratedWhite: 1, alpha: 0.86).setFill()
        signal.fill()
    }

    image.unlockFocus()
    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "Icon", code: 1)
    }
    try png.write(to: iconset.appendingPathComponent(name))
}

let entries = [
    (16, 1, "icon_16x16.png"),
    (16, 2, "icon_16x16@2x.png"),
    (32, 1, "icon_32x32.png"),
    (32, 2, "icon_32x32@2x.png"),
    (128, 1, "icon_128x128.png"),
    (128, 2, "icon_128x128@2x.png"),
    (256, 1, "icon_256x256.png"),
    (256, 2, "icon_256x256@2x.png"),
    (512, 1, "icon_512x512.png"),
    (512, 2, "icon_512x512@2x.png"),
]

for (size, scale, name) in entries {
    try makeIcon(size: size, scale: scale, name: name)
}
