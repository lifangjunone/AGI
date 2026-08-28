@preconcurrency import AppKit
import ApplicationServices
import Foundation

struct Request: Decodable {
    let id: String
    let method: String
    let params: [String: String]?
}

struct Response: Encodable {
    let id: String
    let ok: Bool
    let durationMs: Int
    let result: [String: String]?
    let error: ProtocolError?
}

struct ProtocolError: Encodable {
    let code: String
    let message: String
    let recoverable: Bool
}

struct WindowContext {
    let element: AXUIElement
    let frame: CGRect
    let displayIndex: Int
}

let encoder = JSONEncoder()

while let line = readLine() {
    let startedAt = Date()
    do {
        let request = try JSONDecoder().decode(Request.self, from: Data(line.utf8))
        let result: [String: String]

        switch request.method {
        case "permission.check":
            result = [
                "accessibility": AXIsProcessTrusted() ? "granted" : "missing",
                "screenRecording": "requires-runtime-check"
            ]
        case "permission.request":
            let options = [
                "AXTrustedCheckOptionPrompt": true
            ] as CFDictionary
            result = [
                "accessibility": AXIsProcessTrustedWithOptions(options) ? "granted" : "missing",
                "settingsUrl": "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            ]
        case "app.focus":
            guard let bundleId = request.params?["bundleId"] else {
                throw SidecarError.invalidParams
            }
            let application = try focusApplication(
                bundleId: bundleId,
                workingDirectory: request.params?["workingDirectory"]
            )
            result = [
                "bundleId": bundleId,
                "pid": String(application.processIdentifier),
                "status": "focused"
            ]
        case "app.inspect":
            guard let bundleId = request.params?["bundleId"] else {
                throw SidecarError.invalidParams
            }
            result = inspectApplication(
                bundleId: bundleId,
                workingDirectory: request.params?["workingDirectory"]
            )
        case "app.move-window":
            guard
                let bundleId = request.params?["bundleId"],
                let indexValue = request.params?["displayIndex"],
                let requestedIndex = Int(indexValue)
            else {
                throw SidecarError.invalidParams
            }
            let application = try focusApplication(
                bundleId: bundleId,
                workingDirectory: request.params?["workingDirectory"]
            )
            let root = AXUIElementCreateApplication(application.processIdentifier)
            let moved = try moveTargetWindow(
                applicationRoot: root,
                workingDirectory: request.params?["workingDirectory"],
                displayIndex: requestedIndex
            )
            result = [
                "bundleId": bundleId,
                "status": "moved",
                "windowDisplay": String(moved.displayIndex),
                "windowFrame": frameDescription(moved.frame)
            ]
        case "ui.snapshot":
            guard let bundleId = request.params?["bundleId"] else {
                throw SidecarError.invalidParams
            }
            let application = try focusApplication(
                bundleId: bundleId,
                workingDirectory: request.params?["workingDirectory"]
            )
            let root = AXUIElementCreateApplication(application.processIdentifier)
            let nodes = descendants(of: root, limit: 5_000)
            let context = try? targetWindowContext(
                applicationRoot: root,
                workingDirectory: request.params?["workingDirectory"]
            )
            let meaningfulNodes = nodes.filter {
                let role = stringAttribute($0, kAXRoleAttribute) ?? ""
                let interactive = [
                    kAXButtonRole as String,
                    kAXTextAreaRole as String,
                    kAXTextFieldRole as String,
                    kAXPopUpButtonRole as String,
                    kAXRadioButtonRole as String
                ].contains(role)
                return !role.hasPrefix("AXMenu") && (interactive || !searchableLabel($0).isEmpty)
            }
            result = [
                "bundleId": bundleId,
                "nodeCount": String(nodes.count),
                "nodes": meaningfulNodes.prefix(800).map(nodeSummary).joined(separator: "\n"),
                "displayCount": String(activeDisplayBounds().count),
                "windowDisplay": context.map { String($0.displayIndex) } ?? "-1",
                "windowFrame": context.map { frameDescription($0.frame) } ?? "unknown"
            ]
        case "ui.press":
            guard
                let bundleId = request.params?["bundleId"],
                let label = request.params?["label"]
            else {
                throw SidecarError.invalidParams
            }
            let application = try focusApplication(
                bundleId: bundleId,
                workingDirectory: request.params?["workingDirectory"]
            )
            let root = AXUIElementCreateApplication(application.processIdentifier)
            let context = try focusTargetWindow(
                applicationRoot: root,
                workingDirectory: request.params?["workingDirectory"]
            )
            let method = clickControl(
                root: context.element,
                labels: [label],
                fallback: .zero,
                expectedFrame: context.frame
            )
            result = [
                "status": "pressed",
                "method": method,
                "label": label,
                "windowDisplay": String(context.displayIndex),
                "windowFrame": frameDescription(context.frame)
            ]
        case "ui.click-point":
            guard
                let bundleId = request.params?["bundleId"],
                let xValue = request.params?["x"],
                let yValue = request.params?["y"],
                let x = Double(xValue),
                let y = Double(yValue)
            else {
                throw SidecarError.invalidParams
            }
            let application = try focusApplication(
                bundleId: bundleId,
                workingDirectory: request.params?["workingDirectory"]
            )
            let root = AXUIElementCreateApplication(application.processIdentifier)
            let context = try focusTargetWindow(
                applicationRoot: root,
                workingDirectory: request.params?["workingDirectory"]
            )
            let coordinateSpace = request.params?["coordinateSpace"] ?? "global"
            let point = coordinateSpace == "window_normalized"
                ? windowRelativePoint(context.frame, x: x, y: y)
                : CGPoint(x: x, y: y)
            guard postClick(point, expectedFrame: context.frame) else {
                throw SidecarError.unsafeClickPoint(frameDescription(
                    CGRect(origin: point, size: .zero)
                ))
            }
            result = [
                "status": "clicked",
                "x": String(describing: point.x),
                "y": String(describing: point.y),
                "coordinateSpace": coordinateSpace,
                "windowDisplay": String(context.displayIndex),
                "windowFrame": frameDescription(context.frame)
            ]
        case "chat.submit":
            guard
                let bundleId = request.params?["bundleId"],
                let prompt = request.params?["prompt"],
                !prompt.isEmpty
            else {
                throw SidecarError.invalidParams
            }
            result = try submitChat(
                bundleId: bundleId,
                prompt: prompt,
                sourceDocument: request.params?["sourceDocument"],
                workingDirectory: request.params?["workingDirectory"],
                workflow: request.params?["workflow"] ?? "chat"
            )
        default:
            throw SidecarError.unsupportedMethod(request.method)
        }

        write(Response(
            id: request.id,
            ok: true,
            durationMs: Int(Date().timeIntervalSince(startedAt) * 1000),
            result: result,
            error: nil
        ))
    } catch let error as SidecarError {
        write(Response(
            id: requestId(from: line),
            ok: false,
            durationMs: Int(Date().timeIntervalSince(startedAt) * 1000),
            result: nil,
            error: ProtocolError(
                code: error.code,
                message: error.localizedDescription,
                recoverable: error.recoverable
            )
        ))
    } catch {
        write(Response(
            id: requestId(from: line),
            ok: false,
            durationMs: Int(Date().timeIntervalSince(startedAt) * 1000),
            result: nil,
            error: ProtocolError(code: "request_failed", message: error.localizedDescription, recoverable: true)
        ))
    }
}

enum SidecarError: LocalizedError {
    case invalidParams
    case unsupportedMethod(String)
    case accessibilityMissing
    case appNotRunning(String)
    case sessionLocked
    case noWindow(String)
    case inputNotFound
    case inputNotFocusable
    case clipboardFailed
    case sendNotConfirmed
    case unsafeClickPoint(String)
    case displayNotFound(Int)
    case windowMoveFailed(String)
    case workflowStep(String)

    var errorDescription: String? {
        switch self {
        case .invalidParams: "缺少必要参数"
        case .unsupportedMethod(let method): "暂不支持方法 \(method)"
        case .accessibilityMissing:
            "DeliveryPilot 缺少“辅助功能”权限，请在系统设置的隐私与安全性中允许后重试"
        case .appNotRunning(let bundleId): "未找到正在运行的应用 \(bundleId)"
        case .sessionLocked: "macOS 屏幕已锁定；解锁后 DeliveryPilot 将继续操作现有 Trae 窗口"
        case .noWindow(let bundleId): "应用 \(bundleId) 尚未创建可访问窗口"
        case .inputNotFound: "未在 Trae 当前窗口找到可编辑的聊天输入框"
        case .inputNotFocusable: "找到聊天输入框，但无法将键盘焦点移入"
        case .clipboardFailed: "无法写入系统剪贴板"
        case .sendNotConfirmed: "已输入任务，但 Trae 界面没有确认发送；任务内容仍保留在输入框中"
        case .unsafeClickPoint(let point): "点击坐标 \(point) 不在目标窗口或活动显示器内"
        case .displayNotFound(let index): "未找到编号为 \(index) 的活动显示器"
        case .windowMoveFailed(let frame): "Trae 窗口未能移动到目标显示器，当前窗口为 \(frame)"
        case .workflowStep(let message): message
        }
    }

    var code: String {
        switch self {
        case .invalidParams: "invalid_params"
        case .unsupportedMethod: "unsupported_method"
        case .accessibilityMissing: "accessibility_missing"
        case .appNotRunning: "app_not_running"
        case .sessionLocked: "session_locked"
        case .noWindow: "window_not_found"
        case .inputNotFound: "chat_input_not_found"
        case .inputNotFocusable: "chat_input_not_focusable"
        case .clipboardFailed: "clipboard_failed"
        case .sendNotConfirmed: "send_not_confirmed"
        case .unsafeClickPoint: "unsafe_click_point"
        case .displayNotFound: "display_not_found"
        case .windowMoveFailed: "window_move_failed"
        case .workflowStep: "workflow_step_failed"
        }
    }

    var recoverable: Bool {
        switch self {
        case .invalidParams, .unsupportedMethod:
            false
        default:
            true
        }
    }
}

func focusApplication(
    bundleId: String,
    workingDirectory: String? = nil
) throws -> NSRunningApplication {
    guard AXIsProcessTrusted() else {
        throw SidecarError.accessibilityMissing
    }
    if isScreenLocked() {
        throw SidecarError.sessionLocked
    }
    let applications = NSRunningApplication
        .runningApplications(withBundleIdentifier: bundleId)
        .filter { !$0.isTerminated }
    guard !applications.isEmpty else {
        throw SidecarError.appNotRunning(bundleId)
    }

    let displays = activeDisplayBounds()
    let ranked = applications.map { application -> (NSRunningApplication, Int) in
        let root = AXUIElementCreateApplication(application.processIdentifier)
        enableElectronAccessibility(root)
        let windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
        let score = windows.map {
            windowMatchScore(
                $0,
                applicationRoot: root,
                workingDirectory: workingDirectory,
                displays: displays
            )
        }.max() ?? Int.min
        return (application, score)
    }.sorted { $0.1 > $1.1 }

    for (application, score) in ranked where score > Int.min {
        application.unhide()
        application.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        let root = AXUIElementCreateApplication(application.processIdentifier)
        enableElectronAccessibility(root)
        Thread.sleep(forTimeInterval: 0.5)
        if (try? focusTargetWindow(
                applicationRoot: root,
                workingDirectory: workingDirectory
            )) != nil {
            return application
        }
    }
    if isScreenLocked() {
        throw SidecarError.sessionLocked
    }
    throw SidecarError.noWindow(bundleId)
}

func inspectApplication(bundleId: String, workingDirectory: String?) -> [String: String] {
    let applications = NSRunningApplication
        .runningApplications(withBundleIdentifier: bundleId)
        .filter { !$0.isTerminated }
    guard !applications.isEmpty else {
        return [
            "bundleId": bundleId,
            "running": "false",
            "windowAvailable": "false",
            "busy": "false",
            "taskMatch": "false",
            "pid": "0",
            "nodeCount": "0",
            "screenLocked": isScreenLocked() ? "true" : "false"
        ]
    }
    let displays = activeDisplayBounds()
    let application = applications.max {
        let leftRoot = AXUIElementCreateApplication($0.processIdentifier)
        let rightRoot = AXUIElementCreateApplication($1.processIdentifier)
        let leftScore = (attribute(leftRoot, kAXWindowsAttribute) as? [AXUIElement] ?? [])
            .map {
                windowMatchScore(
                    $0,
                    applicationRoot: leftRoot,
                    workingDirectory: workingDirectory,
                    displays: displays
                )
            }.max() ?? Int.min
        let rightScore = (attribute(rightRoot, kAXWindowsAttribute) as? [AXUIElement] ?? [])
            .map {
                windowMatchScore(
                    $0,
                    applicationRoot: rightRoot,
                    workingDirectory: workingDirectory,
                    displays: displays
                )
            }.max() ?? Int.min
        return leftScore < rightScore
    }!
    let root = AXUIElementCreateApplication(application.processIdentifier)
    enableElectronAccessibility(root)
    let windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
    let nodes = windows.flatMap { descendants(of: $0, limit: 3_000) }
    let context = try? targetWindowContext(
        applicationRoot: root,
        workingDirectory: workingDirectory
    )
    let busy = nodes.contains(where: isStopButton)
    let expectedWorkspace: String?
    if let workingDirectory {
        let name = URL(fileURLWithPath: workingDirectory).lastPathComponent.lowercased()
        expectedWorkspace = name.isEmpty ? nil : name
    } else {
        expectedWorkspace = nil
    }
    let taskMatch = expectedWorkspace.map { expected in
        nodes.contains {
            searchableLabel($0).contains(expected)
                || (stringAttribute($0, kAXValueAttribute) ?? "").lowercased().contains(expected)
        }
    } ?? false
    return [
        "bundleId": bundleId,
        "running": "true",
        "windowAvailable": windows.isEmpty ? "false" : "true",
        "busy": busy ? "true" : "false",
        "taskMatch": taskMatch ? "true" : "false",
        "frontmost": application.isActive ? "true" : "false",
        "pid": String(application.processIdentifier),
        "nodeCount": String(nodes.count),
        "screenLocked": isScreenLocked() ? "true" : "false",
        "displayCount": String(activeDisplayBounds().count),
        "windowDisplay": context.map { String($0.displayIndex) } ?? "-1",
        "windowFrame": context.map { frameDescription($0.frame) } ?? "unknown"
    ]
}

func isScreenLocked() -> Bool {
    guard let session = CGSessionCopyCurrentDictionary() as? [String: Any] else {
        return false
    }
    return (session["CGSSessionScreenIsLocked"] as? NSNumber)?.boolValue ?? false
}

func enableElectronAccessibility(_ root: AXUIElement) {
    _ = AXUIElementSetAttributeValue(
        root,
        "AXManualAccessibility" as CFString,
        kCFBooleanTrue
    )
    _ = AXUIElementSetAttributeValue(
        root,
        "AXEnhancedUserInterface" as CFString,
        kCFBooleanTrue
    )
}

func submitChat(
    bundleId: String,
    prompt: String,
    sourceDocument: String?,
    workingDirectory: String?,
    workflow: String
) throws -> [String: String] {
    let application = try focusApplication(
        bundleId: bundleId,
        workingDirectory: workingDirectory
    )
    let applicationRoot = AXUIElementCreateApplication(application.processIdentifier)
    var context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    var steps: [String] = []

    if workflow == "traework" {
        guard let workingDirectory, FileManager.default.fileExists(atPath: workingDirectory) else {
            throw SidecarError.workflowStep("步骤 3 失败：Trae Work 任务目录不存在")
        }
        let workMethod = clickControl(
            root: context.element,
            labels: ["solo", "work"],
            fallback: .zero,
            expectedFrame: context.frame
        )
        guard workMethod != "未找到可安全操作的目标控件" else {
            throw SidecarError.workflowStep("步骤 1 失败：未找到 Trae Work / SOLO 入口")
        }
        steps.append("1. 已进入 Work（\(workMethod)）")
        Thread.sleep(forTimeInterval: 0.5)

        context = try waitForTargetWindow(
            applicationRoot: applicationRoot,
            workingDirectory: nil
        )
        let newTaskMethod = try openNewTask(
            applicationRoot: applicationRoot,
            context: context
        )
        steps.append("2. 已点击 New task（\(newTaskMethod)）")

        try selectWorkingDirectory(
            bundleId: bundleId,
            applicationRoot: applicationRoot,
            path: workingDirectory
        )
        steps.append("3. 已选择任务目录 \(workingDirectory)")

        let modelMethod = try selectModel(
            applicationRoot: applicationRoot,
            workingDirectory: workingDirectory,
            model: "GPT-5.5"
        )
        steps.append("4. 模型已确认 GPT-5.5（\(modelMethod)）")
    } else if bundleId == "cn.trae.app" {
        let codeMethod = clickControl(
            root: context.element,
            labels: ["ide"],
            fallback: .zero,
            expectedFrame: context.frame
        )
        guard codeMethod != "未找到可安全操作的目标控件" else {
            throw SidecarError.workflowStep("未找到 Trae Code / IDE 入口")
        }
        steps.append("已进入 Trae Code（\(codeMethod)）")
        Thread.sleep(forTimeInterval: 0.5)
    }

    context = try waitForTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    let allNodes = descendants(of: context.element, limit: 2_500)
    let input = chatInput(from: allNodes, frame: context.frame)
    if input == nil {
        postClick(
            normalizedPoint(context.frame, x: 0.60, y: 0.395),
            expectedFrame: context.frame
        )
        Thread.sleep(forTimeInterval: 0.3)
    }
    context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    guard let input = input
        ?? chatInput(
            from: descendants(of: context.element, limit: 2_500),
            frame: context.frame
        )
    else {
        throw SidecarError.inputNotFound
    }

    let focused = AXUIElementSetAttributeValue(
        input,
        kAXFocusedAttribute as CFString,
        kCFBooleanTrue
    ) == .success
    if !focused {
        _ = AXUIElementPerformAction(input, kAXPressAction as CFString)
    }
    Thread.sleep(forTimeInterval: 0.2)
    guard isFocused(input) || focused else {
        throw SidecarError.inputNotFocusable
    }
    postKey(code: 0, flags: .maskCommand)
    postKey(code: 51)
    Thread.sleep(forTimeInterval: 0.2)

    let attachmentStatus = workflow == "traework"
        ? "workspace_selected"
        : sourceDocument.map { _ in "workspace_input" } ?? "not_requested"

    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    guard pasteboard.setString(prompt, forType: .string) else {
        throw SidecarError.clipboardFailed
    }
    postKey(code: 9, flags: .maskCommand)
    Thread.sleep(forTimeInterval: 0.5)
    steps.append("5. 已输入任务内容")

    context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    let nodesBeforeSend = descendants(of: context.element, limit: 2_500)
    let currentInput = chatInput(from: nodesBeforeSend, frame: context.frame) ?? input
    let valueBeforeSend = stringAttribute(currentInput, kAXValueAttribute) ?? ""
    let sendButton = nodesBeforeSend.first(where: isSendButton)
        ?? nearestSendControl(to: currentInput, in: nodesBeforeSend)
    var sendAction = "enter"
    if workflow == "traework", let sendButton, let center = elementCenter(sendButton) {
        _ = try focusApplication(
            bundleId: bundleId,
            workingDirectory: workingDirectory
        )
        context = try focusTargetWindow(
            applicationRoot: applicationRoot,
            workingDirectory: workingDirectory
        )
        Thread.sleep(forTimeInterval: 0.2)
        postClick(center, expectedFrame: context.frame)
        sendAction = "focused_control_position"
    } else if let sendButton,
       AXUIElementPerformAction(sendButton, kAXPressAction as CFString) == .success {
        sendAction = "button"
    } else if let sendButton, let center = elementCenter(sendButton) {
        postClick(center, expectedFrame: context.frame)
        sendAction = "control_position"
    } else {
        if workflow == "traework" {
            postClick(
                normalizedPoint(context.frame, x: 0.86, y: 0.463),
                expectedFrame: context.frame
            )
            sendAction = "coordinate_button"
        } else {
            postKey(code: 36)
        }
    }
    Thread.sleep(forTimeInterval: 1.4)

    context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    let refreshedNodes = descendants(of: context.element, limit: 2_500)
    let refreshedInput = chatInput(from: refreshedNodes, frame: context.frame) ?? currentInput
    let valueAfterSend = stringAttribute(refreshedInput, kAXValueAttribute) ?? ""
    let hasStopControl = refreshedNodes.contains(where: isStopButton)
    let inputCleared = !valueBeforeSend.isEmpty
        && (valueAfterSend.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines).isEmpty
            || !valueAfterSend.contains(String(prompt.prefix(24))))
    guard inputCleared || hasStopControl else {
        throw SidecarError.sendNotConfirmed
    }
    steps.append(
        workflow == "traework"
            ? "6. 已点击发送并确认 Trae Work 开始处理"
            : "已点击发送并确认 Trae Code 开始处理"
    )

    return [
        "bundleId": bundleId,
        "pid": String(application.processIdentifier),
        "input": nodeSummary(input),
        "attachment": attachmentStatus,
        "sendAction": sendAction,
        "sendConfirmed": "true",
        "confirmation": inputCleared ? "input_cleared" : "stop_control_visible",
        "displayCount": String(activeDisplayBounds().count),
        "windowDisplay": String(context.displayIndex),
        "windowFrame": frameDescription(context.frame),
        "steps": steps.joined(separator: "\n")
    ]
}

