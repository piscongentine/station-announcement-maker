# Builds the launcher and the installer:
#   dist\Station-Announcement-Maker-Setup-<version>.exe  and  dist\Station-Announcement-Maker-Setup.exe
# (the same file under a fixed name, so the GitHub "latest" download link always gets the newest version).
# Needs: Windows 10/11, Python + Pillow (wizard art) and Inno Setup 6.7 (jrsoftware.org).
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
python (Join-Path $PSScriptRoot 'installer\make_wizard_images.py') | Out-Null
$iss = Join-Path $PSScriptRoot 'installer\StationAnnouncementMaker.iss'
$version = ([regex]::Match((Get-Content $iss -Raw), '#define AppVersion "([^"]+)"')).Groups[1].Value
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 not found. Install it from https://jrsoftware.org/isinfo.php" }
& $iscc /Q $iss
if ($LASTEXITCODE -ne 0) { throw "Installer build failed" }
$setup = Join-Path $PSScriptRoot "dist\Station-Announcement-Maker-Setup-$version.exe"
Copy-Item $setup (Join-Path $PSScriptRoot 'dist\Station-Announcement-Maker-Setup.exe') -Force
Get-Item $setup, (Join-Path $PSScriptRoot 'dist\Station-Announcement-Maker-Setup.exe') | Select-Object Name, Length
