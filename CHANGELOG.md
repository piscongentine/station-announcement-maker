# 📋 Update log

Every version of Station Announcement Maker, newest first. Each one stays downloadable.

| Version | Released | Download | Release page |
|---|---|---|---|
| **1.1.6** (latest) | 27 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.6.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.6/Station-Announcement-Maker-Setup-1.1.6.exe) | [v1.1.6](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.6) |
| 1.1.5 | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.5.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.5/Station-Announcement-Maker-Setup-1.1.5.exe) | [v1.1.5](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.5) |
| 1.1.4 | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.4.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.4/Station-Announcement-Maker-Setup-1.1.4.exe) | [v1.1.4](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.4) |
| 1.1.3 | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.3.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.3/Station-Announcement-Maker-Setup-1.1.3.exe) | [v1.1.3](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.3) |
| 1.1.2 | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.2.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.2/Station-Announcement-Maker-Setup-1.1.2.exe) | [v1.1.2](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.2) |
| 1.1.1 | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.1.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.1/Station-Announcement-Maker-Setup-1.1.1.exe) | [v1.1.1](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.1) |
| 1.1.0 | 26 Nov 2026 | [Station-Announcement-Maker-Setup-1.1.0.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.0/Station-Announcement-Maker-Setup-1.1.0.exe) | [v1.1.0](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.0) |
| 1.0.0 | 25 Nov 2026 | [Station-Announcement-Maker-Setup-1.0.0.exe](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.0.0/Station-Announcement-Maker-Setup-1.0.0.exe) | [v1.0.0](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.0.0) |

Always the newest: **[Station-Announcement-Maker-Setup.exe](https://github.com/piscongentine/station-announcement-maker/releases/latest/download/Station-Announcement-Maker-Setup.exe)**. Setup updates an installed copy in place, and your settings are kept.

---

## 1.1.6 · 27 Nov 2026

[⬇️ Download 1.1.6](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.6/Station-Announcement-Maker-Setup-1.1.6.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.6)

### Improved: Check for updates
- **Check for updates** (About and Help & Report) now asks GitHub for the latest version and compares it with yours, number by number (1.1.10 is newer than 1.1.9).
- **Already up to date:** a message says *"You have the latest version"*, and GitHub is **not** opened.
- **Newer version on GitHub:** a message shows both versions and the release page opens, so you can download the new setup.
- **No internet:** a message says GitHub could not be reached; nothing opens.
- While checking, the button's icon spins and the button can't be pressed twice.

---

## 1.1.5 · 26 Nov 2026

[⬇️ Download 1.1.5](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.5/Station-Announcement-Maker-Setup-1.1.5.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.5)

### Fixed: choosing TSRE (reported by a user)
- **Settings → TSRE executable** now opens a normal Windows *Open* window that shows `.exe` files, so you pick the TSRE program itself. Before, it asked for a folder and assumed the file was called `TSRE5.exe`, so a renamed TSRE (e.g. `TSRE5_v0.7.exe`) was never found unless you renamed it.
- **Auto-detect:** with nothing chosen, the app finds any `TSRE*.exe` in `C:\OR\tsre` and in `tsre` / `TSRE5` / `TSRE` inside your MSTS / OR folder, preferring `TSRE5.exe`, then the newest file.
- If the chosen file is moved or deleted, the app falls back to a TSRE in the same folder and the Settings box says when the chosen file is missing.
- New FAQ answer: *My TSRE program is not called TSRE5.exe. How do I set it?*

---

## 1.1.4 · 26 Nov 2026

[⬇️ Download 1.1.4](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.4/Station-Announcement-Maker-Setup-1.1.4.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.4)

### New: FAQ in Help & Report
- **66 answers in 10 categories:**
  - getting started;
  - making announcements;
  - routes & files;
  - 3D Sound Placement;
  - hearing sounds;
  - stations & platforms;
  - saving & safety;
  - TSRE5 & Open Rails;
  - install & updates;
  - troubleshooting.

  Questions real users asked are marked **Asked by a user**.
- **Search as you type.** Short words match whole words, an exact phrase ranks highest, and common problems have extra search words ("no sound", "black screen", "duplicate"…). Matches are highlighted, the best answer opens by itself, and press **/** to jump to the search box.
- **Category chips** with live counts and an **All** view. Help & Report is now split into **FAQ** and **Guide** (the full manual).
- **Didn't find it?** **Ask on GitHub** opens a new issue titled with your question. **Email the developer** opens a mail with your question and the app, Windows and Python versions filled in.
- **Design:** a glass hero with slowly moving colour orbs, a glowing glass search bar, glass chips, animated accordion cards with a gradient edge when open, and an "Ask us" card with a rotating gradient border. Works in the dark and light themes and honours Reduced motion.
- **Deep link:** `#help&q=no sound` opens the FAQ already searched.

---

## 1.1.3 · 26 Nov 2026

[⬇️ Download 1.1.3](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.3/Station-Announcement-Maker-Setup-1.1.3.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.3)

### Fixed
- **Route sound stayed silent in Map view and from high up.** Distance was measured from the camera, which sits 260 m up in 3D and 900 m up in Map view, so announcements that play within 500 m never started.
  - The route is now heard **from the ground under the camera** by default, as if you stood there. A cyan ring marks the spot.
  - **Hear from the camera** is still there and matches how Open Rails measures.

### New
- **▶ Play** on the selected sound: plays its own `.wav` straight away, at any distance, with or without Route sound.
- **"Nothing in range" hint:** when Route sound is on and nothing plays, the bottom bar names the nearest sound, how far it is, and the distance it plays within.
- **Clearer selection:** a pulsing amber ring now surrounds the selected sound, together with its amber marker, label and list bar.

---

## 1.1.2 · 26 Nov 2026

[⬇️ Download 1.1.2](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.2/Station-Announcement-Maker-Setup-1.1.2.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.2)

### Changed
- **Shaded platforms.** Platform boxes are filled at **30 % opacity**, white, or amber for the selected station. The border stays on top, and the track and sounds stay visible through the fill.
- **Glass dropdowns.** Every dropdown in the app, plus the File / View / Help menus, now opens as a frosted-glass panel with blur, a gradient highlight on the current choice and a smooth open/close, in both themes.

### Safety
- The 3D editor never writes into a compressed or binary `.ws` world sound file. Such a tile is skipped with a message, and you can edit it in TSRE5 instead.

### Checked on every installed route
The 3D editor was checked on Bengal V5, Cal, Del, RailIndia, THE IMPERIAL INDIAN CORRIDOR and au_great_zig_zag. All six load with their stations, platforms, placed sounds, track-sound regions and terrain.

---

## 1.1.1 · 26 Nov 2026

[⬇️ Download 1.1.1](https://github.com/piscongentine/station-announcement-maker/releases/download/v1.1.1/Station-Announcement-Maker-Setup-1.1.1.exe) · [Release page](https://github.com/piscongentine/station-announcement-maker/releases/tag/v1.1.1)

### New
- **Platform markers, Track Viewer style.**
  - Every platform in the route's `.tdb` is drawn in the 3D and Map views as an empty rectangular box with a border. It runs between its two platform markers, which are paired through `PlatformTrItemData`.
  - Each platform is labelled like the Track Viewer: **NAIHATI JUNCTION PF1** with **PLATFORM** written under it. Bengal V5 shows 528 platforms.
  - Clicking a platform label selects its station; that station's platforms turn amber.
- **Tidier labels.** Station, platform and sound labels now slide aside instead of covering each other. The selected sound always keeps its place.

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
