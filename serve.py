#!/usr/bin/env python3
"""Static dev server with caching DISABLED + a copyright gate on the Library PDFs.

Use this instead of `python -m http.server` while developing. The default
`http.server` sends no Cache-Control header, so Chrome heuristically caches
JS/CSS modules and can run a STALE mix (e.g. new main.js + old scene.js) —
which shows up as "the molecule changes but the display doesn't". This server
sends `no-store` on every response, so the browser always fetches fresh files.

It ALSO blocks direct download of the copyrighted `Library/*.pdf` copies: the
in-app reader (pdf.html) loads a PDF as a subresource fetch via pdf.js, which
the browser marks `Sec-Fetch-Dest: empty`; a direct download (typing the URL,
opening in a new tab, right-click "Save link as", or sharing the link) is a
top-level navigation (`Sec-Fetch-Dest: document`) or carries no same-origin
Referer. We serve the PDF only to the reader and 403 the rest. This is a
DETERRENT against casual redistribution, not cryptographic protection — a
determined user can still extract from the rendered reader.

    python serve.py [port]        # default port 8000

Then open http://localhost:8000/  (a normal reload now always loads fresh code).
"""
import sys
from urllib.parse import unquote
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    # HTTP/1.1 keep-alive so the browser can pipeline the many small module
    # requests a page makes; combined with ThreadingHTTPServer below this keeps
    # a large PDF download from blocking CSS/JS (the "endless spinner" bug).
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # --- copyright gate on Library/*.pdf ------------------------------------
    def _pdf_path(self):
        path = unquote(self.path.split("?", 1)[0]).lower()
        return path.endswith(".pdf") and "/library/" in path

    def _is_reader_fetch(self):
        """True only for the in-app reader's subresource fetch (pdf.js)."""
        dest = self.headers.get("Sec-Fetch-Dest")
        if dest is not None:                       # modern browser → trust Sec-Fetch
            return dest == "empty"
        ref = self.headers.get("Referer", "") or ""    # older browser → same-origin Referer
        host = self.headers.get("Host", "")
        return bool(ref) and host in ref

    def _library_listing(self):
        # block directory listing of Library/ (no enumeration / bulk grab)
        path = unquote(self.path.split("?", 1)[0]).lower().rstrip("/")
        return path.endswith("/library")

    def _gate(self):
        if self._library_listing() or (self._pdf_path() and not self._is_reader_fetch()):
            # NOTE: the reason phrase (2nd arg) goes in the HTTP status line, which
            # must be latin-1 — keep it ASCII. Detail text goes in `explain` (body).
            self.send_error(403, "Direct PDF access is disabled",
                            "Open the paper in the in-app reader (Read + AI copilot) rather than downloading it directly.")
            return True
        return False

    def do_GET(self):
        if self._gate():
            return
        super().do_GET()

    def do_HEAD(self):
        if self._gate():
            return
        super().do_HEAD()

    # Quieter logging (one line per request is fine).
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving http://localhost:{port}/  (caching DISABLED, Library PDFs gated — Ctrl+C to stop)")
    server = ThreadingHTTPServer(("", port), NoCacheHandler)
    server.daemon_threads = True          # don't let in-flight downloads block Ctrl+C
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
