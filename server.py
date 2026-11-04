# -*- coding: utf-8 -*-
"""
Geliştirme köprü sunucusu — arayüz + sunucu-taraflı içerik proxy'si.

Statik dosyaları sunar ve /csproxy üzerinden sağlayıcı sitelerini
sunucu tarafından çeker (tarayıcı CORS engeline takılmaz). Masaüstü
altyapısı (JVM backend) bağlandığında bu proxy'nin yerini
window.CloudStreamDesktop köprüsü alır.
"""
import urllib.request
import urllib.parse
import os
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("[srv] %s\n" % (fmt % args))

    # CORS: aynı kaynak üzerinden çalışıyoruz, yine de açıklayıcı başlıklar
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/csproxy":
            self._proxy(parsed)
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
    print(f"köprü sunucusu: http://localhost:{port}  (proxy: /csproxy?url=...)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
