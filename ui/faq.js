/* Station Announcement Maker - FAQ (Help & Report tab). Data + search + accordion. */
(() => {
'use strict';
const CATS = [
  { id: 'start', name: 'Getting started', icon: 'bolt' },
  { id: 'make', name: 'Making announcements', icon: 'horn' },
  { id: 'route', name: 'Routes & files', icon: 'route' },
  { id: '3d', name: '3D Sound Placement', icon: 'cube' },
  { id: 'hear', name: 'Hearing sounds', icon: 'volume' },
  { id: 'platform', name: 'Stations & platforms', icon: 'train' },
  { id: 'save', name: 'Saving & safety', icon: 'shield' },
  { id: 'tsre', name: 'TSRE5 & Open Rails', icon: 'open' },
  { id: 'install', name: 'Install & updates', icon: 'upload' },
  { id: 'fix', name: 'Troubleshooting', icon: 'warn' },
];
const Q = [
  // ---------------- asked by users (from real conversations)
  ['make', 'If a file with the same name is already in the destination, what does the app do?', 'It always asks first. Before writing, it checks the destination for a .wav or .sms with the same name (capital letters don\'t matter). A <b>Files already exist</b> box lists each one: <b>Cancel</b> writes nothing, <b>Overwrite</b> replaces them. The ssource.dat line is never added twice. In a batch, repeated names become <code>_2</code>, <code>_3</code>. <b>Replace Audio</b> also asks and keeps the old wav.', true],
  ['install', 'Is the "Replaced .wav files are kept in …" folder the same for every user?', 'Each user gets their own: <code>%LOCALAPPDATA%\\StationAnnouncementMaker\\replaced</code>, which Windows expands to that person\'s AppData folder. Nothing is shared between users.', true],
  ['tsre', 'Can this app edit routes or make activities like TSRE5?', 'It covers sounds: make announcements, place / select / remove them on the route in 3D, hear them, and save in TSRE5\'s own format. Full route editing and activity making stay in TSRE5 — use <b>File → Open this place in TSRE5</b> to jump there at the same spot.', true],
  ['platform', 'Will the platform boxes and the 3D editor work on all routes?', 'Yes — on any route with a track database (.tdb), WORLD and TILES. Checked on Bengal V5 (528 platforms), Cal (244), Del (157), RailIndia (761), THE IMPERIAL INDIAN CORRIDOR (3 757) and au_great_zig_zag (15). Compressed .ws files are never written.', true],
  ['3d', 'Can I place sounds on the map easily?', 'Yes: Load the route, press <b>M</b> for Map view, find the station (Stations list or its label), click the ground at the platform, pick the sound, <b>Place sound at pointer</b>, <b>Save</b>. Click the new sound to see its rings and press <b>▶ Play</b> to hear it.', true],
  ['hear', 'The sound doesn\'t play when I turn sound on and am near it, or select it.', 'Fixed in 1.1.3. Distance used to be measured from the camera, which sits 260–900 m up, while announcements play within 500 m. Now you hear from the ground under the camera (cyan ring), so it works in Map view too. Selecting a sound alone doesn\'t play it — press <b>▶ Play</b>, or use <b>Listen alone</b> / Route sound.', true],
  ['3d', 'How does the selection change the colour of the selected sound?', 'The selected sound turns <b>amber</b> in four places: its marker (bigger), its label, its bar in the Sounds list and a pulsing amber ring around it. Its radius rings are drawn on the ground too.', true],
  ['hear', 'How do I know the radius of a sound?', 'Select it: the panel shows Activation and Deactivation distance, where it starts and stops playing, where its volume curve goes silent, its volume curve graph and every trigger in its .sms. The same distances are drawn as rings on the ground. All values come from that sound\'s own .sms file.', true],
  ['install', 'Where is the app installed and how do I remove an old copy?', 'Setup installs to <code>%LOCALAPPDATA%\\Programs\\Station Announcement Maker</code> (next to Loco Tester) with Desktop and Start-menu shortcuts. Running a newer Setup updates in place; remove it from Windows Settings → Apps.', true],
  ['fix', 'How do I report a problem or ask something?', 'Help &amp; Report → <b>Ask on GitHub</b> or <b>Email the developer</b> (shwetpurwar0911@gmail.com) — your search text and the app / Windows / Python versions are filled in. The footer has the same two links.', true],

  // ---------------- getting started
  ['start', 'What does Station Announcement Maker do?', 'It turns any recording into a station announcement that MSTS, TSRE5 and Open Rails can use: a 16-bit PCM <b>.wav</b>, a matching <b>.sms</b> sound file and the <b>ssource.dat</b> line, written straight into your route. Then you can place the sound on the route in <b>3D Sound Placement</b> and listen to it the way the simulator plays it.'],
  ['start', 'What do I set up the first time?', 'Open <b>Settings</b> and choose your MSTS / Open Rails folder — the one that contains <code>ROUTES</code>. You get a green <i>Verified MSTS/OR Directory</i> badge and a route count. It is remembered for good.'],
  ['start', 'Which folder is the "MSTS / Open Rails folder"?', 'The main game folder that holds <code>ROUTES</code>, <code>TRAINS</code>, <code>GLOBAL</code> and <code>SOUND</code> — for example <code>C:\\OR</code> or <code>C:\\MSTS</code>. Not a single route folder.'],
  ['start', 'What is the quickest way from a recording to a sound at a platform?', '1) <b>Single</b> tab: drop the audio, type a name, choose <b>Smart Direct Route Integration</b> and your route, press Generate. 2) <b>3D Sound Placement</b>: Load the route, click the ground at the platform, pick your new sound, press <b>Place sound at pointer</b>, then <b>Save</b>.'],
  ['start', 'Is there a keyboard shortcut list?', 'Yes — <b>Help &amp; Report → Guide → Controls &amp; keys</b>. The most used: arrows to move, Shift for 2×, Q/E rotate, M map view, V 3D view, Ctrl+S save, Ctrl+Z undo, Delete remove, F1 help.'],
  // ---------------- making announcements
  ['make', 'Which audio formats can I drop in?', 'MP3, WAV, M4A/AAC, OGG/Opus, FLAC and WebM work out of the box. They are converted inside the app — no FFmpeg needed. If FFmpeg is installed it is used as a fallback for anything else.'],
  ['make', 'What WAV format does the app write?', 'Plain RIFF/WAVE, <b>16-bit PCM</b>, at 22 050 Hz or 44 100 Hz, mono or stereo (Settings → WAV output). That is what MSTS and Open Rails read reliably.'],
  ['make', 'Mono or stereo, 22 050 or 44 100 Hz?', 'Mono 22 050 Hz is the classic MSTS choice: small files and the simulator positions the sound in 3D anyway. Use 44 100 Hz if you want the clearest voice. Stereo adds size without much gain for a point source.'],
  ['make', 'How are file names made from the announcement name?', 'Letters, digits, - and _ are kept, everything else becomes <code>_</code>. "Howrah Jn. Platform 9" becomes <code>Howrah_Jn_Platform_9.wav</code> / <code>.sms</code>. The readable name goes into ssource.dat so TSRE5 lists it nicely.'],
  ['make', 'What happens if a file with the same name already exists?', 'Nothing is overwritten silently. You see a <b>Files already exist</b> box listing each file with Cancel / Overwrite. In a batch, repeated names get <code>_2</code>, <code>_3</code>. A name already listed in ssource.dat is never added twice.'],
  ['make', 'Can I make many announcements at once?', 'Yes — the <b>Batch</b> tab. Drop many files, rename each row, play them, remove any, then <b>Generate All</b> with a progress bar. One destination for the whole batch.'],
  ['make', 'How do I get a WAV from a YouTube video?', 'The <b>YT → WAV Converter</b> button in the header opens audioforges.com in your browser. Only use videos you have the right to use, then drop the downloaded file into Single or Batch.'],
  ['make', 'What do activation distance, deactivation distance and volume mean?', 'They go into the new .sms. The sound wakes when the listener is within the <b>activation</b> distance and sleeps beyond the <b>deactivation</b> distance. With 550 m it starts playing at 500 m, stops when leaving past 510 m, plays at full volume up to 300 m and fades to silence at 490 m — the same layout as the Bengal V5 / Del / RailIndia routes.'],
  // ---------------- routes & files
  ['route', 'Which files are changed when I use Smart Direct Route Integration?', '<code>&lt;route&gt;\\SOUND\\Name.wav</code> and <code>Name.sms</code> are written, and one line is appended to <code>&lt;route&gt;\\ssource.dat</code> (in its own UTF-16 encoding). Nothing else in the route is touched.'],
  ['route', 'Does ssource.dat need its count fixed?', 'No. ssource.dat in MSTS / Open Rails routes has no entry count — the app checked all your routes. It just appends a correctly formatted <code>Sound ( Name ( … ) FileName ( … ) )</code> line.'],
  ['route', 'Is ssource.dat backed up?', 'Yes, with the <b>Back up ssource.dat</b> switch on (default) it is copied to <code>ssource.dat.bak</code> before every change.'],
  ['route', 'What does Replace Audio in the Route Announcement Manager change?', 'Only the chosen <code>.wav</code>. The .sms and ssource.dat stay exactly as they were. The old wav is kept in <code>%LOCALAPPDATA%\\StationAnnouncementMaker\\replaced</code>.'],
  ['route', 'Why does the manager say "MP3 in WAV" or "24-bit"?', 'Some route wavs are really MP3 data in a .wav wrapper, or 24-bit / extensible WAV. MSTS and Open Rails can fail to play those. Use <b>Replace Audio</b> to convert them to plain 16-bit PCM.'],
  ['route', 'Why does an entry say ".sms missing"?', 'ssource.dat lists a sound whose .sms is not in the route SOUND folder or the main SOUND folder. TSRE5 will show it but nothing plays. Make the sound again or remove the line.'],
  // ---------------- 3D
  ['3d', 'How do I move around in 3D?', '↑/↓ (or W/S) forward/back, ←/→ (A/D) left/right, Q/E rotate, R/F or PgUp/PgDn up/down, T/G look up/down, +/− or the wheel to zoom, drag to look around 360°. Hold <b>Shift</b> for 2× speed. The on-screen pad does the same.'],
  ['3d', 'What is Map view?', 'Press <b>M</b> for a top-down map: drag to pan, wheel to zoom. Press <b>V</b> to go back to 3D. Map view is the easiest way to place sounds at platforms.'],
  ['3d', 'How do I place a sound?', 'Click the ground — a cyan <b>pointer node</b> appears with its tile, position, exact ground height and nearest stations. Pick a sound in <b>Sound to place</b>, press <b>Place sound at pointer</b>, then <b>Save</b>.'],
  ['3d', 'Why can I only place sounds that are in ssource.dat?', 'That is how MSTS / TSRE5 work: placed sound sources must be listed in the route\'s ssource.dat. Make new announcements in Single/Batch with Smart Direct Route Integration, then press <b>Load</b> again in the 3D tab.'],
  ['3d', 'How do I select a sound?', 'Click it in the view, or click its name in the <b>Sounds</b> list (type in the search box to find it). Labels can be clicked too.'],
  ['3d', 'How does the selected sound look?', 'It turns <b>amber</b>: bigger marker, amber label, amber list bar and a pulsing amber ring. Its rings on the ground show where it wakes up (blue), starts (green), stops (amber) and goes silent (red). New sounds are green, track-sound regions purple, removed ones grey and crossed out.'],
  ['3d', 'How do I move a sound that is already placed?', 'There is no drag yet: select it, <b>Remove</b>, click the new spot and place it again, then Save.'],
  ['3d', 'One sound is used at many places — how do I visit them?', 'Select it: the panel shows <b>Used at N places</b> with ◀ ▶ and a slider that flies to each place. Tick <b>Group same sound</b> in the list to see them together.'],
  ['3d', 'How do I see only the sounds near one station?', 'In the Sounds list choose the station in <b>Near station</b> (sorted nearest first) and set the <b>Radius</b>. Every sound also shows its nearest station names and distances.'],
  ['3d', 'Why don\'t I see buildings or trees?', 'The 3D view draws what matters for placing sounds — terrain, track, platforms, stations and sounds — from the route files. Scenery objects are not drawn.'],
  // ---------------- hearing
  ['hear', 'I turned Route sound on but hear nothing.', 'Sounds only play within their own distances from their .sms — the station announcements here start within 500 m. Make sure <b>Hear from the ground</b> is chosen, move closer, and read the hint at the bottom: it names the nearest sound and how close you must be. Also check the master volume slider and that the sound is not muted (speaker icon in its bar).'],
  ['hear', 'How do I just listen to one sound right now?', 'Select it and press <b>▶ Play</b> — it plays its own .wav immediately, at any distance, even with Route sound off. Press again to stop.'],
  ['hear', 'What is the difference between "Hear from the ground" and "Hear from the camera"?', '<b>Ground</b> listens from the ground under the camera, like standing there — works in Map view and from high up (a cyan ring marks the spot). <b>Camera</b> measures from the camera itself, as Open Rails does with a free camera — high up you will hear little.'],
  ['hear', 'What are ssource.dat sounds, track sounds and all sounds?', '<b>ssource.dat sounds</b> are the placed sound sources (announcements, traffic…). <b>Track sounds</b> come from <code>ttype.dat</code> and play at the route\'s sound regions (bridges, tunnels…). <b>All</b> plays both.'],
  ['hear', 'Why do track sounds need a train speed?', 'Their .sms files are speed-controlled: they start, cross-fade and stop by train speed (Speed_Inc_Past / Speed_Dec_Past) and their volume follows a SpeedControlled curve. Set the <b>Train</b> slider to hear a train passing at that speed.'],
  ['hear', 'Are sounds played exactly like in the simulator?', 'They follow each .sms: Activation / Deactivation distance, Distance and Speed triggers in file order with their StartLoop / ReleaseLoopRelease / PlayOneShot actions and wav files, Distance- or Speed-controlled volume curves, Volume, and 3D direction. Track sounds without a distance curve fade out over their activation distance.'],
  ['hear', 'What do Nearest only and Selected only do?', '<b>Nearest only</b> plays just the closest sound that is in range. <b>Selected only</b> plays just the selected sound (by its distances). <b>As the .sms files define</b> plays everything in range.'],
  ['hear', 'Can I mute one sound?', 'Yes — the speaker button in its sound bar, or <b>Mute</b> in the selected panel. Muted sounds turn grey.'],
  // ---------------- platforms
  ['platform', 'Where do the platform boxes and "NAIHATI JUNCTION PF1" labels come from?', 'From the route\'s track database (.tdb). Each platform has two markers joined by <code>PlatformTrItemData</code>; the app draws a box between them, shaded at 30 %, and labels it like the Track Viewer: station name + PF + platform number, with PLATFORM under it.'],
  ['platform', 'Will platforms show on every route?', 'On every route whose .tdb has platform markers. Checked on Bengal V5, Cal, Del, RailIndia, THE IMPERIAL INDIAN CORRIDOR and au_great_zig_zag.'],
  ['platform', 'How do I jump to a station?', 'Use the <b>Stations</b> list (search by name) or click a station or platform label. The view flies there and that station\'s platforms turn amber.'],
  // ---------------- saving
  ['save', 'Where are placed sounds saved?', 'In <code>&lt;route&gt;\\WORLD\\w-XXXXXX+ZZZZZZ.ws</code>, one file per 2 km tile, exactly as TSRE5 writes them: <code>Soundsource ( Position ( x y z ) FileName ( name.sms ) UiD ( n ) )</code>, UTF-16, with the next free UiD of that tile.'],
  ['save', 'Is anything else in the world sound file changed?', 'No. Track sound regions (Soundregion) and all other objects are kept byte for byte. The app refuses to write compressed or binary .ws files.'],
  ['save', 'Are world files backed up?', 'Yes. Before the first change to a .ws file it is copied to <code>%LOCALAPPDATA%\\StationAnnouncementMaker\\world-backups\\&lt;route&gt;\\&lt;date-time&gt;</code> (switch in Settings → Graphics &amp; 3D editor).'],
  ['save', 'How do I undo?', 'Ctrl+Z (or File → Undo) steps back through everything not yet saved. After saving, restore the backup copy if needed.'],
  ['save', 'What if I close the editor with unsaved changes?', '<b>Exit editor</b> asks Save / Discard / Cancel. Closing the window asks the browser\'s "Leave site?" question. Unsaved changes are counted on the tab and next to Save.'],
  // ---------------- tsre
  ['tsre', 'When do I see my changes in TSRE5 or Open Rails?', 'After saving, restart TSRE5 / Open Rails or reload the route — they read ssource.dat and the .ws files when the route opens.'],
  ['tsre', 'What does "Open this place in TSRE5" do?', 'It shows what will change in TSRE5\'s settings.txt (gameRoot, routeName, start tile), keeps a backup (settings.txt.SAM_backup), writes plain lines (TSRE 0.6 breaks on // comments) and starts TSRE5 at that place. You can also just open TSRE5 without changes.'],
  ['tsre', 'My TSRE program is not called TSRE5.exe. How do I set it?', 'Go to <b>Settings → Graphics &amp; 3D editor</b> and click the folder button next to <b>TSRE executable</b>. A normal Windows <i>Open</i> window appears, showing only <code>.exe</code> files: pick your TSRE program, whatever it is called (<code>TSRE5.exe</code>, <code>TSRE5_v0.7.exe</code>, <code>tsre.exe</code>…). No renaming needed. If you never choose one, the app looks for any <code>TSRE*.exe</code> in <code>C:\\OR\\tsre</code> and in <code>tsre</code> / <code>TSRE5</code> inside your MSTS / OR folder.', true],
  ['tsre', 'Can I still place sounds in TSRE5 itself?', 'Yes. Open the route in TSRE5, choose Sound sources, pick the name and place it. Both tools write the same format.'],
  // ---------------- install
  ['install', 'What does Setup check and install?', 'An animated check of Windows 10/11, Microsoft Edge, Python 3 with Tk, screen, sound and your MSTS/OR folder. If Python is missing it downloads the official Python 3.14.6 from python.org, checks its signature and installs it for your user only — no admin rights.'],
  ['install', 'How do I update?', 'Download the latest <b>Station-Announcement-Maker-Setup.exe</b> from GitHub (About → Check for updates) and run it. It updates in place and keeps your settings.'],
  ['install', 'Where are my settings kept?', 'In <code>%LOCALAPPDATA%\\StationAnnouncementMaker</code>: settings.json, app.log, replaced wavs and world backups. Uninstalling the app keeps them.'],
  ['install', 'How do I uninstall?', 'Windows Settings → Apps → Installed apps → Station Announcement Maker → Uninstall.'],
  // ---------------- troubleshooting
  ['fix', 'The 3D view is blank or slow.', 'The app uses your dedicated GPU when it has a driver, otherwise the built-in chip; with no driver it draws in software (slow). Update your graphics driver, or try Settings → Graphics → Integrated / Dedicated and restart. Diagnostics shows which chip is used.'],
  ['fix', 'A file can\'t be converted.', 'The file may be damaged or in a rare format. Convert it to MP3 or WAV with another tool, or install FFmpeg so the app can use it as a fallback.'],
  ['fix', 'The app window doesn\'t open.', 'Python 3 or Microsoft Edge may be missing — run Setup again: its check shows what is missing and installs Python for you. The log is in %LOCALAPPDATA%\\StationAnnouncementMaker\\app.log.'],
  ['fix', 'I picked the wrong MSTS folder.', 'Settings → MSTS / Open Rails folder → Choose… and pick the folder that contains ROUTES.'],
];

const $ = (s, r = document) => r.querySelector(s);
let cat = 'all', open = new Set();
const icon = n => `<svg><use href="#i-${n}"/></svg>`;
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mark(html, words) {
  if (!words.length) return html;
  const re = new RegExp('(' + words.map(w => w.length <= 3 ? '\\b' + escRe(w) + '\\b' : escRe(w)).join('|') + ')', 'gi');
  return html.split(/(<[^>]+>)/).map(p => p.startsWith('<') ? p : p.replace(re, '<mark>$1</mark>')).join('');
}
// hidden search words for common questions (what people type when something goes wrong)
const TAGS = [
  [/hear nothing|doesn.t play when/i, 'no sound silent not playing nothing plays mute quiet audio problem cannot hear'],
  [/same name/i, 'duplicate overwrite exists conflict replace clash'],
  [/move a sound/i, 'drag reposition shift relocate'],
  [/radius of a sound|activation distance, deactivation/i, 'range distance how far rings trigger'],
  [/selection change|selected sound look/i, 'colour color highlight amber orange'],
  [/blank or slow/i, 'black screen lag fps gpu graphics driver nvidia intel'],
  [/report a problem/i, 'bug contact help support email github issue'],
  [/not called TSRE5\.exe/i, 'path exe executable rename renamed browse folder settings not found locate tsre5'],
  [/edit routes or make activities/i, 'route editor activity maker tsre'],
  [/installed and how do I remove/i, 'folder location path program files uninstall old version'],
];
const tagsOf = q => (TAGS.find(([re]) => re.test(q[1])) || [, ''])[1];
function score(q, words, phrase) {
  const title = q[1].toLowerCase(), t = (q[1] + ' ' + strip(q[2]) + ' ' + tagsOf(q)).toLowerCase();
  let s = 0;
  for (const w of words) {
    const re = w.length <= 3 ? new RegExp('\\b' + escRe(w) + '\\b', 'i') : null;
    const inT = re ? re.test(t) : t.includes(w);
    if (!inT) return 0;
    s += (re ? re.test(title) : title.includes(w)) ? 3 : 1;
    if (tagsOf(q).includes(w)) s += 2;
  }
  if (phrase && phrase.includes(' ')) { if (title.includes(phrase)) s += 12; else if (t.includes(phrase)) s += 6; }
  return s;
}
function render() {
  const box = $('#faq-list'); if (!box) return;
  const raw = $('#faq-q').value.trim().toLowerCase();
  const words = raw.split(/\s+/).filter(w => w.length > 1);
  let list = Q.map((q, i) => ({ q, i, s: words.length ? score(q, words, raw) : 1 })).filter(x => x.s > 0 && (cat === 'all' || x.q[0] === cat));
  if (words.length) list.sort((a, b) => b.s - a.s);
  $('#faq-count').textContent = `${list.length} answer${list.length === 1 ? '' : 's'}${raw ? ` for “${raw}”` : ''}`;
  document.querySelectorAll('#faq-chips button').forEach(b => {
    const n = b.dataset.cat === 'all' ? Q.filter(q => !words.length || score(q, words, raw)).length : Q.filter(q => q[0] === b.dataset.cat && (!words.length || score(q, words, raw))).length;
    b.querySelector('em').textContent = n; b.classList.toggle('active', b.dataset.cat === cat); b.classList.toggle('zero', !n);
  });
  box.innerHTML = list.map(({ q, i }, k) => {
    const c = CATS.find(x => x.id === q[0]), asked = q[3] ? '<span class="faq-asked">Asked by a user</span>' : '', isOpen = open.has(i) || (words.length && k === 0);
    return `<article class="faq-item ${isOpen ? 'open' : ''}" data-i="${i}" style="--d:${Math.min(k, 14) * 35}ms">
      <button class="faq-q" aria-expanded="${isOpen}"><span class="faq-ic">${icon(c.icon)}</span><span class="faq-title">${mark(q[1], words)}${asked}</span><span class="faq-cat">${c.name}</span><span class="faq-chev">${icon('arrow')}</span></button>
      <div class="faq-a"><div class="faq-a-in">${mark(q[2], words)}</div></div></article>`;
  }).join('');
  box.querySelectorAll('.faq-q').forEach(b => b.onclick = () => {
    const it = b.parentElement, i = +it.dataset.i;
    it.classList.toggle('open'); it.classList.contains('open') ? open.add(i) : open.delete(i);
    b.setAttribute('aria-expanded', it.classList.contains('open'));
  });
  $('#faq-none').hidden = !!list.length;
  $('#faq-ask-q').textContent = raw ? `“${$('#faq-q').value.trim()}”` : 'your question';
}
function build() {
  const host = $('#faq-root'); if (!host) return;
  host.innerHTML = `
  <div class="faq-hero">
    <div class="faq-orb o1"></div><div class="faq-orb o2"></div><div class="faq-orb o3"></div>
    <div class="faq-hero-in">
      <span class="faq-kicker">${icon('help')} Help centre · ${Q.length} answers</span>
      <h2>How can we help?</h2>
      <p>Search everything about making announcements, placing sounds in 3D, hearing your route and installing.</p>
      <div class="faq-search">${icon('search')}<input id="faq-q" type="search" placeholder="Try “no sound”, “platform”, “backup”, “TSRE5”, “move a sound”…" spellcheck="false" autocomplete="off"><kbd>/</kbd></div>
      <div class="faq-chips" id="faq-chips">
        <button data-cat="all">${icon('eye')}All<em></em></button>
        ${CATS.map(c => `<button data-cat="${c.id}">${icon(c.icon)}${c.name}<em></em></button>`).join('')}
      </div>
    </div>
  </div>
  <div class="faq-count" id="faq-count"></div>
  <div class="faq-list" id="faq-list"></div>
  <div class="faq-none" id="faq-none" hidden>${icon('search')}<b>No answer found</b><span>Ask us below — we read every message.</span></div>
  <div class="faq-ask">
    <div class="faq-ask-glow"></div>
    <div><h3>Didn't find what you need?</h3><p>Send <b id="faq-ask-q">your question</b> to the developer — the app, Windows and Python versions are added for you.</p></div>
    <div class="faq-ask-btns">
      <button class="btn" data-faq-ask="issues">${icon('github')}Ask on GitHub</button>
      <button class="btn mail" data-faq-ask="mail">${icon('mail')}Email the developer</button>
    </div>
  </div>`;
  $('#faq-q').addEventListener('input', () => { open.clear(); render(); });
  $('#faq-chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cat = b.dataset.cat; render(); });
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-faq-ask]'); if (!b) return;
    const q = $('#faq-q').value.trim();
    window.SAM.api('open-link', { key: b.dataset.faqAsk, question: q })
      .then(() => window.SAM.toast(b.dataset.faqAsk === 'mail' ? 'Opening your email app with your question filled in…' : 'Opened a new GitHub issue in your browser.', 'ok'))
      .catch(err => window.SAM.toast(window.SAM.esc(err.message), 'err'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.querySelector('#page-help.active') && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('#faq-q').focus(); }
  });
  render();
}
// sub-tabs inside Help & Report
document.addEventListener('click', e => {
  const b = e.target.closest('[data-help-view]'); if (!b) return;
  document.querySelectorAll('[data-help-view]').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.help-view').forEach(v => v.hidden = v.id !== 'help-' + b.dataset.helpView);
});
window.SAMFaq = { count: Q.length, build, render, open: q => { const i = $('#faq-q'); if (i) { i.value = q || ''; render(); } } };
build();
// deep link: #help&q=no%20sound opens the FAQ already searched
{ const p = new URLSearchParams(location.hash.slice(1).replace(/^[^&]*&?/, '')); if (location.hash.startsWith('#help') && p.get('q')) window.SAMFaq.open(p.get('q')); }
})();
