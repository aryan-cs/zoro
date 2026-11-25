// Exports SF Symbols (public, and Apple-private ones like activity.move.ring) as JSON lines with
// the vector outline macOS itself draws, plus the fill rule that matches its rendering.
// Usage: xcrun swift scripts/sf-symbols.swift - medium drop.fill fork.knife > symbols.jsonl
// Then add the lines to src/ui/sf.ts (w, h, e = even-odd fill, d = SVG path).
import AppKit

let args = CommandLine.arguments
let out = URL(fileURLWithPath: args[1])
let weights: [String: NSFont.Weight] = ["regular": .regular, "medium": .medium, "semibold": .semibold, "bold": .bold]
let weight = weights[args[2]] ?? .regular
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func svgPath(_ path: CGPath, box: CGRect) -> String {
    var d = ""
    func p(_ pt: CGPoint) -> String { String(format: "%.2f %.2f", pt.x - box.minX, pt.y - box.minY) }
    path.applyWithBlock { el in
        let e = el.pointee
        switch e.type {
        case .moveToPoint: d += "M\(p(e.points[0]))"
        case .addLineToPoint: d += "L\(p(e.points[0]))"
        case .addQuadCurveToPoint: d += "Q\(p(e.points[0])) \(p(e.points[1]))"
        case .addCurveToPoint: d += "C\(p(e.points[0])) \(p(e.points[1])) \(p(e.points[2]))"
        case .closeSubpath: d += "Z"
        @unknown default: break
        }
    }
    return d
}

for name in args.dropFirst(3) {
    let config = NSImage.SymbolConfiguration(pointSize: 24, weight: weight, scale: .medium)
    // Public symbols first; Apple's private ones (used by Fitness) through AppKit's private loader.
    let found = NSImage(systemSymbolName: name, accessibilityDescription: nil)
        ?? (NSImage.perform(NSSelectorFromString("imageWithPrivateSystemSymbolName:"), with: name)?.takeUnretainedValue() as? NSImage)
    guard let img = found?.withSymbolConfiguration(config),
          let rep = img.representations.first else { print("missing \(name)"); continue }
    let size = img.size
    var path: CGPath?
    if rep.responds(to: NSSelectorFromString("outlinePath")),
       let obj = rep.perform(NSSelectorFromString("outlinePath"))?.takeUnretainedValue() {
        if let bp = obj as? NSBezierPath { path = bp.cgPath }
        else if CFGetTypeID(obj) == CGPath.typeID { path = (obj as! CGPath) }
    }
    guard let cg = path, !cg.isEmpty else { print("nopath \(name)"); continue }
    let b = cg.boundingBoxOfPath
    // Pick the fill rule that matches how macOS itself draws the symbol: rasterize the real
    // image and both fill rules into the same box and keep the closer one.
    let N = 160
    func alphaCanvas(_ draw: (CGContext) -> Void) -> [UInt8] {
        var px = [UInt8](repeating: 0, count: N * N * 4)
        let ctx = CGContext(data: &px, width: N, height: N, bitsPerComponent: 8, bytesPerRow: N * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        draw(ctx)
        return stride(from: 3, to: px.count, by: 4).map { px[$0] }
    }
    var ir = CGRect(origin: .zero, size: img.size)
    let cgimg = img.cgImage(forProposedRect: &ir, context: nil, hints: [.ctm: NSAffineTransform(transform: AffineTransform(scale: 4))])!
    let truthRaw = alphaCanvas { $0.draw(cgimg, in: CGRect(x: 0, y: 0, width: N, height: Int(Double(N) * img.size.height / img.size.width))) }
    var x0 = N, y0 = N, x1 = 0, y1 = 0
    for y in 0..<N { for x in 0..<N where truthRaw[y * N + x] > 127 { x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y) } }
    func pathAlpha(_ rule: CGPathFillRule) -> [UInt8] {
        alphaCanvas { ctx in
            // Bitmap rows run top-down here; map the path box onto the truth's ink box.
            ctx.translateBy(x: 0, y: CGFloat(N)); ctx.scaleBy(x: 1, y: -1)
            ctx.translateBy(x: CGFloat(x0), y: CGFloat(y0))
            ctx.scaleBy(x: CGFloat(x1 - x0 + 1) / b.width, y: CGFloat(y1 - y0 + 1) / b.height)
            ctx.translateBy(x: -b.minX, y: -b.minY)
            ctx.addPath(cg); ctx.setFillColor(CGColor(gray: 0, alpha: 1)); ctx.fillPath(using: rule)
        }
    }
    func diff(_ rule: CGPathFillRule) -> Int { zip(pathAlpha(rule), truthRaw).reduce(0) { $0 + abs(Int($1.0) - Int($1.1)) } }
    let evenodd = diff(.evenOdd) < diff(.winding)
    // One JSON line per symbol: path in a box starting at 0,0, plus the image size for scale.
    let line = "{\"name\":\"\(name)\",\"w\":\(b.width),\"h\":\(b.height),\"iw\":\(size.width),\"ih\":\(size.height),\"evenodd\":\(evenodd),\"d\":\"\(svgPath(cg, box: b))\"}"
    print(line)
}
