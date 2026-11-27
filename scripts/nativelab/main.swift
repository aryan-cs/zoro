import UIKit

import ObjectiveC

/// Every ivar of `o` declared by its class chain up to (not including) `stop`, read by type.
func ivars(_ o: AnyObject, stop: AnyClass?) -> [String: Any] {
    var out: [String: Any] = [:]
    var cls: AnyClass? = object_getClass(o)
    while let c = cls, c !== stop, NSStringFromClass(c) != "NSObject" {
        var n: UInt32 = 0
        if let list = class_copyIvarList(c, &n) {
            for i in 0..<Int(n) {
                let iv = list[i]
                guard let name = ivar_getName(iv).map({ String(cString: $0) }), let enc = ivar_getTypeEncoding(iv).map({ String(cString: $0) }) else { continue }
                let base = UnsafeRawPointer(Unmanaged.passUnretained(o).toOpaque()) + ivar_getOffset(iv)
                let key = "\(NSStringFromClass(c)).\(name)"
                switch enc.first {
                case "d": out[key] = base.load(as: Double.self)
                case "f": out[key] = base.load(as: Float.self)
                case "q", "Q": out[key] = base.load(as: Int64.self)
                case "i", "I": out[key] = base.load(as: Int32.self)
                case "B", "c", "C": out[key] = base.load(as: UInt8.self)
                case "@": out[key] = describe(object_getIvar(o, iv))
                case "{":
                    if enc.hasPrefix("{CGPoint") || enc.hasPrefix("{CGSize") { out[key] = [base.load(as: Double.self), (base + 8).load(as: Double.self)] }
                    else if enc.hasPrefix("{CGRect") || enc.hasPrefix("{UIEdgeInsets") || enc.hasPrefix("{NSDirectionalEdgeInsets") || enc.hasPrefix("{CACornerRadii") { out[key] = (0..<4).map { (base + $0 * 8).load(as: Double.self) } }
                    else { out[key] = "struct \(enc.prefix(60))" }
                default: out[key] = "enc \(enc.prefix(20))"
                }
            }
            free(list)
        }
        cls = class_getSuperclass(c)
    }
    return out
}

/// Declared properties of `o` (its class chain up to NSObject/CALayer/CAFilter), read by KVC.
func props(_ o: NSObject, depth: Int = 0) -> [String: Any] {
    var out: [String: Any] = ["class": NSStringFromClass(type(of: o))]
    var c: AnyClass? = type(of: o)
    while let k = c, !["NSObject", "CALayer", "CAFilter"].contains(NSStringFromClass(k)) {
        var n: UInt32 = 0
        if let list = class_copyPropertyList(k, &n) {
            for i in 0..<Int(n) {
                let name = String(cString: property_getName(list[i]))
                if ["hash", "superclass", "description", "debugDescription", "delegate"].contains(name) { continue }
                guard o.responds(to: NSSelectorFromString(name)) else { continue }
                let v = o.value(forKey: name)
                if depth < 2, let obj = v as? NSObject, !(v is NSNumber), !(v is NSString), !(v is NSArray), CFGetTypeID(obj) != CGColor.typeID { out[name] = props(obj, depth: depth + 1) }
                else if depth < 2, let arr = v as? [NSObject] { out[name] = arr.prefix(12).map { ($0 is NSNumber || $0 is NSString) ? describe($0) : props($0, depth: depth + 1) as Any } }
                else { out[name] = describe(v) }
            }
            free(list)
        }
        c = class_getSuperclass(k)
    }
    return out
}
func classesWithPrefix(_ prefix: String) -> [String: Any] {
    // Names straight from the images that matter, so no class is touched until it matches.
    var out: [String: Any] = [:]
    for anchor in ["CABackdropLayer", "UIGlassEffect", "DLCAFilter"] {
        guard let img = NSClassFromString(anchor).flatMap({ class_getImageName($0) }) else { continue }
        var n: UInt32 = 0
        guard let names = objc_copyClassNamesForImage(img, &n) else { continue }
        for i in 0..<Int(n) {
            let name = String(cString: names[i])
            guard name.hasPrefix(prefix), let c = NSClassFromString(name) else { continue }
            var pn: UInt32 = 0
            var ps: [String] = []
            if let pl = class_copyPropertyList(c, &pn) { ps = (0..<Int(pn)).map { String(cString: property_getName(pl[$0])) }; free(pl) }
            out[name] = ["super": class_getSuperclass(c).map { String(cString: class_getName($0)) } ?? "", "props": ps]
        }
        free(names)
    }
    return out
}

