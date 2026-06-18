import AppKit
import Foundation

struct XLockStatus: Decodable {
  let ok: Bool
  let data: XLockState
}

struct XLockState: Decodable {
  let locked: Bool
  let mode: String
  let twitterAllowed: Bool
  let sessionSource: String
  let elapsedSeconds: Int
  let lastHeartbeatAt: String?
  let lastHeartbeatUrl: String?
}

@MainActor
final class XLockMenuBarApp: NSObject, NSApplicationDelegate {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private let statusMenuItem = NSMenuItem(title: "Starting XLock...", action: nil, keyEquivalent: "")
  private let heartbeatMenuItem = NSMenuItem(title: "Extension: checking...", action: nil, keyEquivalent: "")
  private let lockUnlockMenuItem = NSMenuItem(title: "Lock XLock", action: #selector(toggleLocked), keyEquivalent: "l")
  private let serviceURL = URL(string: "http://localhost:47831")!
  private let projectRoot: URL
  private var pollTimer: Timer?
  private var latestState: XLockState?

  override init() {
    self.projectRoot = XLockMenuBarApp.findProjectRoot()
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureStatusItem()
    configureMenu()
    launchEngine()
    refreshStatus()
    pollTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
      Task { @MainActor in
        self?.refreshStatus()
      }
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    pollTimer?.invalidate()
  }

  private static func findProjectRoot() -> URL {
    let current = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
    var candidates = [
      current,
      executable,
      executable.deletingLastPathComponent().deletingLastPathComponent(),
      executable.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    ]

    if let resourceURL = Bundle.main.resourceURL {
      candidates.insert(resourceURL.appendingPathComponent("XLockEngine"), at: 0)
    }

    for candidate in candidates {
      if FileManager.default.fileExists(atPath: candidate.appendingPathComponent("package.json").path),
         FileManager.default.fileExists(atPath: candidate.appendingPathComponent("service.mjs").path) {
        return candidate
      }
    }

    return current
  }

  private func configureStatusItem() {
    statusItem.button?.title = "XLock"
    statusItem.button?.font = .systemFont(ofSize: 13, weight: .semibold)
    statusItem.menu = menu
  }

  private func configureMenu() {
    statusMenuItem.isEnabled = false
    heartbeatMenuItem.isEnabled = false
    menu.addItem(statusMenuItem)
    menu.addItem(heartbeatMenuItem)
    menu.addItem(.separator())
    menu.addItem(lockUnlockMenuItem)
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Open X", action: #selector(openX), keyEquivalent: "x"))
    menu.addItem(NSMenuItem(title: "Block Now", action: #selector(blockNow), keyEquivalent: "b"))
    menu.addItem(NSMenuItem(title: "Back to Codex", action: #selector(backToCodex), keyEquivalent: "c"))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Open Dashboard", action: #selector(openDashboard), keyEquivalent: "d"))
    menu.addItem(NSMenuItem(title: "Open Extension Folder", action: #selector(openExtensionFolder), keyEquivalent: "e"))
    menu.addItem(NSMenuItem(title: "Install/Repair Codex Hooks", action: #selector(installHooks), keyEquivalent: "h"))
    menu.addItem(NSMenuItem(title: "Run Health Check", action: #selector(runHealthCheck), keyEquivalent: "r"))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Quit XLock", action: #selector(quit), keyEquivalent: "q"))
  }

  private func launchEngine() {
    runShell("npm run launch", showsAlertOnFailure: false)
  }

  private func refreshStatus() {
    let url = serviceURL.appendingPathComponent("status")
    URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
      guard let self else { return }
      Task { @MainActor in
        if error != nil {
          self.latestState = nil
          self.statusMenuItem.title = "Service: not running"
          self.heartbeatMenuItem.title = "Extension: unknown"
          self.statusItem.button?.title = "XLock: Off"
          return
        }

        guard let data,
              let payload = try? JSONDecoder().decode(XLockStatus.self, from: data),
              payload.ok
        else {
          self.statusMenuItem.title = "Service: invalid response"
          self.statusItem.button?.title = "XLock: ?"
          return
        }

        self.latestState = payload.data
        self.render(state: payload.data)
      }
    }.resume()
  }

  private func render(state: XLockState) {
    if let heartbeat = state.lastHeartbeatAt, state.lastHeartbeatUrl != nil {
      heartbeatMenuItem.title = "Extension: connected (\(shortTime(heartbeat)))"
    } else {
      heartbeatMenuItem.title = "Extension: waiting for X tab"
    }

    if !state.locked {
      statusItem.button?.title = "XLock: Unlocked"
      statusMenuItem.title = "XLock is unlocked"
      lockUnlockMenuItem.title = "Lock XLock"
      return
    }

    let lockText = state.twitterAllowed ? "Unlocked" : "Locked"
    statusItem.button?.title = state.twitterAllowed ? "XLock: Unlocked" : "XLock: Locked"
    statusMenuItem.title = "X is \(lockText) • \(state.mode) • \(state.elapsedSeconds)s"
    lockUnlockMenuItem.title = "Unlock XLock"
  }

  private func shortTime(_ isoDate: String) -> String {
    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: isoDate) else { return "recently" }
    return date.formatted(date: .omitted, time: .shortened)
  }

  @objc private func openX() {
    post("/focus/twitter")
  }

  @objc private func toggleLocked() {
    let path = latestState?.locked == true ? "/gate/unlock" : "/gate/lock"
    post(path)
  }

  @objc private func blockNow() {
    post("/session/end")
  }

  @objc private func backToCodex() {
    post("/focus/codex")
  }

  @objc private func openDashboard() {
    NSWorkspace.shared.open(serviceURL)
  }

  @objc private func openExtensionFolder() {
    NSWorkspace.shared.open(projectRoot.appendingPathComponent("extension"))
  }

  @objc private func installHooks() {
    runShell("npm run hook-install && npm run watch-hooks", successMessage: "Codex hooks installed. Open /hooks in Codex if trust is requested.")
  }

  @objc private func runHealthCheck() {
    runShell("npm run completion", successMessage: "Health check completed. See Terminal output logs in artifacts if needed.")
    refreshStatus()
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }

  private func post(_ path: String) {
    var request = URLRequest(url: serviceURL.appendingPathComponent(path))
    request.httpMethod = "POST"
    URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
      Task { @MainActor in
        self?.refreshStatus()
      }
    }.resume()
  }

  private func runShell(_ command: String, successMessage: String? = nil, showsAlertOnFailure: Bool = true) {
    DispatchQueue.global(qos: .utility).async { [projectRoot] in
      let process = Process()
      process.executableURL = URL(fileURLWithPath: "/bin/zsh")
      process.arguments = ["-lc", command]
      process.currentDirectoryURL = projectRoot

      let outputPipe = Pipe()
      let errorPipe = Pipe()
      process.standardOutput = outputPipe
      process.standardError = errorPipe

      do {
        try process.run()
        process.waitUntilExit()
        _ = outputPipe.fileHandleForReading.readDataToEndOfFile()
        let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
        let errorText = String(data: errorData, encoding: .utf8) ?? ""
        Task { @MainActor in
          if process.terminationStatus == 0 {
            if let successMessage {
              self.showAlert(title: "XLock", message: successMessage)
            }
            self.refreshStatus()
          } else if showsAlertOnFailure {
            self.showAlert(title: "XLock command failed", message: errorText.isEmpty ? "Exit code \(process.terminationStatus)" : errorText)
          }
        }
      } catch {
        Task { @MainActor in
          if showsAlertOnFailure {
            self.showAlert(title: "XLock command failed", message: error.localizedDescription)
          }
        }
      }
    }
  }

  private func showAlert(title: String, message: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.alertStyle = .informational
    alert.runModal()
  }
}

let app = NSApplication.shared
let delegate = XLockMenuBarApp()
app.delegate = delegate
app.run()
