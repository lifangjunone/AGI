import CoreGraphics
import Foundation

func rectangleArea(_ rectangle: CGRect) -> CGFloat {
    guard !rectangle.isNull, !rectangle.isInfinite else { return 0 }
    return max(0, rectangle.width) * max(0, rectangle.height)
}

func overlappingDisplayIndex(for frame: CGRect, displays: [CGRect]) -> Int {
    displays.enumerated().max {
        rectangleArea($0.element.intersection(frame))
            < rectangleArea($1.element.intersection(frame))
    }.flatMap { candidate in
        rectangleArea(candidate.element.intersection(frame)) > 0
            ? candidate.offset
            : nil
    } ?? -1
}

func windowRelativePoint(_ frame: CGRect, x: CGFloat, y: CGFloat) -> CGPoint {
    CGPoint(
        x: frame.minX + frame.width * x,
        y: frame.minY + frame.height * y
    )
}

func pointIsSafeForClick(
    _ point: CGPoint,
    expectedFrame: CGRect?,
    displays: [CGRect]
) -> Bool {
    guard point.x.isFinite, point.y.isFinite else { return false }
    guard displays.isEmpty || displays.contains(where: { $0.contains(point) }) else {
        return false
    }
    guard let expectedFrame else { return true }
    return expectedFrame.insetBy(dx: -4, dy: -4).contains(point)
}