/// The class's image (framework), methods and properties, for finding where something lives.
func classInfo(_ name: String) -> [String: Any] {
    guard let c = NSClassFromString(name) else { return ["missing": name] }
    var d: [String: Any] = ["image": class_getImageName(c).map { String(cString: $0) } ?? "?"]
    var chain: [String] = []; var k: AnyClass? = c
    while let x = k { chain.append(NSStringFromClass(x)); k = class_getSuperclass(x) }
    d["chain"] = chain
    var n: UInt32 = 0
    if let m = class_copyMethodList(c, &n) { d["methods"] = (0..<Int(n)).map { NSStringFromSelector(method_getName(m[$0])) }; free(m) }
    if let m = class_copyMethodList(object_getClass(c), &n) { d["classMethods"] = (0..<Int(n)).map { NSStringFromSelector(method_getName(m[$0])) }; free(m) }
    if let p = class_copyPropertyList(c, &n) { d["properties"] = (0..<Int(n)).map { String(cString: property_getName(p[$0])) + " " + String(cString: property_getAttributes(p[$0])!) }; free(p) }
    if let iv = class_copyIvarList(c, &n) { d["ivars"] = (0..<Int(n)).map { String(cString: ivar_getName(iv[$0])!) + " " + String(cString: ivar_getTypeEncoding(iv[$0])!) }; free(iv) }
    return d
}

// NativeLab: shows Apple's own controls (menus, alerts, sheets, glass buttons) in dark mode and,
// on request, dumps every window's view and layer tree to Documents/dump-<label>.json.

