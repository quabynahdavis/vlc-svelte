#!/usr/bin/env python3
"""Throwaway probe: which URL a WebKitGTK page on http:// can fetch."""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
gi.require_version("Soup", "3.0")
from gi.repository import Gio, GLib, Gtk, Soup, WebKit2

HITS = []
MODE = sys.argv[1] if len(sys.argv) > 1 else "cors-acao"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/probe"):
            body = b"""<!doctype html><meta charset=utf-8>
<script>
const urls = [
  'vlcframe://localhost/frame',
  'http://vlcframe.localhost/frame',
  'https://vlcframe.localhost/frame',
  'vlcaudio://localhost/pcm',
  'http://vlcaudio.localhost/pcm'
];
(async () => {
  const results = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      results.push({ url, ok: true, status: response.status, text: text.slice(0, 80) });
    } catch (error) {
      results.push({ url, ok: false, error: String(error) });
    }
  }
  document.title = 'PROBE ' + JSON.stringify(results);
})();
</script>
"""
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        return


def on_scheme(request):
    uri = request.get_uri()
    HITS.append(uri)
    data = f"HIT {uri}".encode()
    stream = Gio.MemoryInputStream.new_from_bytes(GLib.Bytes.new(data))
    if MODE == "finish-only":
        request.finish(stream, len(data), "text/plain")
        return
    response = WebKit2.URISchemeResponse.new(stream, len(data))
    response.set_status(200, "OK")
    response.set_content_type("text/plain")
    headers = Soup.MessageHeaders.new(Soup.MessageHeadersType.RESPONSE)
    origin = "*" if MODE != "exact-origin" else "http://127.0.0.1"
    headers.append("Access-Control-Allow-Origin", origin)
    headers.append("Cache-Control", "no-store")
    response.set_http_headers(headers)
    request.finish_with_response(response)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()

    context = WebKit2.WebContext()
    security = context.get_security_manager()
    for scheme in ("vlcframe", "vlcaudio"):
        security.register_uri_scheme_as_secure(scheme)
        if MODE != "no-cors":
            security.register_uri_scheme_as_cors_enabled(scheme)
        context.register_uri_scheme(scheme, on_scheme)

    webview = WebKit2.WebView.new_with_context(context)
    webview.get_settings().set_enable_write_console_messages_to_stdout(True)
    window = Gtk.Window()
    window.add(webview)
    window.show_all()

    done = {"value": None}

    def on_title(view, _pspec):
        title = view.get_title() or ""
        if title.startswith("PROBE "):
            done["value"] = title[len("PROBE ") :]
            Gtk.main_quit()

    webview.connect("notify::title", on_title)
    webview.load_uri(f"http://127.0.0.1:{port}/probe")
    GLib.timeout_add_seconds(8, Gtk.main_quit)
    Gtk.main()
    print("HITS", json.dumps(HITS))
    print("PAGE", done["value"])
    server.shutdown()


if __name__ == "__main__":
    print("MODE", MODE)
    main()
