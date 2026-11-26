import AppKit
// Render SF Symbols exactly as AppKit draws them (layers, erase cut-outs) to alpha PNGs at 6x,
// framed by the symbol's own image box (Apple's alignment padding included). Prints JSON lines.
let scale: CGFloat = 6
for name in CommandLine.arguments.dropFirst() {
  let config = NSImage.SymbolConfiguration(pointSize: 24, weight: .medium, scale: .medium)
  guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(config) else { print("missing \(name)"); continue }
  let w = Int(ceil(img.size.width * scale)), h = Int(ceil(img.size.height * scale))
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = img.size
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let tinted = img.copy() as! NSImage
  tinted.isTemplate = true
  NSColor.black.set()
  tinted.draw(in: CGRect(origin: .zero, size: img.size))
  NSGraphicsContext.restoreGraphicsState()
  let png = rep.representation(using: .png, properties: [:])!
  print("{\"name\":\"\(name)\",\"w\":\(img.size.width),\"h\":\(img.size.height),\"png\":\"\(png.base64EncodedString())\"}")
}