func openNewTask(
    applicationRoot: AXUIElement,
    context: WindowContext
) throws -> String {
    let candidates = descendants(of: context.element, limit: 2_500)
        .filter { element in
            let label = searchableLabel(element)
            guard (label.contains("new task") || label.contains("新建任务")),
                  let center = elementCenter(element),
                  let size = elementSize(element)
            else {
                return false
            }
            return center.x < context.frame.minX + context.frame.width * 0.25
                && center.y < context.frame.minY + context.frame.height * 0.35
                && size.width > 30
                && size.height > 10
        }
        .sorted {
            (elementCenter($0)?.y ?? .greatestFiniteMagnitude)
                < (elementCenter($1)?.y ?? .greatestFiniteMagnitude)
        }
    guard let newTask = candidates.first, let center = elementCenter(newTask) else {
        throw SidecarError.workflowStep("步骤 2 失败：未找到左上角 New task")
    }
    postClick(center, expectedFrame: context.frame)
    Thread.sleep(forTimeInterval: 1.0)

    let refreshed = try targetWindowContext(
        applicationRoot: applicationRoot,
        workingDirectory: nil
    )
    let composerNodes = descendants(of: refreshed.element, limit: 2_500)
    let reachedComposer = composerNodes.contains {
        let label = searchableLabel($0)
        return label.contains("select a folder") || label.contains("选择文件夹")
    } || (
        composerNodes.contains {
            stringAttribute($0, kAXRoleAttribute) == (kAXComboBoxRole as String)
        }
            && composerNodes.contains {
                stringAttribute($0, kAXRoleAttribute) == (kAXButtonRole as String)
                    && searchableLabel($0).contains("local")
            }
    )
    guard reachedComposer else {
        throw SidecarError.workflowStep("步骤 2 失败：点击 New task 后未进入新任务页")
    }
    return "AXPosition"
}

