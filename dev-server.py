# Дев-сервер с запретом кэширования: браузер всегда берёт свежий код.
# Запуск: python dev-server.py (порт 8123)
import http.server
import socketserver


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass  # без спама в консоль


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8123), NoCacheHandler) as httpd:
    print("dev-server: http://127.0.0.1:8123 (no-cache)")
    httpd.serve_forever()