func rgba(_ c: CGColor?) -> [Double]? {
    guard let c, let s = CGColorSpace(name: CGColorSpace.extendedSRGB), let d = c.converted(to: s, intent: .defaultIntent, options: nil), let comps = d.components else { return nil }
    if comps.count >= 4 { return comps.prefix(4).map { (Double($0) * 1000).rounded() / 1000 } }
    if comps.count == 2 { return [comps[0], comps[0], comps[0], comps[1]].map { (Double($0) * 1000).rounded() / 1000 } }
    return nil
}
func r(_ v: CGFloat) -> Double { (Double(v) * 100).rounded() / 100 }
func rect(_ f: CGRect) -> [Double] { [r(f.minX), r(f.minY), r(f.width), r(f.height)] }
func describe(_ v: Any?) -> Any {
    guard let v else { return NSNull() }
    if let n = v as? NSNumber { return n }
    if let s = v as? String { return s }
    if CFGetTypeID(v as AnyObject) == CGColor.typeID { return ["color": rgba((v as! CGColor)) ?? []] }
    if let a = v as? [Any] { return a.prefix(24).map { describe($0) } }
    return String(String(describing: v).prefix(200))
}
func safeValue(_ o: NSObject, _ key: String) -> Any? {
    guard o.responds(to: NSSelectorFromString(key)) else { return nil }
    return o.value(forKey: key)
}
func filterInfo(_ f: Any) -> [String: Any] {
    let o = f as AnyObject as! NSObject
    var d: [String: Any] = ["class": String(describing: type(of: o))]
    if String(describing: type(of: o)) != "CAFilter" { d["ivars"] = ivars(o, stop: nil) }
    if let n = safeValue(o, "name") { d["name"] = describe(n) }
    if let t = safeValue(o, "type") { d["type"] = describe(t) }
    if let keys = safeValue(o, "inputKeys") as? [String] {
        var inputs: [String: Any] = [:]
        for k in keys { inputs[k] = describe(o.value(forKey: k)) }
        d["inputs"] = inputs
    }
    return d
}
func layerInfo(_ l: CALayer, in root: CALayer) -> [String: Any] {
    var d: [String: Any] = ["layer": String(describing: type(of: l)), "frame": rect(l.convert(l.bounds, to: root))]
    if l.cornerRadius > 0 { d["cornerRadius"] = r(l.cornerRadius); d["cornerCurve"] = l.cornerCurve.rawValue }
    if let bg = rgba(l.backgroundColor), bg[3] > 0 { d["bg"] = bg }
    if l.opacity < 1 { d["opacity"] = r(CGFloat(l.opacity)) }
    if l.shadowOpacity > 0 { d["shadow"] = ["color": rgba(l.shadowColor) ?? [], "opacity": r(CGFloat(l.shadowOpacity)), "radius": r(l.shadowRadius), "offset": [r(l.shadowOffset.width), r(l.shadowOffset.height)], "path": l.shadowPath != nil] }
    if l.borderWidth > 0 { d["border"] = ["width": r(l.borderWidth), "color": rgba(l.borderColor) ?? []] }
    if let fs = l.filters, !fs.isEmpty { d["filters"] = fs.map(filterInfo) }
    if let bfs = l.backgroundFilters, !bfs.isEmpty { d["backgroundFilters"] = bfs.map(filterInfo) }
    if let cf = l.compositingFilter { d["compositingFilter"] = describe(cf) }
    if l.masksToBounds { d["clips"] = true }
    if l.mask != nil { d["mask"] = String(describing: type(of: l.mask!)) }
    if l.contents != nil { d["contents"] = true }
    for k in ["scale", "groupName", "zoom", "marginWidth", "allowsInPlaceFiltering", "captureOnly", "reducesCaptureBitDepth", "windowServerAware", "ignoresOffscreenGroups"] where String(describing: type(of: l)).contains("Backdrop") {
        if let v = safeValue(l, k) { d[k] = describe(v) }
    }
    if let keys = l.animationKeys(), !keys.isEmpty { d["animations"] = keys }
    let lc = String(describing: type(of: l))
    if lc.contains("SDF") || lc.contains("Backdrop") || lc.contains("Portal") { d["ivars"] = ivars(l, stop: CALayer.self) }
    if lc.hasPrefix("CASDF") { d["props"] = props(l) }
    return d
}
func viewInfo(_ v: UIView, root: UIView) -> [String: Any]? {
    if v.isHidden || v.alpha < 0.01 { return nil }
    var d = layerInfo(v.layer, in: root.layer)
    d["view"] = String(describing: type(of: v))
    if v.alpha < 1 { d["alpha"] = r(v.alpha) }
    if let bg = v.backgroundColor?.resolvedColor(with: v.traitCollection).cgColor, let c = rgba(bg), c[3] > 0 { d["viewBg"] = c }
    if let tint = v.tintColor?.resolvedColor(with: v.traitCollection).cgColor { d["tint"] = rgba(tint) }
    if let l = v as? UILabel {
        d["text"] = l.text ?? ""
        d["font"] = [l.font.fontName, r(l.font.pointSize), (l.font.fontDescriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any])?[.weight] ?? 0]
        d["textColor"] = rgba(l.textColor.resolvedColor(with: v.traitCollection).cgColor)
        if l.numberOfLines != 1 { d["lines"] = l.numberOfLines }
    }
    if let iv = v as? UIImageView, let img = iv.image {
        d["image"] = String(String(describing: img).prefix(160))
        if let c = img.symbolConfiguration { d["symbolConfig"] = String(describing: c) }
    }
    if let e = v as? UIVisualEffectView { d["effect"] = String(describing: e.effect) }
    // Sublayers that don't belong to a subview (backdrops, glass, highlights).
    let viewLayers = Set(v.subviews.map { ObjectIdentifier($0.layer) })
    let extra = (v.layer.sublayers ?? []).filter { !viewLayers.contains(ObjectIdentifier($0)) }.map { layerTree($0, root: root.layer) }
    if !extra.isEmpty { d["sublayers"] = extra }
    let kids = v.subviews.compactMap { viewInfo($0, root: root) }
    if !kids.isEmpty { d["children"] = kids }
    return d
}
func layerTree(_ l: CALayer, root: CALayer, depth: Int = 0) -> [String: Any] {
    var d = layerInfo(l, in: root)
    if depth < 6, let subs = l.sublayers, !subs.isEmpty { d["sublayers"] = subs.prefix(30).map { layerTree($0, root: root, depth: depth + 1) } }
    return d
}

