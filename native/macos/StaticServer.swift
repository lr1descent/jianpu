import Foundation
import Network

struct StaticResponse {
    let status: Int
    let contentType: String
    let body: Data
    let headOnly: Bool

    var bytes: Data {
        let reason = [200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed"][status] ?? "Error"
        let headers = [
            "HTTP/1.1 \(status) \(reason)",
            "Content-Type: \(contentType)",
            "Content-Length: \(body.count)",
            "Cache-Control: no-store",
            "X-Content-Type-Options: nosniff",
            "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
            "Connection: close", "", ""
        ].joined(separator: "\r\n")
        return Data(headers.utf8) + (headOnly ? Data() : body)
    }
}

struct StaticFiles {
    let root: URL
    let expectedHost: String

    func response(to request: Data) -> StaticResponse {
        let text = String(data: request, encoding: .utf8)
        let lines = text?.components(separatedBy: "\r\n") ?? []
        let parts = (lines.first ?? "").split(separator: " ")
        let headOnly = parts.first == "HEAD"
        func error(_ status: Int) -> StaticResponse {
            StaticResponse(status: status, contentType: "text/plain; charset=utf-8", body: Data("HTTP \(status)".utf8), headOnly: headOnly)
        }
        guard text != nil else { return error(400) }
        guard parts.count == 3, parts[2] == "HTTP/1.1" || parts[2] == "HTTP/1.0" else { return error(400) }
        guard parts[0] == "GET" || parts[0] == "HEAD" else { return error(405) }
        let hosts = lines.dropFirst().compactMap { line -> String? in
            guard let colon = line.firstIndex(of: ":"), line[..<colon].lowercased() == "host" else { return nil }
            return line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard hosts == [expectedHost] else { return error(403) }
        let rawPath = String(parts[1]).components(separatedBy: "?")[0]
        guard rawPath.hasPrefix("/"), !rawPath.hasPrefix("//"),
              let path = rawPath.removingPercentEncoding, !path.contains("\0"), !path.contains("\\"),
              !path.split(separator: "/").contains("..") else { return error(403) }
        let relative = path == "/" ? "index.html" : String(path.dropFirst())
        let directory = root.standardizedFileURL.resolvingSymlinksInPath()
        let file = directory.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(directory.path + "/") else { return error(403) }
        let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "json": "application/json", "mp3": "audio/mpeg", "txt": "text/plain; charset=utf-8", "png": "image/png", "svg": "image/svg+xml"]
        guard let type = types[file.pathExtension.lowercased()] else { return error(404) }
        guard let values = try? file.resourceValues(forKeys: [.isRegularFileKey]), values.isRegularFile == true,
              let body = try? Data(contentsOf: file) else { return error(404) }
        return StaticResponse(status: 200, contentType: type, body: body, headOnly: headOnly)
    }
}

final class StaticServer {
    static let port: UInt16 = 41876
    static let origin = URL(string: "http://127.0.0.1:\(port)")!
    private let queue = DispatchQueue(label: "local.jianpu.static-server")
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]
    private let files: StaticFiles

    init(root: URL) { files = StaticFiles(root: root, expectedHost: "127.0.0.1:\(Self.port)") }

    func start(completion: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: Self.port)!)
            let listener = try NWListener(using: parameters)
            self.listener = listener
            var reported = false
            listener.stateUpdateHandler = { state in
                guard !reported else { return }
                switch state {
                case .ready:
                    reported = true
                    DispatchQueue.main.async { completion(.success(Self.origin)) }
                case .failed(let error), .waiting(let error):
                    reported = true
                    listener.cancel()
                    DispatchQueue.main.async { completion(.failure(error)) }
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
    }

    func stop() {
        listener?.cancel()
        queue.async { [self] in
            for connection in connections.values { connection.cancel() }
            connections.removeAll()
        }
    }

    private func accept(_ connection: NWConnection) {
        let id = UUID()
        connections[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            if case .cancelled = state { self?.connections.removeValue(forKey: id) }
            if case .failed = state { connection.cancel() }
        }
        connection.start(queue: queue)
        // Limit idle/incomplete HTTP requests without extending an application's privileges.
        queue.asyncAfter(deadline: .now() + 10) { [weak self] in self?.connections[id]?.cancel() }
        receive(connection, accumulated: Data())
    }

    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            let request = accumulated + (data ?? Data())
            guard error == nil, request.count <= 16_384 else { connection.cancel(); return }
            if request.range(of: Data("\r\n\r\n".utf8)) != nil {
                let response = self.files.response(to: request)
                connection.send(content: response.bytes, completion: .contentProcessed { _ in connection.cancel() })
            } else if complete { connection.cancel() }
            else { self.receive(connection, accumulated: request) }
        }
    }
}