func selectWorkingDirectory(
    bundleId: String,
    applicationRoot: AXUIElement,
    path: String
) throws {
    var context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: nil
    )
    let expectedName = URL(fileURLWithPath: path).lastPathComponent.lowercased()
    let alreadySelected = descendants(of: context.element, limit: 2_500).contains {
        let role = stringAttribute($0, kAXRoleAttribute) ?? ""
        return role == (kAXButtonRole as String)
            && searchableLabel($0).contains(expectedName)
    }
    if alreadySelected {
        return
    }

    postClick(
        normalizedPoint(context.frame, x: 0.44, y: 0.53),
        expectedFrame: context.frame
    )
    Thread.sleep(forTimeInterval: 0.6)

    if !hasOpenSheet(applicationRoot) {
        context = try focusTargetWindow(
            applicationRoot: applicationRoot,
            workingDirectory: nil
        )
        _ = clickControl(
            root: context.element,
            labels: ["select a folder", "选择文件夹"],
            fallback: normalizedPoint(context.frame, x: 0.46, y: 0.82),
            expectedFrame: context.frame
        )
        Thread.sleep(forTimeInterval: 1.0)
    }
    guard hasOpenSheet(applicationRoot) else {
        throw SidecarError.workflowStep("步骤 3 失败：未打开系统“选择项目文件夹”窗口")
    }

    _ = try focusApplication(bundleId: bundleId, workingDirectory: path)
    postKey(code: 5, flags: [.maskCommand, .maskShift])
    Thread.sleep(forTimeInterval: 0.8)
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    guard pasteboard.setString(path, forType: .string) else {
        throw SidecarError.clipboardFailed
    }
    _ = try focusApplication(bundleId: bundleId, workingDirectory: path)
    postKey(code: 9, flags: .maskCommand)
    Thread.sleep(forTimeInterval: 0.3)
    postKey(code: 36)
    Thread.sleep(forTimeInterval: 1.2)
    _ = try focusApplication(bundleId: bundleId, workingDirectory: path)
    postKey(code: 36)
    Thread.sleep(forTimeInterval: 1.5)

    context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: path
    )
    let selected = descendants(of: context.element, limit: 2_500).contains {
        searchableLabel($0).contains(expectedName)
            || (stringAttribute($0, kAXValueAttribute) ?? "").lowercased().contains(expectedName)
    }
    guard selected else {
        throw SidecarError.workflowStep("步骤 3 失败：Trae Work 未切换到目标目录 \(path)")
    }
}

