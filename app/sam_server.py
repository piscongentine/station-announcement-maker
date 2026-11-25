"""Station Announcement Maker - local backend.

Stdlib only (Python 3.8+). Serves the UI from ../ui on 127.0.0.1 and opens it in
a Microsoft Edge app window (--app), so nothing has to be installed.
Audio decoding/resampling happens in the page (Web Audio); this process does the
file system work: folders, routes, .wav/.sms writing and ssource.dat edits.
"""
import base64
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mstsfiles as M  # noqa: E402

APP_NAME = "Station Announcement Maker"
VERSION = "1.0.0"
HERE = os.path.dirname(os.path.abspath(__file__))
UI_DIR = os.path.normpath(os.path.join(HERE, "..", "ui"))
DATA_DIR = os.environ.get("SAM_DATA_DIR") or os.path.join(
    os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "StationAnnouncementMaker")
SETTINGS_PATH = os.path.join(DATA_DIR, "settings.json")
LOCK_PATH = os.path.join(DATA_DIR, "server.json")
LOG_PATH = os.path.join(DATA_DIR, "app.log")
YT_URL = "https://www.audioforges.com/youtube-to-wav"
REPO_URL = "https://github.com/piscongentine/station-announcement-maker"
SUPPORT_EMAIL = "shwetpurwar0911@gmail.com"
LINKS = {
    "issues": REPO_URL + "/issues/new/choose",
    "releases": REPO_URL + "/releases/latest",
    "changelog": REPO_URL + "/blob/main/CHANGELOG.md",
    "repo": REPO_URL,
}


def pretty_path(p):
    """Hide the user name in paths shown on screen (%LOCALAPPDATA%, %USERPROFILE%)."""
    for var in ("LOCALAPPDATA", "APPDATA", "USERPROFILE"):
        v = os.environ.get(var)
        if v and p.lower().startswith(v.lower()):
            return "%" + var + "%" + p[len(v):]
    return p


def mail_link():
    import platform
    subject = f"{APP_NAME} v{VERSION} - issue report"
    nl = chr(10)
    body = nl.join([
        "Describe the problem:", "", "",
        "Steps to reproduce:", "1. ", "2. ", "",
        "Expected:", "", "Actual:", "", "",
        "---",
        f"{APP_NAME} v{VERSION} | Windows {platform.version()} | Python {sys.version.split()[0]}",
    ])
    q = urllib.parse.urlencode({"subject": subject, "body": body}, quote_via=urllib.parse.quote)
    return f"mailto:{SUPPORT_EMAIL}?{q}"

DEFAULTS = {
    "root": "",
    "outputFolder": "",
    "sampleRate": 22050,
    "channels": 1,
    "activation": 550,
    "deactivation": 550,
    "volume": 1.0,
    "backupSsource": True,
    "theme": "dark",          # dark | light | system
    "motion": "full",         # full | reduced
    "lastRoute": "",
    "ffmpeg": "",
}

TOKEN = secrets.token_urlsafe(24)
_last_ping = time.time()
_dialog_lock = threading.Lock()
_extra_dirs = set()           # route folders the user browsed to outside the root


def log(*a):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(datetime.now().strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(x) for x in a) + "\n")
    except OSError:
        pass

# ------------------------------------------------------------------ settings

def load_settings():
    s = dict(DEFAULTS)
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            s.update({k: v for k, v in json.load(f).items() if k in DEFAULTS})
    except (OSError, ValueError):
        pass
    return s


def save_settings(new):
    s = load_settings()
    for k, v in (new or {}).items():
        if k in DEFAULTS:
            s[k] = v
    s["sampleRate"] = 44100 if int(s.get("sampleRate") or 22050) == 44100 else 22050
    s["channels"] = 2 if int(s.get("channels") or 1) == 2 else 1
    for k in ("activation", "deactivation"):
        try:
            s[k] = max(60, min(5000, int(float(s[k]))))
        except (TypeError, ValueError):
            s[k] = DEFAULTS[k]
    try:
        s["volume"] = max(0.0, min(1.0, round(float(s["volume"]), 2)))
    except (TypeError, ValueError):
        s["volume"] = 1.0
    os.makedirs(DATA_DIR, exist_ok=True)
    M.atomic_write(SETTINGS_PATH, json.dumps(s, indent=2).encode("utf-8"))
    return s

