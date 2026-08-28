import AppKit

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))

image.lockFocus()
guard let context = NSGraphicsContext.current?.cgContext else {
  fatalError("Unable to create drawing context")
}

context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

let iconRect = CGRect(x: 62, y: 62, width: 900, height: 900)
let iconPath = CGPath(
  roundedRect: iconRect,
  cornerWidth: 210,
  cornerHeight: 210,
  transform: nil
)
context.saveGState()
context.addPath(iconPath)
context.clip()

let colors = [
  NSColor(calibratedRed: 0.08, green: 0.12, blue: 0.28, alpha: 1).cgColor,
  NSColor(calibratedRed: 0.34, green: 0.31, blue: 0.83, alpha: 1).cgColor
] as CFArray
let gradient = CGGradient(
  colorsSpace: CGColorSpaceCreateDeviceRGB(),
  colors: colors,
  locations: [0, 1]
)!
context.drawLinearGradient(
  gradient,
  start: CGPoint(x: 220, y: 160),
  end: CGPoint(x: 820, y: 900),
  options: []
)

context.setFillColor(NSColor(calibratedWhite: 0.02, alpha: 0.22).cgColor)
context.fillEllipse(in: CGRect(x: 650, y: 620, width: 430, height: 430))
context.restoreGState()

context.setStrokeColor(NSColor(calibratedWhite: 1, alpha: 0.94).cgColor)
context.setLineWidth(48)
context.setLineCap(.round)
context.setLineJoin(.round)
let shield = CGMutablePath()
shield.move(to: CGPoint(x: 512, y: 792))
shield.addLine(to: CGPoint(x: 302, y: 690))
shield.addLine(to: CGPoint(x: 302, y: 502))
shield.addCurve(
  to: CGPoint(x: 512, y: 245),
  control1: CGPoint(x: 302, y: 376),
  control2: CGPoint(x: 389, y: 286)
)
shield.addCurve(
  to: CGPoint(x: 722, y: 502),
  control1: CGPoint(x: 635, y: 286),
  control2: CGPoint(x: 722, y: 376)
)
shield.addLine(to: CGPoint(x: 722, y: 690))
shield.closeSubpath()
context.addPath(shield)
context.strokePath()

context.setStrokeColor(
  NSColor(calibratedRed: 0.31, green: 0.91, blue: 0.73, alpha: 1).cgColor
)
context.setLineWidth(52)
let check = CGMutablePath()
check.move(to: CGPoint(x: 405, y: 515))
check.addLine(to: CGPoint(x: 485, y: 435))
check.addLine(to: CGPoint(x: 630, y: 590))
context.addPath(check)
context.strokePath()

for point in [
  CGPoint(x: 236, y: 280),
  CGPoint(x: 800, y: 330),
  CGPoint(x: 835, y: 720)
] {
  context.setFillColor(
    NSColor(calibratedRed: 0.31, green: 0.91, blue: 0.73, alpha: 0.82).cgColor
  )
  context.fillEllipse(in: CGRect(x: point.x - 12, y: point.y - 12, width: 24, height: 24))
}

image.unlockFocus()

guard
  let data = image.tiffRepresentation,
  let representation = NSBitmapImageRep(data: data),
  let png = representation.representation(using: .png, properties: [:])
else {
  fatalError("Unable to encode icon")
}

let output = CommandLine.arguments.dropFirst().first ?? "build/icon-1024.png"
try png.write(to: URL(fileURLWithPath: output))
