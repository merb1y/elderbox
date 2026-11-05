# -*- coding: utf-8 -*-
"""
Elderbox — masaüstü kabuğu.

Arayüzü ve içerik proxy'sini yerel bir HTTP sunucusu olarak arka planda
çalıştırır, gömülü CloudStream altyapısını (BridgeServer, 127.0.0.1:8765)
otomatik olarak başlatır ve aynı işlem içinde pywebview (Edge WebView2)
penceresi açar.
"""
import atexit
import importlib.util
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import zipfile

BASE_PORT = 8642
BRIDGE_HEALTH = "http://127.0.0.1:8765/api/health"
BRIDGE_CACHE_VERSION = "v2"

_BRIDGE_LOCK = threading.Lock()
_BRIDGE_PROC = None


def bridge_alive(timeout: float = 1.5) -> bool:
    """CloudStream BridgeServer (8765) ayakta mı?"""
    try:
        with urllib.request.urlopen(BRIDGE_HEALTH, timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def _is_valid_bridge_dir(path: str) -> bool:
    if not path or not os.path.isdir(path):
        return False
    java_exe = os.path.join(path, "jre", "bin", "java.exe")
    lib_dir = os.path.join(path, "lib")
    return os.path.isfile(java_exe) and os.path.isdir(lib_dir)


def _locate_or_extract_bridge() -> str:
    """Gömülü cs-bridge klasörünü bulur; tek-dosya .exe içinde zip olarak
    paketlenmişse ilk çalışmada %LOCALAPPDATA%\\Elderbox altına çıkarır."""
    exe_dir = (
        os.path.dirname(sys.executable)
        if getattr(sys, "frozen", False)
        else os.path.dirname(os.path.abspath(__file__))
    )
    meipass = getattr(sys, "_MEIPASS", None)

    # 1) Doğrudan klasör adayları (Setup kurulumu, Portable klasörü veya geliştirme ortamı)
    candidates = [
        os.path.join(exe_dir, "cs-bridge"),
        os.path.join(os.path.dirname(exe_dir), "cs-bridge"),
        os.path.join(exe_dir, "desktop", "cs-bridge"),
    ]
    if meipass:
        candidates.append(os.path.join(meipass, "cs-bridge"))

    for cand in candidates:
        if _is_valid_bridge_dir(cand):
            return cand

    # 2) Tek-dosya Elderbox.exe içinde gömülü cs-bridge.zip → %LOCALAPPDATA%\Elderbox\cs-bridge-v2
    local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    cache_dir = os.path.join(local_app_data, "Elderbox", f"cs-bridge-{BRIDGE_CACHE_VERSION}")
    ready_flag = os.path.join(cache_dir, ".ready")
    if os.path.isfile(ready_flag) and _is_valid_bridge_dir(cache_dir):
        return cache_dir

    zip_candidates = []
    if meipass:
        zip_candidates.append(os.path.join(meipass, "cs-bridge.zip"))
    zip_candidates.extend([
        os.path.join(exe_dir, "cs-bridge.zip"),
        os.path.join(exe_dir, "desktop", "cs-bridge.zip"),
    ])

    for zpath in zip_candidates:
        if os.path.isfile(zpath):
            try:
                if os.path.isdir(cache_dir):
                    shutil.rmtree(cache_dir, ignore_errors=True)
                os.makedirs(cache_dir, exist_ok=True)
                with zipfile.ZipFile(zpath, "r") as zf:
                    zf.extractall(cache_dir)
                if _is_valid_bridge_dir(cache_dir):
                    with open(ready_flag, "w", encoding="utf-8") as f:
                        f.write("ok")
                    return cache_dir
            except Exception:
                continue

    return ""


def start_bridge(wait_seconds: float = 6.0) -> str:
    """Gömülü CloudStream BridgeServer'ı arka planda sessizce başlatır."""
    global _BRIDGE_PROC
    if bridge_alive():
        return "running"

    with _BRIDGE_LOCK:
        if bridge_alive():
            return "running"

        bridge_dir = _locate_or_extract_bridge()
        if not bridge_dir:
            return ""

        javaw = os.path.join(bridge_dir, "jre", "bin", "javaw.exe")
        java = javaw if os.path.isfile(javaw) else os.path.join(bridge_dir, "jre", "bin", "java.exe")
        lib_glob = os.path.join(bridge_dir, "lib", "*")

        cmd = [
            java,
            "-XX:+UnlockDiagnosticVMOptions",
            "-XX:-BytecodeVerificationRemote",
            "-Xmx1G",
            "-cp",
            lib_glob,
            "com.lagradost.cloudstream4.BridgeServerKt",
        ]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if os.name == "nt" else 0
        try:
            _BRIDGE_PROC = subprocess.Popen(
                cmd,
                cwd=bridge_dir,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=flags,
                close_fds=True,
            )
        except Exception:
            return ""

    deadline = time.time() + max(0.0, wait_seconds)
    while time.time() < deadline:
        if bridge_alive(timeout=0.5):
            return bridge_dir
        time.sleep(0.15)
    return bridge_dir


def stop_bridge() -> None:
    """Uygulama kapanırken kendi başlattığımız köprü sürecini sonlandır."""
    global _BRIDGE_PROC
    proc = _BRIDGE_PROC
    _BRIDGE_PROC = None
    if proc is not None:
        try:
            proc.terminate()
        except Exception:
            pass


atexit.register(stop_bridge)


def resource_dir() -> str:
    """Arayüz dosyalarının (index.html, css, js, assets) olduğu klasör."""
    if getattr(sys, "frozen", False):  # PyInstaller paketi
        return os.path.join(sys._MEIPASS, "ui")
    # Geliştirme ortamında desktop/ klasörünün bir üstü
    here = os.path.dirname(os.path.abspath(__file__))
    if os.path.isfile(os.path.join(here, "index.html")):
        return here
    return os.path.dirname(here)


def load_server_module(ui_dir: str):
    """server.py'ı kaynak klasöründen yükle (ROOT doğru hesaplanır)."""
    spec = importlib.util.spec_from_file_location(
        "elderbox_server", os.path.join(ui_dir, "server.py")
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["elderbox_server"] = mod
    spec.loader.exec_module(mod)
    return mod


def pick_port() -> int:
    """--port / Elderbox_PORT varsa onu, yoksa sabit 8642'den başlayan boş portu seç."""
    if "--port" in sys.argv:
        i = sys.argv.index("--port")
        if i + 1 < len(sys.argv):
            try:
                return int(sys.argv[i + 1])
            except ValueError:
                pass
    env = os.environ.get("Elderbox_PORT")
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
    return BASE_PORT


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

    def bridge_status(self) -> bool:
        return bridge_alive()

    def start_bridge(self) -> str:
        """Gömülü CloudStream altyapısını başlat."""
        return start_bridge(wait_seconds=8.0)

    def close(self) -> None:
        stop_bridge()
        self._win.destroy()


def main() -> None:
    ui_dir = resource_dir()
    server = load_server_module(ui_dir)

    port = pick_port()
    httpd = server.ThreadingHTTPServer(("127.0.0.1", port), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    # Gömülü CloudStream altyapısını başlat; pencere açılmadan önce
    # köprünün dinlemeye geçmesi için kısa süre bekle (genelde ~1 sn sürer)
    if not bridge_alive(timeout=0.4):
        t = threading.Thread(target=start_bridge, kwargs={"wait_seconds": 15.0}, daemon=True)
        t.start()
        t.join(timeout=2.5)

    import webview

    api = WindowApi()
    win = webview.create_window(
        "Elderbox",
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
        stop_bridge()
        httpd.shutdown()


if __name__ == "__main__":
    main()
