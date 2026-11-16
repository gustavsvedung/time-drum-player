"""Local dev server: python3 serve.py  ->  http://localhost:5173"""
import functools
import http.server
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 5173


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256  # the app fetches ~190 samples at once


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with Server(("127.0.0.1", PORT), handler) as httpd:
        print(f"time: http://localhost:{PORT}")
        httpd.serve_forever()