# ------------------------------------------------------------------ helpers

def ffmpeg_path(settings=None):
    s = settings or load_settings()
    p = s.get("ffmpeg") or ""
    if p and os.path.isfile(p):
        return p
    return shutil.which("ffmpeg") or ""


def can_write(folder):
    if not folder or not os.path.isdir(folder):
        return False
    try:
        fd, tmp = tempfile.mkstemp(prefix=".sam-write-test-", dir=folder)
        os.close(fd)
        os.remove(tmp)
        return True
    except OSError:
        return False


def diagnostics():
    s = load_settings()
    ff = ffmpeg_path(s)
    ver = ""
    if ff:
        try:
            out = subprocess.run([ff, "-version"], capture_output=True, text=True, timeout=8,
                                 creationflags=0x08000000)
            ver = (out.stdout.splitlines() or [""])[0]
        except Exception as e:  # noqa: BLE001
            ver = f"error: {e}"
    rf = M.routes_folder(s["root"]) if s["root"] else None
    return {
        "python": sys.version.split()[0],
        "ffmpeg": ff, "ffmpegVersion": ver,
        "rootWritable": can_write(rf) if rf else None,
        "outputWritable": can_write(s["outputFolder"]) if s["outputFolder"] else None,
        "dataDir": pretty_path(DATA_DIR),
        "edge": find_edge(),
    }


