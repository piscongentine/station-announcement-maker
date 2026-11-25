# 📋 Update log

Every version of Station Announcement Maker, newest first. Each one stays downloadable.

| Version | Released | Download | Release page |
|---|---|---|---|
| **1.1.0** (latest) | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.0.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.0/Station-Announcement-Maker-Setup-1.1.0.exe) | [v1.1.0](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.0) |
| 1.0.0 | 25 Nov 2026 | [Station-Announcement-Maker-Setup-1.0.0.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.0.0/Station-Announcement-Maker-Setup-1.0.0.exe) | [v1.0.0](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.0.0) |

Always the newest: **[Station-Announcement-Maker-Setup.exe](https://github.com/piscongentine/station-announcement-maker/releases/latest/download/Station-Announcement-Maker-Setup.exe)**. Setup updates an installed copy in place, and your settings are kept.

---

## 1.1.0 · 26 Nov 2026

[⬇️ Download 1.1.0](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.0/Station-Announcement-Maker-Setup-1.1.0.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.0)

### New: 3D Sound Placement
- **See the route in 3D.** The real terrain comes from the route's `TILES`, the track from its `.tdb`, every station from its platforms, and every placed sound from the `WORLD\*.ws` files. Only tiles near the camera are loaded, so very large routes stay smooth; THE IMPERIAL INDIAN CORRIDOR has 31 000 tiles and loads in about 1.5 s.
- **Easy movement.**
  - ↑/↓ (W/S) move forward and back; ←/→ (A/D) move left and right.
  - Q/E rotate; R/F or PgUp/PgDn go up and down; T/G look up and down.
  - +/− and the mouse wheel zoom.
  - **Shift = 2× speed**.
  - Drag to look around **360°**.
  - The same controls are on an on-screen pad, with a 2× button. Speed grows with height above the ground.
- **Map view** (M) is a top-down view for quick travel, with drag to pan. **3D view** (V) returns to the ground.
- **Stations:** names are labelled in the view. Click one, or pick it in the Stations list, to fly there.
- **Pointer node:** click the ground to drop a cyan pointer. It shows the tile, the position in the tile, the exact ground height (from the full-resolution terrain) and the three nearest stations.
- **Place / select / remove:**
  - Place any `ssource.dat` sound at the pointer.
  - Select a sound by clicking it or by its name. The selection is highlighted **amber**, new sounds are **green**, removed ones are crossed out.
  - Remove with the button or the Delete key.
  - Ctrl+Z undoes, Ctrl+S saves.
- **Saving writes the same format TSRE5 writes:** a `Soundsource ( Position / FileName / UiD )` block in the tile's `.ws` file, UTF-16, with the next free UiD. Track sound regions and everything else in the file are left untouched. Each changed file is backed up first.
- **Sound bars:** every sound shows its name, its nearest stations with distances, a live level meter, its state (playing / in range) and an on/off button.
- **Same sound in many places:** a slider steps through every place one sound is used. "Group same sound" shows them together in the list.
- **Filter by area:** pick a station (sorted nearest first) and a radius.
- **Radius rings:** for the selected sound, rings are drawn on the ground at its activation distance, start distance, stop distance and the distance where its volume curve goes silent, all read from its own `.sms`. The panel also lists every trigger in the file.

### New: hear the route
- **Route sound on/off.** Choose **which** sounds play:
  - the placed `ssource.dat` sounds;
  - track sounds from `ttype.dat` (played at each sound region);
  - all of them.

  Choose **how** they play:
  - exactly as the files define;
  - nearest sound only;
  - selected sound only.

  There is also a master volume.
- **Playback follows each `.sms` the way Open Rails reads it:**
  - **Activation and Deactivation** distances decide when a sound wakes up and sleeps.
  - **Triggers** fire when distance or speed crosses their value: `Distance_Dec_Past` / `Distance_Inc_Past`, `Speed_Inc_Past` / `Speed_Dec_Past`, `Initial_Trigger`.
  - **Actions** from the file are applied (`StartLoop`, `ReleaseLoopRelease`, `PlayOneShot`), with the WAV each trigger names.
  - **Volume** follows the `DistanceControlled` or `SpeedControlled` curve and the file's `Volume`.
  - **Direction** is 3D: each sound comes from where it stands.
- **Train speed slider** for track sounds. They are speed-controlled in their files, so you can hear a train pass at 0–160 km/h.

### New: Help & Report tab
- A full guide: getting started, every key and button, what happens when you place, remove and save, how sounds are played, what changes on disk, and graphics tips.
- **Report on GitHub**, a one-click email, and **Check for updates**.
- The editor has **File** (Save, Undo, Reload, Open in TSRE5, Exit editor), **View** and **Help** menus.

### New: graphics check
- Before the window opens, the app checks the graphics drivers:
  - a **dedicated GPU** (NVIDIA / AMD Radeon RX / Intel Arc) with a driver is used for the 3D view;
  - otherwise the **integrated** chip;
  - with no driver at all, software drawing.
- **Settings → Graphics & 3D editor** lets you choose Auto / Dedicated / Integrated. Diagnostics show the chip in use.

### Also
- **Open in TSRE5** (File menu): sets TSRE5's route and start tile in its `settings.txt` (after asking, with a backup and no `//` comments) and starts it.
- The app can no longer share a network port with another program.
- The light theme no longer fades in from dark at start-up.

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
