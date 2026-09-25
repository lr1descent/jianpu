import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: StaticServer?
    private var roundActive = false
    private var confirmedExit = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = NSAppearance(named: .aqua)
        buildMenu()
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("web"),
              FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
            showFailure("应用资源不完整", detail: "缺少内置页面，请重新解压完整的简谱唱名应用。")
            return
        }
        server = StaticServer(root: root)
        server!.start { [weak self] result in
            switch result {
            case .success(let url): self?.openWindow(url: url)
            case .failure(let error): self?.showFailure("无法启动简谱唱名", detail: "本机端口 \(StaticServer.port) 无法使用。请先退出已打开的简谱唱名，或关闭占用该端口的程序，再重新打开。\n\n\(error.localizedDescription)")
            }
        }
    }

    private func openWindow(url: URL) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.tabFocusesLinks = true
        configuration.userContentController.add(self, name: "roundState")
        // The native shell only observes whether the existing quiz view is active.
        // Scoring and session state continue to be owned by the web application.
        configuration.userContentController.addUserScript(WKUserScript(source: """
            (() => {
                const report = () => window.webkit.messageHandlers.roundState.postMessage(document.body.classList.contains('is-quiz'));
                new MutationObserver(report).observe(document.body, {attributes: true, attributeFilter: ['class']});
                report();
            })();
            """, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1080, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "简谱唱名"
        window.minSize = NSSize(width: 340, height: 420)
        window.contentView = webView
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.load(URLRequest(url: url))
    }

    private func buildMenu() {
        let bar = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于简谱唱名", action: #selector(showAbout), keyEquivalent: "").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏简谱唱名", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "显示全部", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出简谱唱名", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        bar.addItem(appItem)

        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        let edit = NSMenu(title: "编辑")
        edit.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        bar.addItem(editItem)

        let viewItem = NSMenuItem(title: "显示", action: nil, keyEquivalent: "")
        let view = NSMenu(title: "显示")
        view.addItem(withTitle: "放大", action: #selector(zoomIn), keyEquivalent: "+").target = self
        view.addItem(withTitle: "缩小", action: #selector(zoomOut), keyEquivalent: "-").target = self
        view.addItem(withTitle: "实际大小", action: #selector(resetZoom), keyEquivalent: "0").target = self
        viewItem.submenu = view
        bar.addItem(viewItem)

        let windowItem = NSMenuItem(title: "窗口", action: nil, keyEquivalent: "")
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        bar.addItem(windowItem)
        NSApp.mainMenu = bar
        NSApp.windowsMenu = windowMenu
    }

    @objc private func showAbout() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "简谱唱名", .applicationVersion: "1.2.0",
            .credits: NSAttributedString(string: "看数字，听钢琴，选唱名。\n\n钢琴：Salamander Grand Piano\nAlexander Holm · CC BY 3.0\n采样和许可随应用提供。")
        ])
    }
    @objc private func zoomIn() { if let webView { webView.pageZoom = min(2, webView.pageZoom + 0.25) } }
    @objc private func zoomOut() { if let webView { webView.pageZoom = max(0.75, webView.pageZoom - 0.25) } }
    @objc private func resetZoom() { webView?.pageZoom = 1 }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "roundState", message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == "127.0.0.1", message.frameInfo.securityOrigin.port == Int(StaticServer.port),
              let active = message.body as? Bool else { return }
        roundActive = active
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let local = url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == Int(StaticServer.port)
        decisionHandler(local ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure("页面未能加载", detail: error.localizedDescription)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        roundActive = false
        let alert = NSAlert()
        alert.messageText = "页面进程已停止"
        alert.informativeText = "进行中的轮次无法恢复，已结束的记录仍保存在此应用。点击重新打开回到首页。"
        alert.addButton(withTitle: "重新打开")
        alert.runModal()
        webView.reload()
    }

    func applicationDidResignActive(_ notification: Notification) { pauseRound() }
    func applicationDidHide(_ notification: Notification) { pauseRound() }
    func windowDidMiniaturize(_ notification: Notification) { pauseRound() }
    private func pauseRound() {
        guard let webView else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('trainer:background'))") { _, error in
            if let error { NSLog("Could not notify quiz of background state: %@", error.localizedDescription) }
        }
    }

    private func mayExit() -> Bool {
        if confirmedExit || !roundActive { return true }
        let alert = NSAlert()
        alert.messageText = "本轮还未结束"
        alert.informativeText = "直接退出不会保存进行中的轮次。已完成的记录不受影响。也可以回到练习，先点击结束本轮。"
        alert.addButton(withTitle: "继续练习")
        alert.addButton(withTitle: "退出应用")
        confirmedExit = alert.runModal() == .alertSecondButtonReturn
        return confirmedExit
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { mayExit() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply { mayExit() ? .terminateNow : .terminateCancel }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { server?.stop() }
    private func showFailure(_ title: String, detail: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = detail
        alert.addButton(withTitle: "退出")
        alert.runModal()
        confirmedExit = true
        NSApp.terminate(nil)
    }
}

@main
struct JianpuApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.setActivationPolicy(.regular)
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
