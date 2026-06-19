import Foundation

final class XLockClient: @unchecked Sendable {
  private let serviceURL: URL

  init(serviceURL: URL) {
    self.serviceURL = serviceURL
  }

  func status() async throws -> XLockState {
    let url = serviceURL.appendingPathComponent("status")
    let (data, response) = try await URLSession.shared.data(from: url)
    try validate(response: response)
    let payload = try JSONDecoder().decode(XLockStatus.self, from: data)
    guard payload.ok else { throw XLockClientError.rejectedResponse }
    return payload.data
  }

  func post(_ path: String) async throws {
    var request = URLRequest(url: serviceURL.appendingPathComponent(path))
    request.httpMethod = "POST"
    let (data, response) = try await URLSession.shared.data(for: request)
    try validate(response: response)

    if !data.isEmpty,
       let payload = try? JSONDecoder().decode(XLockPostResponse.self, from: data),
       !payload.ok {
      throw XLockClientError.rejectedResponse
    }
  }

  private func validate(response: URLResponse) throws {
    guard let httpResponse = response as? HTTPURLResponse else { return }
    guard (200..<300).contains(httpResponse.statusCode) else {
      throw XLockClientError.badStatus(httpResponse.statusCode)
    }
  }
}
