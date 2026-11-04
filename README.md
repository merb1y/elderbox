# Elderbox

CloudStream depoları için Elderbox markalı, sinema akışı görünümünde masaüstü web arayüzü.
Depo/kanal seçimi, ana sayfa akışları, detay modalı, oynatıcı (HLS + altyazı),
izlemeye devam et, kısa kodla depo ekleme ve çerçevesiz masaüstü kabuğu içerir.

## Çalıştırma (geliştirme)

```bash
python server.py          # http://127.0.0.1:8642
```

## Masaüstü uygulaması (exe + kurulum)

Gereksinimler: Python 3.12+, `pip install pywebview pyinstaller`, [Inno Setup 6](https://jrsoftware.org/isinfo.php)

```bash
python -m PyInstaller --onefile --windowed --name Elderbox --icon desktop/app.ico ^
  --add-data "index.html;ui" --add-data "css;ui/css" --add-data "js;ui/js" ^
  --add-data "assets;ui/assets" --add-data "server.py;ui" ^
  --distpath desktop/dist --workpath desktop/build --specpath desktop desktop/desktop.py
ISCC.exe desktop/Elderbox.iss
```

- `desktop/dist/Elderbox.exe` — taşınabilir tek dosya
- `desktop/installer/Elderbox-Setup.exe` — Türkçe kurulum sihirbazı

## Notlar

- Uygulama `http://127.0.0.1:8642` üzerinde çalışır (port sabittir; depolar/kanallar
  localStorage'da saklanır ve origin'in değişmemesi için port her açılışta aynıdır).
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
