import AppKit
import Foundation

@MainActor
final class XLockMenuBarApp: NSObject, NSApplicationDelegate {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()
  private let statusMenuItem = NSMenuItem(title: "Starting XLock...", action: nil, keyEquivalent: "")
  private let heartbeatMenuItem = NSMenuItem(title: "Extension: checking...", action: nil, keyEquivalent: "")
  private let lockUnlockMenuItem = NSMenuItem(title: "Lock XLock", action: #selector(toggleLocked), keyEquivalent: "l")
  private let serviceURL = URL(string: "http://localhost:47831")!
  private let projectRoot: URL
  private let appState: XLockAppState
  private let shellRunner: ShellRunner
  private var settingsController: SettingsWindowController?
  private var pollTimer: Timer?

  override init() {
    let projectRoot = ProjectRoot.find()
    let client = XLockClient(serviceURL: URL(string: "http://localhost:47831")!)
    self.projectRoot = projectRoot
    self.appState = XLockAppState(client: client)
    self.shellRunner = ShellRunner(projectRoot: projectRoot)
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureStatusItem()
    configureMenu()
    configureSettings()
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

    let settingsItem = NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ",")
    settingsItem.target = self
    menu.addItem(settingsItem)

    menu.addItem(NSMenuItem(title: "Open Extension Folder", action: #selector(openExtensionFolder), keyEquivalent: "e"))
    menu.addItem(NSMenuItem(title: "Install/Repair Codex Hooks", action: #selector(installHooks), keyEquivalent: "h"))
    menu.addItem(NSMenuItem(title: "Run Health Check", action: #selector(runHealthCheck), keyEquivalent: "r"))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Quit XLock", action: #selector(quit), keyEquivalent: "q"))
  }

  private func configureSettings() {
    let actions = XLockActions(
      toggleLocked: { [weak self] in self?.toggleLocked() },
      openX: { [weak self] in self?.openX() },
      blockNow: { [weak self] in self?.blockNow() },
      backToCodex: { [weak self] in self?.backToCodex() },
      openExtensionFolder: { [weak self] in self?.openExtensionFolder() },
      installHooks: { [weak self] in self?.installHooks() },
      runHealthCheck: { [weak self] in self?.runHealthCheck() }
    )
    settingsController = SettingsWindowController(appState: appState, actions: actions)
  }

  private func launchEngine() {
    Task {
      _ = await shellRunner.run("npm run launch")
      refreshStatus()
    }
  }

  private func refreshStatus() {
    Task {
      await appState.refresh()
      render()
    }
  }

  private func render() {
    statusItem.button?.title = appState.menuBarTitle
    statusMenuItem.title = appState.menuStatusTitle
    heartbeatMenuItem.title = appState.extensionTitle
    lockUnlockMenuItem.title = appState.isLocked ? "Unlock XLock" : "Lock XLock"
  }

  @objc private func openX() {
    post("/focus/twitter")
  }

  @objc private func toggleLocked() {
    let path = appState.isLocked ? "/gate/unlock" : "/gate/lock"
    post(path)
  }

  @objc private func blockNow() {
    post("/session/end")
  }

  @objc private func backToCodex() {
    post("/focus/codex")
  }

  @objc private func openSettings() {
    settingsController?.show()
  }

  @objc private func openExtensionFolder() {
    NSWorkspace.shared.open(projectRoot.appendingPathComponent("extension"))
  }

  @objc private func installHooks() {
    Task {
      let result = await shellRunner.run("npm run hook-install && npm run watch-hooks")
      if result.succeeded {
        showAlert(title: "XLock", message: "Codex hooks installed. Open /hooks in Codex if trust is requested.")
      } else {
        showAlert(title: "XLock command failed", message: result.summary)
      }
      refreshStatus()
    }
  }

  @objc private func runHealthCheck() {
    guard !appState.isRunningHealthCheck else { return }
    appState.isRunningHealthCheck = true
    Task {
      let result = await shellRunner.run("npm run completion")
      appState.isRunningHealthCheck = false
      appState.recordHealthCheck(result)
      refreshStatus()
    }
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }

  private func post(_ path: String) {
    Task {
      await appState.post(path)
      render()
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
