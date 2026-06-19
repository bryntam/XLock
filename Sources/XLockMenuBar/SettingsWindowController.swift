import AppKit
import SwiftUI

@MainActor
final class SettingsWindowController {
  private var window: NSWindow?
  private var windowDelegate: WindowDelegate?
  private let appState: XLockAppState
  private let actions: XLockActions

  init(appState: XLockAppState, actions: XLockActions) {
    self.appState = appState
    self.actions = actions
  }

  func show() {
    if let window {
      window.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
      return
    }

    let view = SettingsView(appState: appState, actions: actions)
    let hostingController = NSHostingController(rootView: view)
    let settingsWindow = NSWindow(contentViewController: hostingController)
    settingsWindow.title = "XLock Settings"
    settingsWindow.setContentSize(NSSize(width: 580, height: 560))
    settingsWindow.minSize = NSSize(width: 520, height: 500)
    settingsWindow.styleMask = [.titled, .closable, .miniaturizable, .resizable]
    settingsWindow.titlebarAppearsTransparent = false
    settingsWindow.isReleasedWhenClosed = false
    settingsWindow.center()
    let delegate = WindowDelegate { [weak self] in
      self?.window = nil
      self?.windowDelegate = nil
    }
    settingsWindow.delegate = delegate
    windowDelegate = delegate

    window = settingsWindow
    settingsWindow.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
}

private final class WindowDelegate: NSObject, NSWindowDelegate {
  private let onClose: () -> Void

  init(onClose: @escaping () -> Void) {
    self.onClose = onClose
  }

  func windowWillClose(_ notification: Notification) {
    onClose()
  }
}
