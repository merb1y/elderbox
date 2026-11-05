# -*- coding: utf-8 -*-
"""
Köprü sunucusu — arayüz + sunucu-taraflı içerik proxy'si + gömülü CloudStream başlatıcı.

Statik dosyaları sunar, /csproxy üzerinden sağlayıcı akışlarını ve kısaltma
adreslerini çözer, /bridge-start ucuyla gömülü CloudStream (BridgeServer)
altyapısını otomatik olarak ayağa kaldırır.
"""
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
BRIDGE_HEALTH = "http://127.0.0.1:8765/api/health"
_SRV_BRIDGE_LOCK = threading.Lock()


def _bridge_alive(timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(BRIDGE_HEALTH, timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def ensure_local_bridge() -> bool:
    """Port 8765 kapalıysa yanımızdaki gömülü cs-bridge paketini başlatır."""
    if _bridge_alive():
        return True
    with _SRV_BRIDGE_LOCK:
        if _bridge_alive():
            return True
        candidates = [
            os.path.join(ROOT, "desktop", "cs-bridge"),
            os.path.join(os.path.dirname(ROOT), "cs-bridge"),
            os.path.join(os.path.dirname(ROOT), "cs-desktop-src", "desktopApp", "build", "bridge-dist"),
            os.path.join(os.environ.get("LOCALAPPDATA") or "", "Elderbox", "cs-bridge-v2"),
        ]
        for bdir in candidates:
            java_exe = os.path.join(bdir, "jre", "bin", "javaw.exe")
            if not os.path.isfile(java_exe):
                java_exe = os.path.join(bdir, "jre", "bin", "java.exe")
            lib_dir = os.path.join(bdir, "lib")
            if os.path.isfile(java_exe) and os.path.isdir(lib_dir):
                flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000) if os.name == "nt" else 0
                try:
                    subprocess.Popen(
                        [
                            java_exe,
                            "-XX:+UnlockDiagnosticVMOptions",
                            "-XX:-BytecodeVerificationRemote",
                            "-Xmx1G",
                            "-cp",
                            os.path.join(lib_dir, "*"),
                            "com.lagradost.cloudstream4.BridgeServerKt",
                        ],
                        cwd=bdir,
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        creationflags=flags,
                        close_fds=True,
                    )
                    for _ in range(25):
                        if _bridge_alive(0.4):
                            return True
                        time.sleep(0.2)
                    return True
                except Exception:
                    continue
    return _bridge_alive()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("[srv] %s\n" % (fmt % args))

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/csproxy":
            self._proxy(parsed)
            return
        if parsed.path == "/bridge-start":
            ok = ensure_local_bridge()
            self._json(200, {"ok": ok})
            return
        if parsed.path == "/health":
            body = b'{"ok":true,"bridge":"dev"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def _proxy(self, parsed):
        import re
        from urllib.parse import urljoin
        qs = urllib.parse.parse_qs(parsed.query)
        target = (qs.get("url") or [""])[0]
        if not target.startswith(("http://", "https://")):
            self._json(400, {"error": "geçersiz url"})
            return
        referer = (qs.get("referer") or [""])[0] or target
        req = urllib.request.Request(target, headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Accept-Language": "tr,en;q=0.8",
            "Referer": referer,
            "Origin": referer.rstrip("/"),
        })
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                # resolve=1: yalnızca yönlendirmeyi çöz, nihai URL'yi dön (kısa kod desteği)
                if (qs.get("resolve") or [""])[0] == "1":
                    self._json(200, {"url": r.geturl()})
                    return
                data = r.read(8 * 1024 * 1024)
                ctype = r.headers.get("Content-Type", "application/octet-stream")
        except Exception as e:  # noqa: BLE001 — köprüde her hata JSON döner
            self._json(502, {"error": str(e)})
            return

        # HLS çalma listeleri: segment/alt-playlist adreslerini köprüye çevir,
        # yoksa tarayıcı göreli adresleri çözemez.
        base = target.split("?")[0]
        if "mpegurl" in ctype.lower() or base.endswith(".m3u8"):
            referer_q = urllib.parse.quote(referer, safe="")

            def prox(u):
                return "/csproxy?url=" + urllib.parse.quote(urljoin(base, u), safe="") + "&referer=" + referer_q

            lines = []
            for line in data.decode("utf-8", "replace").splitlines():
                s = line.strip()
                if not s:
                    lines.append(line)
                elif s.startswith("#"):
                    m = re.search(r'URI="([^"]+)"', s)
                    if m and not m.group(1).startswith("data:"):
                        s = s.replace(m.group(1), prox(m.group(1)))
                    lines.append(s)
                else:
                    lines.append(prox(s))
            data = "\n".join(lines).encode("utf-8")
            ctype = "application/vnd.apple.mpegurl"

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        import json
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    threading.Thread(target=ensure_local_bridge, daemon=True).start()
    print(f"köprü sunucusu: http://localhost:{port}  (proxy: /csproxy?url=...)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