def find_edge():
    for p in (os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
              os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
              os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe")):
        if os.path.isfile(p):
            return p
    return shutil.which("msedge") or ""


def pick_folder(title, initial):
    """Native folder dialog (tkinter). Serialised; runs in the request thread."""
    with _dialog_lock:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        try:
            root.iconbitmap(os.path.join(HERE, "..", "assets", "app.ico"))
        except Exception:  # noqa: BLE001
            pass
        root.update()
        path = filedialog.askdirectory(title=title or "Choose folder",
                                       initialdir=initial if initial and os.path.isdir(initial) else None,
                                       mustexist=True, parent=root)
        root.destroy()
        return os.path.normpath(path) if path else ""


def allowed_path(p):
    """Only serve/overwrite files inside the MSTS root, the output folder or browsed routes."""
    if not p:
        return False
    p = os.path.normcase(os.path.abspath(p))
    s = load_settings()
    bases = [s["root"], s["outputFolder"], *_extra_dirs]
    for b in bases:
        if b:
            b = os.path.normcase(os.path.abspath(b))
            if p == b or p.startswith(b.rstrip("\\/") + os.sep):
                return True
    return False


def route_sound_dir(route, create=True):
    sd = M.find_ci(route, "SOUND")
    if not sd and create:
        sd = os.path.join(route, "SOUND")
        os.makedirs(sd, exist_ok=True)
    return sd


def b64(data):
    return base64.b64decode(data.split(",", 1)[-1])


def check_wav_bytes(data):
    """Validate a 16-bit PCM WAV produced by the page before it hits the disk."""
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("audio is not a RIFF/WAVE file")
    fd, tmp = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        with open(tmp, "wb") as f:
            f.write(data)
        info = M.wav_info(tmp)
    finally:
        os.remove(tmp)
    if not info["ok"]:
        raise ValueError("converted audio is not MSTS-safe: " + info["problem"])
    return info

# ------------------------------------------------------------------ actions

def do_generate(req):
    """Write .wav + .sms for each item to a folder or straight into a route."""
    s = load_settings()
    dest = req.get("dest") or {}
    mode = dest.get("mode")
    items = req.get("items") or []
    overwrite = bool(req.get("overwrite"))
    sms_opts = req.get("sms") or {}
    act = sms_opts.get("activation", s["activation"])
    deact = sms_opts.get("deactivation", s["deactivation"])
    vol = sms_opts.get("volume", s["volume"])
    if not items:
        raise ValueError("nothing to generate")

    if mode == "route":
        route = dest.get("route") or ""
        if not M.is_route(route):
            raise ValueError("that folder is not a route (no .trk file)")
        if not allowed_path(route):
            _extra_dirs.add(route)
        out_dir = route_sound_dir(route)
    elif mode == "folder":
        out_dir = dest.get("folder") or ""
        if not out_dir:
            raise ValueError("choose an output folder first")
        os.makedirs(out_dir, exist_ok=True)
        route = None
    else:
        raise ValueError("unknown destination")

    # resolve names and detect clashes first
    plan, seen = [], set()
    for it in items:
        stem = M.sanitize_name(it.get("stem") or it.get("display"))
        base, n = stem, 2
        while stem.lower() in seen:
            stem = f"{base}_{n}"
            n += 1
        seen.add(stem.lower())
        plan.append((it, stem))
    clashes = []
    for it, stem in plan:
        for ext in (".wav", ".sms"):
            p = M.find_ci(out_dir, stem + ext)
            if p:
                clashes.append(p)
    ss_path = M.find_ci(route, "ssource.dat") if route else None
    if route and ss_path:
        existing = {e["file"].lower() for e in M.parse_ssource(ss_path)["entries"]}
        for it, stem in plan:
            if (stem + ".sms").lower() in existing and not any(
                    c.lower().endswith((stem + ".sms").lower()) for c in clashes):
                clashes.append(f"ssource.dat entry {stem}.sms")
    if req.get("dryRun"):
        return {"conflict": bool(clashes), "files": clashes, "folder": out_dir}
    if clashes and not overwrite:
        return {"conflict": True, "files": clashes}

    created = []
    for it, stem in plan:
        data = b64(it["wav"])
        info = check_wav_bytes(data)
        wav_name, sms_name = stem + ".wav", stem + ".sms"
        wav_path = M.find_ci(out_dir, wav_name) or os.path.join(out_dir, wav_name)
        sms_path = M.find_ci(out_dir, sms_name) or os.path.join(out_dir, sms_name)
        M.atomic_write(wav_path, data)
        M.write_sms(sms_path, os.path.basename(wav_path), act, deact, vol)
        created.append({"display": M.clean_display_name(it.get("display") or stem),
                        "wav": wav_path, "sms": sms_path,
                        "rate": info["rate"], "channels": info["channels"],
                        "duration": info.get("duration")})
    result = {"ok": True, "mode": mode, "folder": out_dir, "created": created}

    if route:
        if not ss_path:
            ss_path = os.path.join(route, "ssource.dat")
            M.new_ssource(ss_path)
            result["ssourceCreated"] = True
        upd = M.append_ssource(ss_path, [(c["display"], os.path.basename(c["sms"])) for c in created],
                               backup=bool(s["backupSsource"]) and bool(req.get("backup", True)))
        check = M.parse_ssource(ss_path)
        result.update(ssource=ss_path, ssourceAdded=upd["added"], ssourceSkipped=upd["skipped"],
                      backup=upd["backup"], ssourceEntries=len(check["entries"]),
                      ssourceValid=check["header_ok"] and check["balanced"], route=route,
                      routeName=os.path.basename(route))
        save_settings({"lastRoute": route})
    log("generate", json.dumps({k: v for k, v in result.items() if k != "created"}),
        [c["wav"] for c in created])
    return result


def do_replace(req):
    target = req.get("target") or ""
    if not target.lower().endswith(".wav") or not os.path.isfile(target):
        raise ValueError("target .wav not found")
    if not allowed_path(target):
        raise ValueError("target is outside the MSTS/OR folder")
    data = b64(req["wav"])
    info = check_wav_bytes(data)
    keep = os.path.join(DATA_DIR, "replaced", datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(keep, exist_ok=True)
    old = os.path.join(keep, os.path.basename(target))
    shutil.copy2(target, old)
    M.atomic_write(target, data)
    log("replace", target, "old copy:", old)
    return {"ok": True, "target": target, "previous": old, "info": M.wav_info(target),
            "rate": info["rate"], "channels": info["channels"]}


def ffmpeg_convert(data, rate, channels, name):
    ff = ffmpeg_path()
    if not ff:
        raise ValueError("this format can't be decoded here and FFmpeg is not installed")
    d = tempfile.mkdtemp(prefix="sam-ff-")
    try:
        src = os.path.join(d, "in" + os.path.splitext(name or "")[1][:8])
        dst = os.path.join(d, "out.wav")
        with open(src, "wb") as f:
            f.write(data)
        r = subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn",
                            "-acodec", "pcm_s16le", "-ar", str(rate), "-ac", str(channels),
                            "-map_metadata", "-1", "-fflags", "+bitexact", dst],
                           capture_output=True, text=True, timeout=300, creationflags=0x08000000)
        if r.returncode != 0 or not os.path.isfile(dst):
            raise ValueError("FFmpeg failed: " + (r.stderr or "").strip()[:300])
        with open(dst, "rb") as f:
            return f.read()
    finally:
        shutil.rmtree(d, ignore_errors=True)


