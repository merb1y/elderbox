# -*- coding: utf-8 -*-
"""
ELDERFLIX — masaüstü kabuğu.

Arayüzü ve içerik proxy'sini yerel bir HTTP sunucusu olarak arka planda
çalıştırır, aynı işlem içinde pywebview (Edge WebView2) penceresi açar.
Pencere çerçevesizdir; küçültme, büyütme ve kapatma düğmelerinin kendisi
arayüzün navbar'ındadır (window.pywebview.api üzerinden buraya bağlanır).

Kalıcılık: depolar/kanallar/geçmiş localStorage'da tutulur ve localStorage
origin'e (protokol+host+port) bağlıdır. Bu yüzden port HER AÇILIŞTA AYNI
olmalı — aksi hâlde her başlangıçta depolar sıfırlanır. Varsayılan port
8642'dir; meşgulse sıradaki birkaç port denenir.

Kullanım:
    Elderflix.exe                 → 8642 portunda başlar (meşgulse sıradaki)
    Elderflix.exe --port 8799     → belirli portta (test/otomasyon için)
    ELDERFLIX_PORT=8799           → ortam değişkeni ile port
"""
import importlib.util
import os
import socket
import sys
import threading

BASE_PORT = 8642


def resource_dir() -> str:
    """Arayüz dosyalarının (index.html, css, js, assets) olduğu klasör."""
    if getattr(sys, "frozen", False):  # PyInstaller paketi
        return os.path.join(sys._MEIPASS, "ui")
    return os.path.dirname(os.path.abspath(__file__))


def load_server_module(ui_dir: str):
    """server.py'ı kaynak klasöründen yükle (ROOT doğru hesaplanır)."""
    spec = importlib.util.spec_from_file_location(
        "elderflix_server", os.path.join(ui_dir, "server.py")
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["elderflix_server"] = mod
    spec.loader.exec_module(mod)
    return mod


def pick_port() -> int:
    """--port / ELDERFLIX_PORT varsa onu, yoksa sabit 8642'den başlayan boş portu seç."""
    if "--port" in sys.argv:
        i = sys.argv.index("--port")
        if i + 1 < len(sys.argv):
            try:
                return int(sys.argv[i + 1])
            except ValueError:
                pass
    env = os.environ.get("ELDERFLIX_PORT")
    if env and env.isdigit():
        return int(env)
    # Sabit port: localStorage origin'i her açılışta aynı kalsın
    for p in range(BASE_PORT, BASE_PORT + 11):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", p))
            return p
        except OSError:
            continue
    return BASE_PORT  # son çare — bu porta bağlanmayı dener


class WindowApi:
    """Arayüzdeki pencere düğmelerinin çağırdığı köprü."""

    def __init__(self) -> None:
        self._win = None
        self._maxed = False

    def attach(self, win) -> None:
        self._win = win

    def minimize(self) -> None:
        self._win.minimize()

    def toggle_maximize(self) -> None:
        if self._maxed:
            self._win.restore()
            self._maxed = False
        else:
            self._win.maximize()
            self._maxed = True
        try:
            self._win.evaluate_js(
                "window.dispatchEvent(new CustomEvent('win-maximize',"
                f"{{detail:{str(self._maxed).lower()}}})) "
            )
        except Exception:
            pass

    def resize_to(self, width: int, height: int) -> None:
        """Kenar tutamaçlarından sürükleme ile pencereyi boyutlandır."""
        try:
            self._win.resize(max(960, int(width)), max(600, int(height)))
        except Exception:
            pass

    def close(self) -> None:
        self._win.destroy()


def main() -> None:
    ui_dir = resource_dir()
    server = load_server_module(ui_dir)

    port = pick_port()
    httpd = server.ThreadingHTTPServer(("127.0.0.1", port), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    import webview

    api = WindowApi()
    win = webview.create_window(
        "ELDERFLIX",
        f"http://127.0.0.1:{port}/",
        width=1400,
        height=820,
        min_size=(960, 600),
        background_color="#141414",
        frameless=True,   # başlık çubuğu yok
        easy_drag=False,  # taşıma yalnızca navbar'daki sürükleme bölgesinden
        js_api=api,
    )
    api.attach(win)
    try:
        webview.start()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