func docs() -> URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }

func dumpAll(label: String) {
    var windows: [[String: Any]] = []
    for scene in UIApplication.shared.connectedScenes {
        guard let ws = scene as? UIWindowScene else { continue }
        for w in ws.windows where !w.isHidden {
            if let info = viewInfo(w, root: w) { windows.append(["window": String(describing: type(of: w)), "level": r(w.windowLevel.rawValue), "tree": info]) }
        }
    }
    let data = try! JSONSerialization.data(withJSONObject: ["label": label, "scale": 3, "windows": windows], options: [.prettyPrinted, .sortedKeys])
    try! data.write(to: docs().appendingPathComponent("dump-\(label).json"))
}

/// Commands from the Mac: a file "cmd" in Documents holding e.g. "dump menu" or "show alert".
final class Commands {
    static func poll(_ vc: LabController) {
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in
            let url = docs().appendingPathComponent("cmd")
            guard let s = try? String(contentsOf: url, encoding: .utf8) else { return }
            try? FileManager.default.removeItem(at: url)
            for line in s.split(separator: "\n") {
                let p = line.split(separator: " ", maxSplits: 1).map(String.init)
                switch p[0] {
                case "dump": dumpAll(label: p.count > 1 ? p[1] : "now")
                case "classes":
                    let data = try! JSONSerialization.data(withJSONObject: classesWithPrefix(p.count > 1 ? p[1] : "CASDF"), options: [.prettyPrinted, .sortedKeys])
                    try! data.write(to: docs().appendingPathComponent("prefix.json"))
                case "stripes":
                    // A test pattern behind everything: 4pt black and white stripes and colored blocks, to see blur and refraction.
                    let v = UIView(frame: vc.view.window!.bounds)
                    for i in 0..<120 { let s = UIView(frame: CGRect(x: CGFloat(i) * 8, y: 0, width: 4, height: 2000)); s.backgroundColor = .white; v.addSubview(s) }
                    for (i, c) in [UIColor.systemRed, .systemGreen, .systemBlue, .systemYellow].enumerated() { let b = UIView(frame: CGRect(x: 120 + CGFloat(i) * 70, y: 60, width: 60, height: 300)); b.backgroundColor = c; v.addSubview(b) }
                    vc.tableView.backgroundView = v
                    vc.tableView.alpha = 1
                    vc.view.window!.rootViewController!.view.insertSubview(UIView(), at: 0)
                case "class":
                    let names = (p.count > 1 ? p[1] : "").split(separator: " ").map(String.init)
                    let data = try! JSONSerialization.data(withJSONObject: Dictionary(uniqueKeysWithValues: names.map { ($0, classInfo($0)) }), options: [.prettyPrinted, .sortedKeys])
                    try! data.write(to: docs().appendingPathComponent("classes.json"))
                case "show": vc.show(p.count > 1 ? p[1] : "")
                case "dismiss": vc.presentedViewController?.dismiss(animated: false) ?? vc.navigationController?.presentedViewController?.dismiss(animated: false)
                default: break
                }
            }
            try? "ok \(s)".write(to: docs().appendingPathComponent("ack"), atomically: true, encoding: .utf8)
        }
    }
}

final class LabController: UITableViewController {
    let rows = ["Alert", "Alert Three", "Action Sheet", "Sheet", "Toggle", "Segmented", "Slider"]
    let toggle = UISwitch()
    let seg = UISegmentedControl(items: ["Servings", "Grams"])

    init() { super.init(style: .insetGrouped) }
    required init?(coder: NSCoder) { fatalError() }

