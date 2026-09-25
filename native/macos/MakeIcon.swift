import AppKit

let folder = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let image = NSImage(size: NSSize(width: pixels, height: pixels))
        image.lockFocus()
        let rect = NSRect(x: 0, y: 0, width: pixels, height: pixels)
        NSColor(calibratedRed: 0, green: 0.4, blue: 0.8, alpha: 1).setFill()
        NSBezierPath(roundedRect: rect.insetBy(dx: Double(pixels) * 0.055, dy: Double(pixels) * 0.055), xRadius: Double(pixels) * 0.20, yRadius: Double(pixels) * 0.20).fill()
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: Double(pixels) * 0.68, weight: .medium), .foregroundColor: NSColor.white]
        let text = "5" as NSString
        let bounds = text.size(withAttributes: attributes)
        text.draw(at: NSPoint(x: (Double(pixels) - bounds.width) / 2, y: (Double(pixels) - bounds.height) / 2), withAttributes: attributes)
        image.unlockFocus()
        let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
        let suffix = scale == 2 ? "@2x" : ""
        try bitmap.representation(using: .png, properties: [:])!.write(to: folder.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
