; ELDERFLIX — Inno Setup kurulum betiği
; Derleme: ISCC.exe Elderflix.iss

#define MyAppName "ELDERFLIX"
#define MyAppVersion "1.0.0"
#define MyAppExeName "Elderflix.exe"

[Setup]
AppId={{5B2E9C41-7A6D-4E8F-9C3A-ELDERFLIX100}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=ELDERFLIX
DefaultDirName={autopf}\Elderflix
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir=installer
OutputBaseFilename=Elderflix-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
SetupIconFile=app.ico

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Files]
Source: "dist\Elderflix.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{#MyAppName} Kaldır"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Masaüstü kısayolu oluştur"; GroupDescription: "Ek görevler:"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{#MyAppName} uygulamasını başlat"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\Elderflix.exe"
