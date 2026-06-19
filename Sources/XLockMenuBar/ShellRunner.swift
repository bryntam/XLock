import Foundation

final class ShellRunner: @unchecked Sendable {
  private let projectRoot: URL

  init(projectRoot: URL) {
    self.projectRoot = projectRoot
  }

  func run(_ command: String) async -> ShellResult {
    await withCheckedContinuation { continuation in
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

          let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
          let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
          continuation.resume(returning: ShellResult(
            exitCode: process.terminationStatus,
            output: String(data: outputData, encoding: .utf8) ?? "",
            error: String(data: errorData, encoding: .utf8) ?? ""
          ))
        } catch {
          continuation.resume(returning: ShellResult(
            exitCode: 1,
            output: "",
            error: error.localizedDescription
          ))
        }
      }
    }
  }
}