    func foodMenu() -> UIMenu {
        let photo = UIMenu(title: "Log from Photo", image: UIImage(systemName: "camera"), children: [
            UIAction(title: "Photo Library", image: UIImage(systemName: "photo.on.rectangle")) { _ in },
            UIAction(title: "Take Photo", image: UIImage(systemName: "camera")) { _ in },
            UIAction(title: "Choose File", image: UIImage(systemName: "folder")) { _ in },
        ])
        return UIMenu(children: [
            UIAction(title: "Search Foods", image: UIImage(systemName: "magnifyingglass")) { _ in },
            UIAction(title: "Scan Barcode", image: UIImage(systemName: "barcode.viewfinder")) { _ in },
            photo,
            UIAction(title: "Quick Add Calories", image: UIImage(systemName: "bolt.fill")) { _ in },
            UIMenu(options: .displayInline, children: [UIAction(title: "Delete", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in }]),
        ])
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Today"
        navigationItem.rightBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "plus"), menu: foodMenu())
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Done", style: .plain, target: nil, action: nil)
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "c")
        toggle.isOn = true
        seg.selectedSegmentIndex = 0
        Commands.poll(self)
    }
    override func tableView(_ t: UITableView, numberOfRowsInSection s: Int) -> Int { rows.count }
    override func tableView(_ t: UITableView, cellForRowAt i: IndexPath) -> UITableViewCell {
        let c = t.dequeueReusableCell(withIdentifier: "c", for: i)
        var cfg = c.defaultContentConfiguration()
        cfg.text = rows[i.row]
        c.contentConfiguration = cfg
        c.accessoryView = rows[i.row] == "Toggle" ? toggle : rows[i.row] == "Segmented" ? seg : rows[i.row] == "Slider" ? { let s = UISlider(frame: CGRect(x: 0, y: 0, width: 160, height: 30)); s.value = 0.4; return s }() : nil
        return c
    }
    override func tableView(_ t: UITableView, didSelectRowAt i: IndexPath) { show(rows[i.row]); t.deselectRow(at: i, animated: true) }

    func show(_ what: String) {
        switch what {
        case "Alert":
            let a = UIAlertController(title: "Add Your Gemini Key", message: "Logging from a photo uses your own free Gemini key. Add it in Settings.", preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            a.addAction(UIAlertAction(title: "Settings", style: .default))
            a.preferredAction = a.actions[1]
            present(a, animated: true)
        case "AlertField":
            let a = UIAlertController(title: "Morning Weight", message: "In pounds.", preferredStyle: .alert)
            a.addTextField { $0.placeholder = "lb"; $0.text = "195.0" }
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            a.addAction(UIAlertAction(title: "Save", style: .default))
            present(a, animated: true)
        case "Alert Three":
            let a = UIAlertController(title: "Delete Photo?", message: "Its foods stay logged.", preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Delete", style: .destructive))
            a.addAction(UIAlertAction(title: "Keep", style: .default))
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            present(a, animated: true)
        case "Action Sheet":
            let a = UIAlertController(title: nil, message: "What do you want to do with this photo?", preferredStyle: .actionSheet)
            a.addAction(UIAlertAction(title: "Try Again", style: .default))
            a.addAction(UIAlertAction(title: "Delete Photo", style: .destructive))
            a.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            present(a, animated: true)
        case "Sheet":
            let v = UIViewController()
            v.view.backgroundColor = .systemGroupedBackground
            let n = UINavigationController(rootViewController: v)
            v.title = "Quick Add"
            v.navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Cancel", style: .plain, target: nil, action: nil)
            n.sheetPresentationController?.detents = [.medium(), .large()]
            n.sheetPresentationController?.prefersGrabberVisible = true
            present(n, animated: true)
        case "FullSheet":
            let v = UITableViewController(style: .insetGrouped)
            v.title = "Add Food"
            v.navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Cancel", style: .plain, target: nil, action: nil)
            let n = UINavigationController(rootViewController: v)
            present(n, animated: true)
        default: break
        }
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.overrideUserInterfaceStyle = .dark
        let nav = UINavigationController(rootViewController: LabController())
        nav.isToolbarHidden = false
        nav.topViewController?.toolbarItems = [UIBarButtonItem(systemItem: .flexibleSpace), UIBarButtonItem(image: UIImage(systemName: "ellipsis"), menu: (nav.topViewController as! LabController).foodMenu())]
        w.rootViewController = nav
        w.makeKeyAndVisible()
        window = w
    }
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting s: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let c = UISceneConfiguration(name: nil, sessionRole: s.role)
        c.delegateClass = SceneDelegate.self
        return c
    }
}
