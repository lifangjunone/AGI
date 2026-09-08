import AppKit
import CoreGraphics
import Foundation
import ImageIO
import Vision

struct Output: Codable {
    let type: String
    let text: String?
    let x: Double?
    let y: Double?
    let detail: String?
}

final class HoverOCR {
    private let visionQueue = DispatchQueue(label: "hover-translator.vision", qos: .userInitiated)
    private var eventTap: CFMachPort?
    private var eventSource: CFRunLoopSource?
    private var hoverWork: DispatchWorkItem?
    private var mouseDownPoint: CGPoint?
    private var latestMousePoint: CGPoint?
    private var activeHoverRect: CGRect?
    private var lastHoverText = ""
    private var lastHoverAt = Date.distantPast

    func start() {
        let preflight = CGPreflightScreenCaptureAccess()
        guard preflight || CGRequestScreenCaptureAccess() else {
            emit(Output(type: "permission", text: nil, x: nil, y: nil, detail: "screen-recording-required"))
            return
        }

        let listenPreflight = CGPreflightListenEventAccess()
        guard listenPreflight || CGRequestListenEventAccess() else {
            emit(Output(type: "permission", text: nil, x: nil, y: nil, detail: "input-monitoring-required"))
            return
        }

        let mask =
            (CGEventMask(1) << CGEventType.mouseMoved.rawValue) |
            (CGEventMask(1) << CGEventType.leftMouseDown.rawValue) |
            (CGEventMask(1) << CGEventType.leftMouseUp.rawValue)
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: { _, type, event, userInfo in
                guard let userInfo else { return Unmanaged.passUnretained(event) }
                let service = Unmanaged<HoverOCR>.fromOpaque(userInfo).takeUnretainedValue()
                if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
                    if let tap = service.eventTap {
                        CGEvent.tapEnable(tap: tap, enable: true)
                    }
                } else {
                    service.handle(type: type, event: event)
                }
                return Unmanaged.passUnretained(event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            emit(Output(type: "error", text: nil, x: nil, y: nil, detail: "global-monitor-unavailable"))
            return
        }
        eventTap = tap
        eventSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), eventSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        emit(Output(type: "ready", text: nil, x: nil, y: nil, detail: nil))
    }

    private func handle(type: CGEventType, event: CGEvent) {
        let quartzPoint = event.location
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        let point = CGPoint(x: quartzPoint.x, y: primaryHeight - quartzPoint.y)
        switch type {
        case .mouseMoved:
            latestMousePoint = point
            if let activeHoverRect, !activeHoverRect.contains(point) {
                clearActiveHover()
            }
            scheduleHover(at: point)
        case .leftMouseDown:
            hoverWork?.cancel()
            clearActiveHover()
            mouseDownPoint = point
        case .leftMouseUp:
            guard let start = mouseDownPoint else { return }
            mouseDownPoint = nil
            if event.getIntegerValueField(.mouseEventClickState) >= 2 {
                recognizeHover(at: point, type: "doubleClick")
                return
            }
            let distance = hypot(point.x - start.x, point.y - start.y)
            if distance > 12 {
                recognizeSelection(from: start, to: point)
            }
        default:
            break
        }
    }

    private func clearActiveHover() {
        guard activeHoverRect != nil else { return }
        activeHoverRect = nil
        lastHoverText = ""
        // #region debug-point E:hover-leave-emission
        if let url = URL(string: "http://127.0.0.1:7777/event"), let data = try? JSONSerialization.data(withJSONObject: ["sessionId": "example-hover-dismiss", "runId": "post-fix-3", "hypothesisId": "E", "location": "HoverOCR.clearActiveHover", "msg": "[DEBUG] Native hoverLeave emitted", "data": [:], "ts": Date().timeIntervalSince1970 * 1000]) { var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = data; URLSession.shared.dataTask(with: request).resume() }
        // #endregion
        emit(Output(type: "hoverLeave", text: nil, x: nil, y: nil, detail: nil))
    }

    private func scheduleHover(at point: CGPoint) {
        hoverWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.recognizeHover(at: point, type: "hover")
        }
        hoverWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.72, execute: work)
    }

    private func recognizeHover(at point: CGPoint, type: String) {
        let captureRect = CGRect(x: point.x - 260, y: point.y - 62, width: 520, height: 124)
        recognize(rect: captureRect) { observations in
            let localPoint = CGPoint(x: 0.5, y: 0.5)
            var best: (text: String, distance: CGFloat, rect: CGRect)?

            for observation in observations {
                guard let candidate = observation.topCandidates(1).first else { continue }
                let source = candidate.string
                let nsSource = source as NSString
                let matches = try? NSRegularExpression(pattern: "[A-Za-z]+(?:['’-][A-Za-z]+)?")
                    .matches(in: source, range: NSRange(location: 0, length: nsSource.length))
                for match in matches ?? [] {
                    guard let range = Range(match.range, in: source),
                          let box = try? candidate.boundingBox(for: range) else { continue }
                    let normalizedBox = box.boundingBox
                    let center = CGPoint(x: normalizedBox.midX, y: 1 - normalizedBox.midY)
                    let distance = hypot(center.x - localPoint.x, center.y - localPoint.y)
                    let padded = normalizedBox.insetBy(dx: -0.025, dy: -0.06)
                    if padded.contains(CGPoint(x: localPoint.x, y: 1 - localPoint.y)) || distance < 0.12 {
                        let text = String(source[range])
                        let wordRect = CGRect(
                            x: captureRect.minX + normalizedBox.minX * captureRect.width,
                            y: captureRect.minY + normalizedBox.minY * captureRect.height,
                            width: normalizedBox.width * captureRect.width,
                            height: normalizedBox.height * captureRect.height
                        )
                        if best == nil || distance < best!.distance {
                            best = (text, distance, wordRect)
                        }
                    }
                }
            }

            guard let match = best else { return }
            let word = match.text
            if type == "hover" || type == "doubleClick" {
                let hoverRect = match.rect.insetBy(dx: -8, dy: -6)
                if type == "hover" {
                    guard let latestMousePoint = self.latestMousePoint,
                          hoverRect.contains(latestMousePoint) else { return }
                }
                self.activeHoverRect = hoverRect
            }
            if type == "hover", word.lowercased() == self.lastHoverText,
               Date().timeIntervalSince(self.lastHoverAt) < 3 { return }
            self.lastHoverText = word.lowercased()
            self.lastHoverAt = Date()
            self.emit(Output(type: type, text: word, x: point.x, y: point.y, detail: nil))
            if type == "doubleClick",
               let latestMousePoint = self.latestMousePoint,
               let activeHoverRect = self.activeHoverRect,
               !activeHoverRect.contains(latestMousePoint) {
                self.clearActiveHover()
            }
        }
    }

    private func recognizeSelection(from start: CGPoint, to end: CGPoint) {
        let horizontalPadding: CGFloat = 14
        let verticalPadding: CGFloat = 26
        let rect = CGRect(
            x: min(start.x, end.x) - horizontalPadding,
            y: min(start.y, end.y) - verticalPadding,
            width: abs(end.x - start.x) + horizontalPadding * 2,
            height: abs(end.y - start.y) + verticalPadding * 2
        )
        guard rect.width > 20, rect.height > 12 else { return }
        recognize(rect: rect) { observations in
            let lines = observations
                .sorted { first, second in
                    let rowDistance = abs(first.boundingBox.midY - second.boundingBox.midY)
                    return rowDistance > 0.04
                        ? first.boundingBox.midY > second.boundingBox.midY
                        : first.boundingBox.minX < second.boundingBox.minX
                }
                .compactMap { $0.topCandidates(1).first?.string }
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            let text = lines
                .joined(separator: " ")
                .replacingOccurrences(
                    of: "\\s+([,.;:!?])",
                    with: "$1",
                    options: .regularExpression
                )
            guard text.range(of: "[A-Za-z]", options: .regularExpression) != nil else { return }
            self.activeHoverRect = rect
            self.emit(Output(type: "selection", text: text, x: end.x, y: end.y, detail: nil))
            if let latestMousePoint = self.latestMousePoint, !rect.contains(latestMousePoint) {
                self.clearActiveHover()
            }
        }
    }

    private func recognize(rect: CGRect, completion: @escaping ([VNRecognizedTextObservation]) -> Void) {
        visionQueue.async {
            guard let image = self.capture(rect: rect) else { return }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            request.usesLanguageCorrection = true
            do {
                try VNImageRequestHandler(cgImage: image).perform([request])
                let results = request.results ?? []
                DispatchQueue.main.async {
                    completion(results)
                }
            } catch {
                DispatchQueue.main.async {
                    self.emit(Output(type: "error", text: nil, x: nil, y: nil, detail: error.localizedDescription))
                }
            }
        }
    }

    private func capture(rect: CGRect) -> CGImage? {
        guard let primary = NSScreen.screens.first else { return nil }
        let topLeftRect = CGRect(
            x: rect.minX,
            y: primary.frame.height - rect.maxY,
            width: rect.width,
            height: rect.height
        )
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("hover-translator-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: file) }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = [
            "-x",
            "-R\(Int(topLeftRect.minX)),\(Int(topLeftRect.minY)),\(Int(topLeftRect.width)),\(Int(topLeftRect.height))",
            file.path,
        ]
        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0,
                  let imageData = try? Data(contentsOf: file),
                  let source = CGImageSourceCreateWithData(imageData as CFData, nil) else { return nil }
            let options = [kCGImageSourceShouldCacheImmediately: true] as CFDictionary
            return CGImageSourceCreateImageAtIndex(source, 0, options)
        } catch {
            return nil
        }
    }

    private func emit(_ output: Output) {
        guard let data = try? JSONEncoder().encode(output),
              let line = String(data: data, encoding: .utf8) else { return }
        print(line)
        fflush(stdout)
    }

    deinit {
        if let eventSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), eventSource, .commonModes)
        }
        if let eventTap {
            CFMachPortInvalidate(eventTap)
        }
    }
}

_ = NSApplication.shared
let service = HoverOCR()
service.start()
RunLoop.main.run()
