import Foundation

enum ProjectRoot {
  static func find() -> URL {
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
}