def state():
    s = load_settings()
    v = M.verify_root(s["root"]) if s["root"] else {"ok": False, "routes": 0}
    detected = ""
    if not v.get("ok"):
        for cand in (r"C:\OR", r"C:\MSTS", r"C:\Program Files (x86)\Microsoft Games\Train Simulator",
                     r"C:\Train Simulator"):
            if M.verify_root(cand)["ok"]:
                detected = cand
                break
    return {"settings": s, "root": v, "routes": M.list_routes(s["root"]) if v.get("ok") else [],
            "detected": detected, "version": VERSION, "ytUrl": YT_URL,
            "repo": REPO_URL, "email": SUPPORT_EMAIL}

# ------------------------------------------------------------------ HTTP

MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
        ".ttf": "font/ttf", ".woff2": "font/woff2", ".ico": "image/x-icon", ".json": "application/json",
        ".wav": "audio/wav"}


class Server(ThreadingHTTPServer):
    """Never share a port with another program (Windows SO_REUSEADDR would allow that)."""
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    server_version = "SAM/" + VERSION

    def log_message(self, fmt, *args):  # quiet
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _authed(self, q=None):
        tok = self.headers.get("X-SAM-Token") or (q or {}).get("t", [""])[0]
        return secrets.compare_digest(tok or "", TOKEN)

    def do_GET(self):
        global _last_ping
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/api/hello":
            return self._send(200, {"app": APP_NAME, "pid": os.getpid()})
        if u.path == "/api/audio":
            if not self._authed(q):
                return self._send(403, {"error": "forbidden"})
            p = q.get("path", [""])[0]
            if not p.lower().endswith(".wav") or not os.path.isfile(p) or not allowed_path(p):
                return self._send(404, {"error": "not found"})
            with open(p, "rb") as f:
                data = f.read()
            return self._send(200, data, "audio/wav")
        if u.path.startswith("/api/"):
            return self._send(404, {"error": "unknown"})
        # static
        rel = urllib.parse.unquote(u.path.lstrip("/")) or "index.html"
        full = os.path.normpath(os.path.join(UI_DIR, rel))
        if not full.startswith(UI_DIR) or not os.path.isfile(full):
            return self._send(404, "not found", "text/plain")
        with open(full, "rb") as f:
            data = f.read()
        self._send(200, data, MIME.get(os.path.splitext(full)[1].lower(), "application/octet-stream"))

    def do_POST(self):
        global _last_ping
        u = urllib.parse.urlparse(self.path)
        if not self._authed():
            return self._send(403, {"error": "forbidden"})
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        _last_ping = time.time()
        try:
            if u.path == "/api/convert":   # FFmpeg fallback: raw bytes in, wav out
                rate = int(self.headers.get("X-Rate") or 22050)
                ch = int(self.headers.get("X-Channels") or 1)
                name = urllib.parse.unquote(self.headers.get("X-Name") or "")
                return self._send(200, ffmpeg_convert(raw, rate, ch, name), "audio/wav")
            req = json.loads(raw.decode("utf-8") or "{}")
            res = self.route(u.path, req)
            return self._send(200, res)
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            log("error", u.path, repr(e))
            return self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def route(self, path, req):
        if path == "/api/ping":
            return {"ok": True}
        if path == "/api/bye":
            t_bye = time.time() + 0.1
            threading.Timer(5.0, _maybe_quit_after_bye, args=(t_bye,)).start()
            return {"ok": True}
        if path == "/api/state":
            return state()
        if path == "/api/settings":
            save_settings(req)
            return state()
        if path == "/api/verify-root":
            return M.verify_root(req.get("root", ""))
        if path == "/api/pick-folder":
            p = pick_folder(req.get("title"), req.get("initial"))
            if p and req.get("route"):
                if not M.is_route(p):
                    raise ValueError(f"{p} is not a route folder (no .trk file inside)")
                _extra_dirs.add(p)
            if p and req.get("output"):
                _extra_dirs.add(p)
            return {"path": p}
        if path == "/api/routes":
            return {"routes": M.list_routes(load_settings()["root"])}
        if path == "/api/route/scan":
            route = req.get("route", "")
            if not M.is_route(route):
                raise ValueError("not a route folder")
            if not allowed_path(route):
                _extra_dirs.add(route)
            s = load_settings()
            info, cards = M.route_announcements(route, s["root"])
            save_settings({"lastRoute": route})
            return {"route": info, "cards": cards}
        if path == "/api/generate":
            return do_generate(req)
        if path == "/api/replace":
            return do_replace(req)
        if path == "/api/diagnostics":
            return diagnostics()
        if path == "/api/open-link":
            key = req.get("key", "")
            if key == "mail":
                os.startfile(mail_link())
            elif key in LINKS:
                webbrowser.open(LINKS[key])
            else:
                raise ValueError("unknown link")
            return {"ok": True}
        if path == "/api/open-yt":
            webbrowser.open(YT_URL)
            return {"ok": True}
        if path == "/api/reveal":
            p = req.get("path", "")
            if p and os.path.exists(p) and allowed_path(p):
                if os.path.isdir(p):
                    subprocess.Popen(["explorer", p])
                else:
                    subprocess.Popen(["explorer", "/select,", p])
            return {"ok": True}
        if path == "/api/read-text":   # show generated .sms / ssource.dat in the summary
            p = req.get("path", "")
            if not allowed_path(p) or not os.path.isfile(p) or os.path.getsize(p) > 2_000_000:
                raise ValueError("cannot read that file")
            text, enc = M.read_text(p)
            return {"text": text, "encoding": enc}
        raise ValueError("unknown action " + path)