func hasOpenSheet(_ applicationRoot: AXUIElement) -> Bool {
    descendants(of: applicationRoot, limit: 2_500).contains {
        stringAttribute($0, kAXRoleAttribute) == (kAXSheetRole as String)
    }
}

func selectModel(
    applicationRoot: AXUIElement,
    workingDirectory: String,
    model: String
) throws -> String {
    let desired = model.lowercased()
    var context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    guard let combo = descendants(of: context.element, limit: 2_500).first(where: {
        stringAttribute($0, kAXRoleAttribute) == (kAXComboBoxRole as String)
            && ((stringAttribute($0, kAXValueAttribute) ?? "").lowercased().contains("gpt")
                || searchableLabel($0).contains("gpt"))
    }) else {
        throw SidecarError.workflowStep("步骤 4 失败：未找到 Trae Work 模型选择器")
    }

    if (stringAttribute(combo, kAXValueAttribute) ?? "").lowercased() == desired {
        return "AXValue"
    }

    if AXUIElementPerformAction(combo, kAXPressAction as CFString) != .success,
       let center = elementCenter(combo) {
        postClick(center, expectedFrame: context.frame)
    }
    Thread.sleep(forTimeInterval: 0.6)

    let option = descendants(of: applicationRoot, limit: 4_000).first {
        let label = searchableLabel($0)
        return label == desired || label.contains(desired)
    }
    guard let option else {
        throw SidecarError.workflowStep("步骤 4 失败：模型列表中没有 \(model)")
    }
    if AXUIElementPerformAction(option, kAXPressAction as CFString) != .success {
        guard let center = elementCenter(option) else {
            throw SidecarError.workflowStep("步骤 4 失败：无法选择 \(model)")
        }
        postClick(center)
    }
    Thread.sleep(forTimeInterval: 0.6)

    context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    let refreshedCombo = descendants(of: context.element, limit: 2_500).first {
        stringAttribute($0, kAXRoleAttribute) == (kAXComboBoxRole as String)
            && ((stringAttribute($0, kAXValueAttribute) ?? "").lowercased().contains("gpt")
                || searchableLabel($0).contains("gpt"))
    }
    let actual = refreshedCombo
        .flatMap { stringAttribute($0, kAXValueAttribute) }
        .map { $0.lowercased() }
        ?? ""
    guard actual == desired else {
        throw SidecarError.workflowStep(
            "步骤 4 失败：模型仍为 \(actual.isEmpty ? "未知" : actual)，不是 \(model)"
        )
    }
    return "AXComboBox"
}

