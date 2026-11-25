# 📋 Update log

Every version of Station Announcement Maker, newest first. Each one stays downloadable.

| Version | Released | Download | Release page |
|---|---|---|---|
| **1.0.0** (latest) | 25 Nov 2026 | [Station-Announcement-Maker-Setup-1.0.0.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.0.0/Station-Announcement-Maker-Setup-1.0.0.exe) | [v1.0.0](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.0.0) |

Always the newest: **[Station-Announcement-Maker-Setup.exe](https://github.com/piscongentine/station-announcement-maker/releases/latest/download/Station-Announcement-Maker-Setup.exe)**. Setup updates an installed copy in place, and your settings are kept.

---

## 1.0.0 · 25 Nov 2026

[⬇️ Download 1.0.0](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.0.0/Station-Announcement-Maker-Setup-1.0.0.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.0.0)

The first release. Part of **UTILITY TOOLS**.

### Features
- **Single:** drop one recording. MP3, M4A, OGG, FLAC and WAV are converted to a 16-bit PCM WAV that MSTS and Open Rails can play, with a live status badge and a waveform player. The announcement name becomes safe `.wav` / `.sms` file names.
- **Batch:** drop many files at once. Each row has a name field, play/pause and remove, and **Generate All** shows a progress bar.
- **Smart Direct Route Integration:** writes the `.wav` and `.sms` into the route's `SOUND` folder and appends the `ssource.dat` entry, keeping the file's own UTF-16 encoding. It backs up to `ssource.dat.bak` first and shows an animated summary of every file it created.
- **Custom Output Folder:** saves the `.wav` and `.sms` anywhere you choose.
- **Route Announcement Manager:** every `ssource.dat` entry appears as a searchable card with playback and a format check.
  - **Replace Audio** swaps a single `.wav` and keeps the old copy.
  - The manager flags missing `.sms` files, MP3-inside-WAV and 24-bit files that MSTS/OR can't play.
- **Settings:**
  - MSTS/OR folder with a *Verified* badge;
  - 22 050 / 44 100 Hz and mono / stereo;
  - `.sms` distances and volume;
  - the backup toggle and diagnostics;
  - Dark / Light / System theme and Full / Reduced motion.
- **Same-name safety:** existing files are never overwritten without asking. Duplicate names in one batch get `_2`, `_3`, and so on. Names already listed in `ssource.dat` are never added twice.
- **Help:** "Report on GitHub" and a one-click "Email the developer" with version details filled in, plus "Check for updates".

### Setup
- Dark Midnight Rail wizard with an animated system check covering Windows, Microsoft Edge, Python with Tk, the screen, sound output and the MSTS/OR folder.
- If Python is missing, Setup downloads Python 3.14.6 from python.org, checks its signature and installs it for the current user. No administrator rights are needed.
