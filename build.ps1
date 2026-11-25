# Builds "Station Announcement Maker.exe" (the launcher) with the C# compiler that ships with
# Windows (.NET Framework 4.8). The exe goes in the project folder next to app\ and ui\.
# Optional: -Shortcut also (re)creates the desktop shortcut.
param([switch]$Shortcut)
$ErrorActionPreference = 'Stop'
$fw  = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$exe = Join-Path $PSScriptRoot 'Station Announcement Maker.exe'
& "$fw\csc.exe" /nologo /codepage:65001 /target:winexe /platform:anycpu /optimize+ /debug- `
    "/out:$exe" "/win32icon:$(Join-Path $PSScriptRoot 'assets\app.ico')" `
    /r:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'launcher\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
Get-Item $exe | Select-Object FullName, Length, LastWriteTime

if ($Shortcut) {
    $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Station Announcement Maker.lnk'
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($lnk)
    $s.TargetPath = $exe
    $s.WorkingDirectory = $PSScriptRoot
    $s.IconLocation = "$exe,0"
    $s.Description = 'Station Announcement Maker - MSTS / TSRE5 / Open Rails'
    $s.Save()
    "Shortcut: $lnk"
}
