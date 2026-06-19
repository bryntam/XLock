// swift-tools-version: 6.1

import PackageDescription

let package = Package(
  name: "XLock",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .executable(name: "XLockMenuBar", targets: ["XLockMenuBar"])
  ],
  targets: [
    .executableTarget(
      name: "XLockMenuBar",
      path: "Sources/XLockMenuBar"
    )
  ]
)
