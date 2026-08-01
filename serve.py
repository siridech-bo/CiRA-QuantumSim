#!/usr/bin/env python3
"""Static dev server with caching DISABLED.

Use this instead of `python -m http.server` while developing. The default
`http.server` sends no Cache-Control header, so Chrome heuristically caches
JS/CSS modules and can run a STALE mix (e.g. new main.js + old scene.js) —
which shows up as "the molecule changes but the display doesn't". This server
sends `no-store` on every response, so the browser always fetches fresh files.

    python serve.py [port]        # default port 8000

Then open http://localhost:8000/  (a normal reload now always loads fresh code).
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Quieter logging (one line per request is fine).
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving http://localhost:{port}/  (caching DISABLED — Ctrl+C to stop)")
    try:
        HTTPServer(("", port), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
