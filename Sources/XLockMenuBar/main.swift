import AppKit

let app = NSApplication.shared
let delegate = XLockMenuBarApp()
app.delegate = delegate
app.run()

