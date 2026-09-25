import Foundation

@main
struct StaticServerTests {
    static func main() throws {
        let fm = FileManager.default
        let fixture = fm.temporaryDirectory.appendingPathComponent("jianpu-static-tests-\(UUID().uuidString)")
        let root = fixture.appendingPathComponent("web")
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: fixture) }
        let index = Data("<!doctype html><title>简谱唱名</title>".utf8)
        try index.write(to: root.appendingPathComponent("index.html"))
        try Data("export const value = 1;".utf8).write(to: root.appendingPathComponent("app.js"))
        try Data([0x49, 0x44, 0x33]).write(to: root.appendingPathComponent("C4.mp3"))
        try Data("outside".utf8).write(to: fixture.appendingPathComponent("private.txt"))
        try fm.createSymbolicLink(at: root.appendingPathComponent("link.txt"), withDestinationURL: fixture.appendingPathComponent("private.txt"))
        let files = StaticFiles(root: root, expectedHost: "127.0.0.1:41876")
        var checks = 0
        func check(_ success: Bool, _ name: String) {
            precondition(success, "FAILED: \(name)")
            checks += 1
        }
        func response(_ path: String, method: String = "GET", host: String = "127.0.0.1:41876") -> StaticResponse {
            files.response(to: Data("\(method) \(path) HTTP/1.1\r\nHost: \(host)\r\n\r\n".utf8))
        }
        check(response("/").status == 200 && response("/").body == index, "bundled index")
        check(response("/index.html?cache=1").body == index, "query handling")
        check(response("/app.js").contentType == "text/javascript; charset=utf-8", "JavaScript MIME")
        check(response("/C4.mp3").contentType == "audio/mpeg", "MP3 MIME")
        check(response("/missing.html").status == 404, "missing resource")
        check(response("/private.swift").status == 404, "unknown file type")
        check(response("/", method: "POST").status == 405, "read-only service")
        for path in ["/../private.txt", "/%2e%2e/private.txt", "/%2e%2e%2fprivate.txt", "/link.txt", "//private.txt", "/bad%00.txt", "/..%5cprivate.txt"] {
            check(response(path).status == 403, "path containment: \(path)")
        }
        for host in ["example.com", "localhost:41876", "127.0.0.1:5173", "127.0.0.1:41876\r\nHost: attacker.test"] {
            check(response("/", host: host).status == 403, "host validation")
        }
        for raw in ["", "GET", "GET /", "GET / HTTP/2", "GET / HTTP/1.1 extra"] {
            check(files.response(to: Data((raw + "\r\n\r\n").utf8)).status == 400, "malformed request")
        }
        check(files.response(to: Data([0xff, 0xfe])).status == 400, "invalid UTF-8")
        let head = response("/", method: "HEAD")
        check(head.status == 200 && head.bytes.suffix(4) == Data("\r\n\r\n".utf8), "HEAD has no body")
        check(String(decoding: head.bytes, as: UTF8.self).contains("Content-Length: \(index.count)"), "HEAD preserves byte length")
        check(response("/missing.html", method: "HEAD").bytes.suffix(4) == Data("\r\n\r\n".utf8), "HEAD error has no body")
        if CommandLine.arguments.contains("--network") {
            let server = StaticServer(root: root)
            var started: Result<URL, Error>?
            server.start { started = $0 }
            waitUntil { started != nil }
            let origin = try started!.get()
            defer { server.stop() }
            check(origin.absoluteString == "http://127.0.0.1:41876", "stable origin")
            var fetched: (Data?, URLResponse?, Error?)?
            URLSession.shared.dataTask(with: origin) { data, response, error in
                DispatchQueue.main.async { fetched = (data, response, error) }
            }.resume()
            waitUntil { fetched != nil }
            check(fetched!.0 == index && fetched!.2 == nil, "live loopback response")
            let duplicate = StaticServer(root: root)
            var duplicateResult: Result<URL, Error>?
            duplicate.start { duplicateResult = $0 }
            waitUntil { duplicateResult != nil }
            if case .success = duplicateResult! { preconditionFailure("occupied port must fail explicitly") }
            duplicate.stop()
            check(true, "occupied port reports failure")
        }
        print("Static resource checks: \(checks) passed")
    }

    static func waitUntil(_ condition: () -> Bool) {
        let deadline = Date().addingTimeInterval(5)
        while !condition() && Date() < deadline {
            RunLoop.main.run(until: Date().addingTimeInterval(0.01))
        }
        precondition(condition(), "Timed out waiting for local server")
    }
}
