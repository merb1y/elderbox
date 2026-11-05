# Elderbox

CloudStream depoları için Elderbox markalı, sinema akışı görünümünde masaüstü uygulaması.
Depo/kanal seçimi, ana sayfa akışları, detay modalı, oynatıcı (HLS + altyazı),
izlemeye devam et, kısa kodla depo ekleme, çerçevesiz masaüstü kabuğu ve **dahili gömülü CloudStream altyapısı** içerir.

## Çalıştırma (geliştirme)

```bash
python server.py          # http://127.0.0.1:8642 (gömülü köprüyü otomatik başlatır)
```

## Masaüstü uygulaması (exe + kurulum)

Gereksinimler: Python 3.12+, `pip install pywebview pyinstaller`, [Inno Setup 6](https://jrsoftware.org/isinfo.php)

```bash
python -m PyInstaller desktop/Elderbox.spec --noconfirm --distpath desktop/dist --workpath desktop/build
ISCC.exe desktop/Elderbox.iss
```

- `desktop/dist/Elderbox.exe` — taşınabilir tek dosya (gömülü CloudStream altyapısı dahil)
- `desktop/installer/Elderbox-Setup.exe` — Türkçe kurulum sihirbazı (gömülü CloudStream altyapısı dahil)
- `desktop/installer/Elderbox-Portable.zip` — taşınabilir arşiv (`Elderbox.exe` + `cs-bridge/`)

## Notlar

- Uygulama `http://127.0.0.1:8642` üzerinde çalışır (port sabittir; depolar/kanallar
  localStorage'da saklanır ve origin'in değişmemesi için port her açılışta aynıdır).
- **Gömülü CloudStream Altyapısı:** CloudStream masaüstü köprüsü (`BridgeServer`, `127.0.0.1:8765`)
  uygulamanın içine gömülü gelir ve Elderbox açıldığında arka planda tamamen otomatik başlatılır.
  Ek bir kurulum veya harici uygulama çalıştırma gerektirmez.
- Kısa kodla depo ekleme: `kullanıcı!depo` (raw.githubusercontent), `!kod` (py.md),
  düz `kod` (py.md / cutt.ly) — boşlukla ayırarak çoklu ekleme yapılabilir.
- İçerik proxy'si (`/csproxy`) sunucu tarafında çalışır; `resolve=1` parametresi
  kısaltma yönlendirmelerini çözer.

## Yasal Uyarı

Elderbox bağımsız, açık kaynak bir arayüz projesidir. Uygulama, **CloudStream** ekosistemindeki
topluluk depolarına ve üçüncü taraf eklentilere arayüz sağlar; kendisi hiçbir video içerik
barındırmaz veya sunmaz.

- Üçüncü taraf depolar, kanallar ve içerikler topluluk tarafından sağlanır; bunların hukuki
  sorumluluğu sağlayıcılarına aittir. **Elderbox hiçbir üçüncü taraf depo, kanal veya
  içerikten sorumlu değildir.**
- Telif hakkı sahiplerinin koşullarına aykırı kullanım kullanıcının kendi sorumluluğundadır.
- Elderbox, CloudStream veya herhangi bir akış sağlayıcıyla bağlantılı değildir.
