import SwiftUI

struct XLockActions {
  let toggleLocked: () -> Void
  let openX: () -> Void
  let blockNow: () -> Void
  let backToCodex: () -> Void
  let openExtensionFolder: () -> Void
  let installHooks: () -> Void
  let runHealthCheck: () -> Void
}

struct SettingsView: View {
  @ObservedObject var appState: XLockAppState
  let actions: XLockActions

  var body: some View {
    VStack(spacing: 0) {
      header

      Divider()

      ScrollView {
        VStack(spacing: 16) {
          controlsSection
          setupSection
          statusSection
        }
        .padding(20)
      }
      .background(Color(nsColor: .windowBackgroundColor))
    }
    .frame(minWidth: 520, minHeight: 500)
  }

  private var header: some View {
    HStack(spacing: 14) {
      Image(systemName: appState.xIsBlocked ? "lock.fill" : "lock.open.fill")
        .font(.system(size: 28, weight: .semibold))
        .symbolRenderingMode(.hierarchical)
        .foregroundStyle(appState.xIsBlocked ? .red : .green)
        .frame(width: 40, height: 40)
        .background(Color(nsColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

      VStack(alignment: .leading, spacing: 3) {
        Text(appState.statusTitle)
          .font(.system(size: 20, weight: .semibold))
        Text(appState.xStatusTitle)
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
      }

      Spacer()

      StatusPill(text: appState.isLocked ? "Locked" : "Unlocked", blocked: appState.xIsBlocked)
    }
    .padding(.horizontal, 22)
    .padding(.vertical, 18)
    .background(Color(nsColor: .windowBackgroundColor))
  }

  private var controlsSection: some View {
    SettingsSection(title: "Controls") {
      Grid(horizontalSpacing: 10, verticalSpacing: 10) {
        GridRow {
          Button(action: actions.toggleLocked) {
            Label(appState.isLocked ? "Unlock XLock" : "Lock XLock", systemImage: appState.isLocked ? "lock.open" : "lock")
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)

          Button(action: actions.openX) {
            Label("Open X", systemImage: "safari")
              .frame(maxWidth: .infinity)
          }
        }

        GridRow {
          Button(action: actions.blockNow) {
            Label("Block Now", systemImage: "hand.raised")
              .frame(maxWidth: .infinity)
          }

          Button(action: actions.backToCodex) {
            Label("Back to Codex", systemImage: "arrow.left.to.line")
              .frame(maxWidth: .infinity)
          }
        }
      }
      .controlSize(.large)
    }
  }

  private var setupSection: some View {
    SettingsSection(title: "Setup") {
      VStack(spacing: 0) {
        SettingsActionRow(
          title: "Extension Folder",
          value: "Open",
          systemImage: "puzzlepiece.extension",
          action: actions.openExtensionFolder
        )

        Divider().padding(.leading, 34)

        SettingsActionRow(
          title: "Codex Hooks",
          value: "Install or Repair",
          systemImage: "wrench.and.screwdriver",
          action: actions.installHooks
        )

        Divider().padding(.leading, 34)

        SettingsActionRow(
          title: "Health Check",
          value: appState.isRunningHealthCheck ? "Running..." : "Run",
          systemImage: "checkmark.seal",
          action: actions.runHealthCheck
        )
        .disabled(appState.isRunningHealthCheck)

        if appState.healthCheckSummary != "Not run yet" || appState.isRunningHealthCheck {
          Divider().padding(.leading, 34)
          healthResult
        }
      }
    }
  }

  private var healthResult: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: healthIcon)
        .foregroundStyle(healthColor)
        .frame(width: 24)

      Text(appState.isRunningHealthCheck ? "Running health check..." : appState.healthCheckSummary)
        .font(.system(size: 12, design: .monospaced))
        .foregroundStyle(.secondary)
        .lineLimit(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }
    .padding(.vertical, 10)
  }

  private var statusSection: some View {
    SettingsSection(title: "Status") {
      VStack(spacing: 0) {
        StatusRow(title: "Service", value: appState.serviceAvailable ? "Connected" : "Unavailable", systemImage: "bolt.horizontal")
        Divider().padding(.leading, 34)
        StatusRow(title: "X", value: appState.xIsBlocked ? "Blocked" : "Available", systemImage: "xmark")
        Divider().padding(.leading, 34)
        StatusRow(title: "Browser Extension", value: appState.extensionStatusValue, systemImage: "puzzlepiece.extension")
        Divider().padding(.leading, 34)
        StatusRow(title: "Codex Hooks", value: appState.healthStatus(for: "Hooks"), systemImage: "terminal")
        Divider().padding(.leading, 34)
        StatusRow(title: "Session Watcher", value: appState.healthStatus(for: "Session watcher"), systemImage: "eye")
      }
    }
  }

  private var healthIcon: String {
    if appState.isRunningHealthCheck { return "clock" }
    return appState.healthCheckSucceeded == false ? "exclamationmark.triangle" : "checkmark.circle"
  }

  private var healthColor: Color {
    if appState.isRunningHealthCheck { return .secondary }
    return appState.healthCheckSucceeded == false ? .orange : .green
  }
}

private struct SettingsSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.secondary)
        .textCase(.uppercase)

      VStack(alignment: .leading, spacing: 0) {
        content
      }
      .padding(12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
  }
}

private struct SettingsActionRow: View {
  let title: String
  let value: String
  let systemImage: String
  let action: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
        .frame(width: 24)

      Text(title)
        .font(.system(size: 13))

      Spacer()

      Button(value, action: action)
        .controlSize(.small)
    }
    .padding(.vertical, 7)
  }
}

private struct StatusRow: View {
  let title: String
  let value: String
  let systemImage: String

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: systemImage)
        .foregroundStyle(.secondary)
        .frame(width: 24)

      Text(title)
        .font(.system(size: 13))

      Spacer()

      Text(value)
        .font(.system(size: 13))
        .foregroundStyle(.secondary)
    }
    .padding(.vertical, 7)
  }
}

private struct StatusPill: View {
  let text: String
  let blocked: Bool

  var body: some View {
    Text(text)
      .font(.system(size: 12, weight: .semibold))
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .foregroundStyle(blocked ? .red : .green)
      .background((blocked ? Color.red : Color.green).opacity(0.12), in: Capsule())
  }
}