func clickControl(
    root: AXUIElement,
    labels: [String],
    fallback: CGPoint,
    expectedFrame: CGRect? = nil
) -> String {
    let normalized = labels.map { $0.lowercased() }
    let matches = descendants(of: root, limit: 2_500)
        .filter { element in
            let label = searchableLabel(element)
            return normalized.contains(where: { label == $0 || label.contains($0) })
        }
        .sorted { left, right in
            controlMatchScore(left, labels: normalized) > controlMatchScore(right, labels: normalized)
        }
    for element in matches {
        if let method = pressElementOrAncestor(element) {
            return method
        }
        if let point = elementCenter(element),
           postClick(point, expectedFrame: expectedFrame) {
            return "AXPosition"
        }
    }
    if fallback != .zero,
       postClick(fallback, expectedFrame: expectedFrame) {
        return "窗口坐标兜底"
    }
    return "未找到可安全操作的目标控件"
}

func pressElementOrAncestor(_ element: AXUIElement) -> String? {
    var candidate = element
    for depth in 0...4 {
        if AXUIElementPerformAction(candidate, kAXPressAction as CFString) == .success {
            return depth == 0 ? "AXPress" : "AXParentPress(\(depth))"
        }
        guard let parent = attribute(candidate, kAXParentAttribute) else {
            return nil
        }
        candidate = parent as! AXUIElement
    }
    return nil
}

