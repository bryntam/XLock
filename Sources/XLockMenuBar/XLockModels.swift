import Foundation

struct XLockStatus: Decodable {
  let ok: Bool
  let data: XLockState
}

struct XLockPostResponse: Decodable {
  let ok: Bool
}

enum XLockClientError: LocalizedError {
  case badStatus(Int)
  case rejectedResponse

  var errorDescription: String? {
    switch self {
    case .badStatus(let statusCode):
      return "XLock service returned HTTP \(statusCode)."
    case .rejectedResponse:
      return "XLock service rejected the request."
    }
  }
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

struct ShellResult {
  let exitCode: Int32
  let output: String
  let error: String

  var succeeded: Bool {
    exitCode == 0
  }

  var summary: String {
    let text = output.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty {
      return text
    }

    let errorText = error.trimmingCharacters(in: .whitespacesAndNewlines)
    if !errorText.isEmpty {
      return errorText
    }

    return succeeded ? "Completed" : "Exit code \(exitCode)"
  }
}