NO_WINDOW = "--no-window" in sys.argv


def _maybe_quit_after_bye(t_bye):
    # the page said goodbye; quit unless a page (a reload) talked to us since
    if _last_ping <= t_bye + 0.05 and not NO_WINDOW:
        log("window closed - exiting")
        os._exit(0)


def watchdog():
    while True:
        time.sleep(10)
        if time.time() - _last_ping > 120:
            log("no heartbeat for 120 s - exiting")
            os._exit(0)


def existing_instance():
    try:
        with open(LOCK_PATH, encoding="utf-8") as f:
            lk = json.load(f)
        with urllib.request.urlopen(f"http://127.0.0.1:{lk['port']}/api/hello", timeout=1.5) as r:
            if json.load(r).get("pid") == lk.get("pid"):
                return lk
    except Exception:  # noqa: BLE001
        pass
    return None


def open_window(url):
    edge = find_edge()
    prof = os.path.join(DATA_DIR, "window")
    if edge:
        args = [edge, f"--app={url}", f"--user-data-dir={prof}", "--no-first-run",
                "--no-default-browser-check", "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding", "--disable-features=Translate,msEdgeSidebarV2",
                "--window-size=1380,900", "--autoplay-policy=no-user-gesture-required"]
        subprocess.Popen(args, creationflags=0x08000000)
    else:
        webbrowser.open(url)


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    no_window = "--no-window" in sys.argv
    lk = existing_instance()
    if lk and not no_window:
        open_window(f"http://127.0.0.1:{lk['port']}/?t={lk['token']}")
        return
    port = 0
    for a in sys.argv:
        if a.startswith("--port="):
            port = int(a.split("=", 1)[1])
    srv = Server(("127.0.0.1", port), Handler)
    port = srv.server_address[1]
    with open(LOCK_PATH, "w", encoding="utf-8") as f:
        json.dump({"port": port, "token": TOKEN, "pid": os.getpid()}, f)
    url = f"http://127.0.0.1:{port}/?t={TOKEN}"
    log("start", url.split("?")[0])
    if no_window:
        print(url, flush=True)
    else:
        threading.Thread(target=watchdog, daemon=True).start()
        open_window(url)
    try:
        srv.serve_forever()
    finally:
        try:
            os.remove(LOCK_PATH)
        except OSError:
            pass


if __name__ == "__main__":
    main()