func controlMatchScore(_ element: AXUIElement, labels: [String]) -> Int {
    let label = searchableLabel(element)
    let role = stringAttribute(element, kAXRoleAttribute) ?? ""
    var score = labels.contains(label) ? 100 : 20
    if role == (kAXButtonRole as String) || role == "AXLink" {
        score += 50
    }
    if elementSize(element) != nil {
        score += 10
    }
    return score
}

func activeDisplayBounds() -> [CGRect] {
    var count: UInt32 = 0
    guard CGGetActiveDisplayList(0, nil, &count) == .success, count > 0 else {
        return []
    }
    var displays = Array(repeating: CGDirectDisplayID(), count: Int(count))
    guard CGGetActiveDisplayList(count, &displays, &count) == .success else {
        return []
    }
    return displays.prefix(Int(count)).map(CGDisplayBounds)
}

func frameDescription(_ frame: CGRect) -> String {
    "\(Int(frame.minX)),\(Int(frame.minY)),\(Int(frame.width)),\(Int(frame.height))"
}

func displayIndex(for frame: CGRect, displays: [CGRect]) -> Int {
    overlappingDisplayIndex(for: frame, displays: displays)
}

func validWindowFrame(_ window: AXUIElement, displays: [CGRect]) -> CGRect? {
    guard
        let position = elementPosition(window),
        let size = elementSize(window),
        size.width >= 240,
        size.height >= 180
    else {
        return nil
    }
    let frame = CGRect(origin: position, size: size)
    guard displays.isEmpty || displays.contains(where: {
        $0.intersection(frame).width >= 80 && $0.intersection(frame).height >= 80
    }) else {
        return nil
    }
    return frame
}

func sameAXElement(_ left: AXUIElement, _ right: AnyObject?) -> Bool {
    guard let right else { return false }
    return CFEqual(left, right)
}

func windowMatchScore(
    _ window: AXUIElement,
    applicationRoot: AXUIElement,
    workingDirectory: String?,
    displays: [CGRect]
) -> Int {
    guard let frame = validWindowFrame(window, displays: displays) else {
        return Int.min
    }
    if (attribute(window, kAXMinimizedAttribute) as? Bool) == true {
        return Int.min
    }
    var score = Int(min(frame.width * frame.height / 10_000, 100))
    if sameAXElement(window, attribute(applicationRoot, kAXFocusedWindowAttribute)) {
        score += 240
    }
    if sameAXElement(window, attribute(applicationRoot, kAXMainWindowAttribute)) {
        score += 180
    }
    let title = [
        stringAttribute(window, kAXTitleAttribute),
        stringAttribute(window, kAXDescriptionAttribute)
    ].compactMap { $0 }.joined(separator: " ").lowercased()
    if !title.isEmpty {
        score += 15
    }
    if let workingDirectory {
        let workspaceName = URL(fileURLWithPath: workingDirectory)
            .lastPathComponent
            .lowercased()
        let workspacePath = workingDirectory.lowercased()
        if title.contains(workspaceName) || title.contains(workspacePath) {
            score += 1_000
        } else {
            let nodes = descendants(of: window, limit: 1_800)
            if nodes.contains(where: {
                let label = searchableLabel($0)
                return label.contains(workspaceName) || label.contains(workspacePath)
            }) {
                score += 900
            }
        }
    }
    return score
}

