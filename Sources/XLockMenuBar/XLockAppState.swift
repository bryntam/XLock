import Foundation

@MainActor
final class XLockAppState: ObservableObject {
  @Published private(set) var state: XLockState?
  @Published private(set) var serviceAvailable = false
  @Published private(set) var serviceMessage = "Starting..."
  @Published var isRunningHealthCheck = false
  @Published var healthCheckSummary = "Not run yet"
  @Published var healthCheckSucceeded: Bool?

  private let client: XLockClient

  init(client: XLockClient) {
    self.client = client
  }

  var isLocked: Bool {
    state?.locked == true
  }

  var xIsBlocked: Bool {
    guard let state else { return false }
    return state.locked && !state.twitterAllowed
  }

  var statusTitle: String {
    guard serviceAvailable else { return "Service unavailable" }
    return isLocked ? "XLock is Locked" : "XLock is Unlocked"
  }

  var xStatusTitle: String {
    guard serviceAvailable else { return "X status unknown" }
    return xIsBlocked ? "X is blocked" : "X is available"
  }

  var menuBarTitle: String {
    guard serviceAvailable else { return "XLock: Off" }
    if !isLocked { return "XLock: Unlocked" }
    return xIsBlocked ? "XLock: Locked" : "XLock: Unlocked"
  }

  var menuStatusTitle: String {
    guard let state, serviceAvailable else { return serviceMessage }
    if !state.locked { return "XLock is unlocked" }

    let lockText = state.twitterAllowed ? "Unlocked" : "Locked"
    return "X is \(lockText) • \(state.mode) • \(state.elapsedSeconds)s"
  }

  var extensionTitle: String {
    guard serviceAvailable else { return "Extension: unknown" }
    guard let state else { return "Extension: checking..." }
    if let heartbeat = state.lastHeartbeatAt, state.lastHeartbeatUrl != nil {
      return "Extension: connected (\(Self.shortTime(heartbeat)))"
    }
    return "Extension: waiting for X tab"
  }

  var extensionStatusValue: String {
    guard serviceAvailable else { return "Unknown" }
    guard let state else { return "Checking" }
    return hasExtensionConnection(state) ? "Connected" : "Waiting"
  }

  var modeStatusValue: String {
    guard let state, serviceAvailable else { return "Unavailable" }
    if !state.locked { return "Unlocked" }
    return state.mode == "building" ? "Building" : "Idle"
  }

  func healthStatus(for label: String) -> String {
    guard healthCheckSummary != "Not run yet" else { return "Not checked" }
    guard healthCheckSucceeded != false else { return "Needs attention" }

    for line in healthCheckSummary.split(separator: "\n") {
      guard line.hasPrefix("\(label):") else { continue }
      return line.contains("OK") ? "OK" : "Open"
    }

    return "Not checked"
  }

  func refresh() async {
    do {
      let nextState = try await client.status()
      self.state = nextState
      self.serviceAvailable = true
      self.serviceMessage = "Service: connected"
    } catch {
      self.state = nil
      self.serviceAvailable = false
      self.serviceMessage = "Service: not running"
    }
  }

  func post(_ path: String) async {
    do {
      try await client.post(path)
    } catch {
      serviceAvailable = false
      serviceMessage = "Service: not running"
    }
    await refresh()
  }

  func recordHealthCheck(_ result: ShellResult) {
    healthCheckSucceeded = result.succeeded
    healthCheckSummary = Self.trimSummary(result.summary)
  }

  private static func shortTime(_ isoDate: String) -> String {
    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: isoDate) else { return "recently" }
    return date.formatted(date: .omitted, time: .shortened)
  }

  private func hasExtensionConnection(_ state: XLockState) -> Bool {
    guard let heartbeat = state.lastHeartbeatAt,
          let url = state.lastHeartbeatUrl,
          url.hasPrefix("https://x.com/") || url.hasPrefix("http://x.com/") || url.hasPrefix("https://twitter.com/") || url.hasPrefix("http://twitter.com/")
    else {
      return false
    }

    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: heartbeat) else { return false }
    return Date().timeIntervalSince(date) <= 5 * 60
  }

  private static func trimSummary(_ text: String) -> String {
    let lines = text
      .split(separator: "\n", omittingEmptySubsequences: true)
      .map(String.init)

    guard !lines.isEmpty else { return "Completed" }
    return lines.prefix(8).joined(separator: "\n")
  }
}