func targetWindowContext(
    applicationRoot: AXUIElement,
    workingDirectory: String?
) throws -> WindowContext {
    let displays = activeDisplayBounds()
    let windows = attribute(applicationRoot, kAXWindowsAttribute) as? [AXUIElement] ?? []
    guard let window = windows.max(by: {
        windowMatchScore(
            $0,
            applicationRoot: applicationRoot,
            workingDirectory: workingDirectory,
            displays: displays
        ) < windowMatchScore(
            $1,
            applicationRoot: applicationRoot,
            workingDirectory: workingDirectory,
            displays: displays
        )
    }),
    let frame = validWindowFrame(window, displays: displays)
    else {
        throw SidecarError.noWindow("Trae")
    }
    return WindowContext(
        element: window,
        frame: frame,
        displayIndex: displayIndex(for: frame, displays: displays)
    )
}

func focusTargetWindow(
    applicationRoot: AXUIElement,
    workingDirectory: String?
) throws -> WindowContext {
    var context = try targetWindowContext(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    _ = AXUIElementPerformAction(context.element, kAXRaiseAction as CFString)
    _ = AXUIElementSetAttributeValue(
        applicationRoot,
        kAXFocusedWindowAttribute as CFString,
        context.element
    )
    _ = AXUIElementSetAttributeValue(
        context.element,
        kAXMainAttribute as CFString,
        kCFBooleanTrue
    )
    Thread.sleep(forTimeInterval: 0.18)
    context = try targetWindowContext(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    return context
}

func waitForTargetWindow(
    applicationRoot: AXUIElement,
    workingDirectory: String?,
    timeout: TimeInterval = 5
) throws -> WindowContext {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
        if let context = try? focusTargetWindow(
            applicationRoot: applicationRoot,
            workingDirectory: workingDirectory
        ) {
            return context
        }
        if isScreenLocked() {
            throw SidecarError.sessionLocked
        }
        Thread.sleep(forTimeInterval: 0.2)
    } while Date() < deadline
    throw SidecarError.noWindow("Trae")
}

func setWindowFrame(_ window: AXUIElement, frame: CGRect) -> Bool {
    var position = frame.origin
    var size = frame.size
    guard
        let positionValue = AXValueCreate(.cgPoint, &position),
        let sizeValue = AXValueCreate(.cgSize, &size)
    else {
        return false
    }
    let sizeSet = AXUIElementSetAttributeValue(
        window,
        kAXSizeAttribute as CFString,
        sizeValue
    ) == .success
    Thread.sleep(forTimeInterval: 0.12)
    let positionSet = AXUIElementSetAttributeValue(
        window,
        kAXPositionAttribute as CFString,
        positionValue
    ) == .success
    return positionSet && sizeSet
}

func moveTargetWindow(
    applicationRoot: AXUIElement,
    workingDirectory: String?,
    displayIndex: Int
) throws -> WindowContext {
    let displays = activeDisplayBounds()
    guard displays.indices.contains(displayIndex) else {
        throw SidecarError.displayNotFound(displayIndex)
    }
    let context = try focusTargetWindow(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    let targetDisplay = displays[displayIndex]
    let padding: CGFloat = 36
    let targetFrame = targetDisplay.insetBy(dx: padding, dy: padding)
    guard setWindowFrame(context.element, frame: targetFrame) else {
        throw SidecarError.windowMoveFailed(frameDescription(context.frame))
    }
    _ = AXUIElementPerformAction(context.element, kAXRaiseAction as CFString)
    Thread.sleep(forTimeInterval: 0.8)
    let moved = try targetWindowContext(
        applicationRoot: applicationRoot,
        workingDirectory: workingDirectory
    )
    guard moved.displayIndex == displayIndex else {
        throw SidecarError.windowMoveFailed(frameDescription(moved.frame))
    }
    return moved
}

func activeWindow(_ applicationRoot: AXUIElement) -> AXUIElement? {
    try? targetWindowContext(
        applicationRoot: applicationRoot,
        workingDirectory: nil
    ).element
}

func mainWindowFrame(_ root: AXUIElement) throws -> CGRect {
    let displays = activeDisplayBounds()
    let role = stringAttribute(root, kAXRoleAttribute) ?? ""
    let window = role == (kAXWindowRole as String) ? root : activeWindow(root)
    guard let window, let frame = validWindowFrame(window, displays: displays) else {
        throw SidecarError.noWindow("Trae")
    }
    return frame
}

func normalizedPoint(_ frame: CGRect, x: CGFloat, y: CGFloat) -> CGPoint {
    windowRelativePoint(frame, x: x, y: y)
}

func descendants(of root: AXUIElement, limit: Int) -> [AXUIElement] {
    var result: [AXUIElement] = []
    var queue: [AXUIElement] = [root]
    var cursor = 0

    while cursor < queue.count, result.count < limit {
        let element = queue[cursor]
        cursor += 1
        result.append(element)
        let role = stringAttribute(element, kAXRoleAttribute) ?? ""
        if role.hasPrefix("AXMenu") {
            continue
        }
        if let children = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
            queue.append(contentsOf: children.filter {
                stringAttribute($0, kAXRoleAttribute) != (kAXApplicationRole as String)
            })
        }
    }
    return result
}

func chatInput(from nodes: [AXUIElement], frame: CGRect) -> AXUIElement? {
    nodes
        .compactMap { element -> (AXUIElement, Int)? in
            let role = stringAttribute(element, kAXRoleAttribute) ?? ""
            guard role == (kAXTextAreaRole as String) || role == (kAXTextFieldRole as String) else {
                return nil
            }
            var settable = DarwinBoolean(false)
            AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable)
            guard settable.boolValue else { return nil }

            let label = searchableLabel(element)
            let blocked = ["search", "搜索", "filter", "筛选", "command", "命令"]
                .contains(where: { label.contains($0) })
            guard !blocked else { return nil }

            var score = role == (kAXTextAreaRole as String) ? 50 : 20
            if ["chat", "message", "prompt", "ask", "agent", "对话", "消息", "提问", "输入"]
                .contains(where: { label.contains($0) }) {
                score += 100
            }
            if let size = elementSize(element) {
                guard size.width >= 250, size.height <= 240 else { return nil }
                if size.width > 300 { score += 30 }
                if size.height > 45 { score += 20 }
            }
            guard let center = elementCenter(element),
                  center.y > frame.minY + frame.height * 0.30
            else {
                return nil
            }
            if isFocused(element) { score += 40 }
            return (element, score)
        }
        .max(by: { $0.1 < $1.1 })?
        .0
}

func isSendButton(_ element: AXUIElement) -> Bool {
    guard stringAttribute(element, kAXRoleAttribute) == (kAXButtonRole as String) else {
        return false
    }
    let label = searchableLabel(element)
    return ["send", "submit", "发送", "提交", "运行"]
        .contains(where: { label == $0 || label.contains($0) })
}

func nearestSendControl(to input: AXUIElement, in nodes: [AXUIElement]) -> AXUIElement? {
    guard let inputCenter = elementCenter(input) else { return nil }
    return nodes
        .filter { element in
            let role = stringAttribute(element, kAXRoleAttribute) ?? ""
            guard [kAXButtonRole as String, kAXGroupRole as String].contains(role),
                  let size = elementSize(element),
                  let center = elementCenter(element)
            else {
                return false
            }
            return size.width >= 24
                && size.width <= 44
                && size.height >= 24
                && size.height <= 44
                && center.x > inputCenter.x
                && abs(center.y - inputCenter.y) < 100
        }
        .max {
            (elementCenter($0)?.x ?? 0) < (elementCenter($1)?.x ?? 0)
        }
}

func isStopButton(_ element: AXUIElement) -> Bool {
    guard stringAttribute(element, kAXRoleAttribute) == (kAXButtonRole as String) else {
        return false
    }
    let label = searchableLabel(element)
    return ["stop", "cancel", "停止", "终止生成"]
        .contains(where: { label == $0 || label.contains($0) })
}

func searchableLabel(_ element: AXUIElement) -> String {
    [
        stringAttribute(element, kAXTitleAttribute),
        stringAttribute(element, kAXDescriptionAttribute),
        stringAttribute(element, kAXHelpAttribute),
        stringAttribute(element, "AXPlaceholderValue"),
        stringAttribute(element, kAXValueAttribute)
    ]
    .compactMap { $0 }
    .joined(separator: " ")
    .lowercased()
}

func nodeSummary(_ element: AXUIElement) -> String {
    let role = stringAttribute(element, kAXRoleAttribute) ?? "unknown"
    let label = searchableLabel(element)
    let position = elementPosition(element)
        .map { "@\(Int($0.x)),\(Int($0.y))" }
        ?? "@?,?"
    let valueLength = stringAttribute(element, kAXValueAttribute)
        .map { " valueLength=\($0.count)" }
        ?? ""
    if let size = elementSize(element) {
        return "\(role) \(position) \(Int(size.width))x\(Int(size.height))\(valueLength) \(label)"
    }
    return "\(role) \(position)\(valueLength) \(label)"
}

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
        return nil
    }
    return value
}

func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
    attribute(element, name) as? String
}

func isFocused(_ element: AXUIElement) -> Bool {
    (attribute(element, kAXFocusedAttribute) as? Bool) == true
}

func elementSize(_ element: AXUIElement) -> CGSize? {
    guard let value = attribute(element, kAXSizeAttribute) else { return nil }
    let axValue = value as! AXValue
    var size = CGSize.zero
    guard AXValueGetValue(axValue, .cgSize, &size) else { return nil }
    return size
}

func elementPosition(_ element: AXUIElement) -> CGPoint? {
    guard let value = attribute(element, kAXPositionAttribute) else { return nil }
    let axValue = value as! AXValue
    var point = CGPoint.zero
    guard AXValueGetValue(axValue, .cgPoint, &point) else { return nil }
    return point
}

func elementCenter(_ element: AXUIElement) -> CGPoint? {
    guard let position = elementPosition(element), let size = elementSize(element) else {
        return nil
    }
    return CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2)
}

@discardableResult
func postClick(_ point: CGPoint, expectedFrame: CGRect? = nil) -> Bool {
    let displays = activeDisplayBounds()
    guard pointIsSafeForClick(
        point,
        expectedFrame: expectedFrame,
        displays: displays
    ) else {
        return false
    }
    let source = CGEventSource(stateID: .hidSystemState)
    let move = CGEvent(
        mouseEventSource: source,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    )
    let down = CGEvent(
        mouseEventSource: source,
        mouseType: .leftMouseDown,
        mouseCursorPosition: point,
        mouseButton: .left
    )
    let up = CGEvent(
        mouseEventSource: source,
        mouseType: .leftMouseUp,
        mouseCursorPosition: point,
        mouseButton: .left
    )
    move?.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.04)
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
    return down != nil && up != nil
}

func postKey(code: CGKeyCode, flags: CGEventFlags = []) {
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
    down?.flags = flags
    up?.flags = flags
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
}

func requestId(from line: String) -> String {
    guard
        let data = line.data(using: .utf8),
        let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let id = object["id"] as? String
    else { return "unknown" }
    return id
}

func write(_ response: Response) {
    guard let data = try? encoder.encode(response), let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write(Data("\(line)\n".utf8))
}
