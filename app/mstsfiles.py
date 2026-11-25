"""MSTS / Open Rails file helpers for Station Announcement Maker.

Everything here is modelled on the real routes in C:\\OR\\ROUTES (Bengal V5, Del,
RailIndia, Cal, THE IMPERIAL INDIAN CORRIDOR, au_great_zig_zag):

* ssource.dat and .sms files are UTF-16 LE with a BOM and CRLF line ends.
* ssource.dat = "SIMISA@@@@@@@@@@JINX0Z1t______" header, a blank line, then one
  line per sound:  Sound  ( Name ( "X" )<TAB>FileName ( "x.sms" )<TAB>)
  There is no entry count in any of them, so nothing has to be renumbered.
* Announcement .sms files use the "x1t" header and one StartLoop stream with
  Distance_Dec_Past / Distance_Inc_Past triggers and a distance volume curve.

Existing files are always read and written back in their own encoding.
"""
import os
import re
import struct
import shutil
import tempfile

SSOURCE_HEADER = "SIMISA@@@@@@@@@@JINX0Z1t______"
SMS_HEADER = "SIMISA@@@@@@@@@@JINX0x1t______"

# ---------------------------------------------------------------- text I/O

def read_text(path):
    """Return (text, encoding_tag). Tags: utf-16-bom, utf-8-bom, utf-8, cp1252."""
    with open(path, "rb") as f:
        b = f.read()
    if b[:2] == b"\xff\xfe":
        return b[2:].decode("utf-16-le", errors="replace"), "utf-16-bom"
    if b[:2] == b"\xfe\xff":
        return b[2:].decode("utf-16-be", errors="replace"), "utf-16be-bom"
    if b[:3] == b"\xef\xbb\xbf":
        return b[3:].decode("utf-8", errors="replace"), "utf-8-bom"
    try:
        return b.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return b.decode("cp1252", errors="replace"), "cp1252"


def encode_text(text, tag):
    if tag == "utf-16-bom":
        return b"\xff\xfe" + text.encode("utf-16-le")
    if tag == "utf-16be-bom":
        return b"\xfe\xff" + text.encode("utf-16-be")
    if tag == "utf-8-bom":
        return b"\xef\xbb\xbf" + text.encode("utf-8")
    if tag == "utf-8":
        return text.encode("utf-8")
    return text.encode("cp1252", errors="replace")


def atomic_write(path, data):
    """Write bytes to path via a temp file in the same folder, then replace."""
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(prefix=".sam-", dir=d)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def find_ci(folder, name):
    """Case-insensitive lookup of a child of folder. Returns full path or None."""
    if not folder or not os.path.isdir(folder):
        return None
    low = name.lower()
    try:
        for n in os.listdir(folder):
            if n.lower() == low:
                return os.path.join(folder, n)
    except OSError:
        pass
    return None

# ---------------------------------------------------------------- names

_RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)} | {f"lpt{i}" for i in range(1, 10)}


def sanitize_name(display, max_len=60):
    """Turn an announcement name into a safe file stem (no extension).

    Letters, digits, '_' and '-' are kept; spaces and anything else become '_'.
    """
    s = (display or "").strip()
    s = re.sub(r"\.(wav|sms|mp3|m4a|ogg|flac|aac|wma)$", "", s, flags=re.I)
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_-")
    if not s:
        s = "Announcement"
    if s.lower() in _RESERVED:
        s += "_1"
    return s[:max_len].rstrip("_-")


def clean_display_name(display):
    """Name shown in TSRE5's sound list: no quotes or brackets (they break STF)."""
    s = re.sub(r'["()\r\n\t]+', " ", display or "").strip()
    return re.sub(r"\s+", " ", s) or "Announcement"

# ---------------------------------------------------------------- .sms

def sms_text(wav_name, activation=550, deactivation=550, volume=1.0):
    """Announcement .sms in the exact layout used by Bengal V5 / Del / RailIndia.

    With the defaults (550) this reproduces those files byte for byte apart from
    the wav name: start at 500 m, release at 510 m, curve 0-300 m full then
    fading to silence at 490 m.
    """
    act = max(60, int(round(float(activation))))
    deact = max(60, int(round(float(deactivation))))
    start = act - 50
    release = start + 10
    full = int(round(start * 0.6))
    fade = start - 10
    vol = float(volume)
    lines = [
        SMS_HEADER,
        "",
        "",
        "",
        "Tr_SMS (",
        "",
        "\tScalabiltyGroup( 3",
        "\t\tActivation (",
        "\t\t\tExternalCam ()",
        f"\t\t\tDistance    ({act})",
        "\t\t)",
        "\t\tDeactivation (",
        "\t\t\tPassengerCam\t()",
        "\t\t\tCabCam\t\t\t()",
        f"\t\t\tDistance    \t({deact})",
        "\t\t)",
        f"\t\tVolume ( {vol:.1f})" if vol * 10 == int(vol * 10) else f"\t\tVolume ( {vol:g})",
        "\t\tStereo ( )",
        "\t\tStreams ( 1",
        "\t\t\tStream (",
        "\t\t\t\tPriority ( 2 )",
        "\t\t\t\tTriggers ( 2",
        f"\t\t\t\t\tVariable_Trigger ( Distance_Dec_Past {start}",
        "\t\t\t\t\t\tStartLoop ( 1",
        f"\t\t\t\t\t\t\tFile ( \"{wav_name}\" -1 )",
        "\t\t\t\t\t\t\tSelectionMethod ( RandomSelection )",
        "\t\t\t\t\t\t)",
        "\t\t\t\t\t)",
        f"\t\t\t\t\tVariable_Trigger ( Distance_Inc_Past {release}",
        "\t\t\t\t\t\tReleaseLoopRelease ( )",
        "\t\t\t\t\t)",
        "\t\t\t\t)",
        "\t\t\t\tVolumeCurve(",
        "\t\t\t\t\tDistanceControlled",
        "\t\t\t\t\tCurvePoints ( 3",
        "\t  \t\t\t\t\t 0.0\t1.0",
        f"\t  \t\t\t\t\t{full}.0\t1.0",
        f"\t\t\t\t\t\t{fade}.0\t0.0",
        "\t\t\t\t\t)",
        "\t\t\t\t\tGranularity (0.01)",
        "\t\t\t\t)",
        "\t\t\t)",
        "\t\t)",
        "\t)",
        ")",
        "",
        "",
    ]
    return "\r\n".join(lines)


def write_sms(path, wav_name, activation=550, deactivation=550, volume=1.0):
    atomic_write(path, encode_text(sms_text(wav_name, activation, deactivation, volume), "utf-16-bom"))


_FILE_RE = re.compile(r'File\s*\(\s*"?([^"()]+?\.wav)"?\s+-?\d+\s*\)', re.I)


def parse_sms(path):
    """Return dict with wav file names, activation distance, volume, header ok."""
    text, enc = read_text(path)
    wavs = []
    for m in _FILE_RE.finditer(text):
        n = m.group(1).strip()
        if n.lower() not in [w.lower() for w in wavs]:
            wavs.append(n)
    act = re.search(r"Activation\s*\(.*?Distance\s*\(\s*([\d.]+)\s*\)", text, re.I | re.S)
    vol = re.search(r"Volume\s*\(\s*([\d.]+)\s*\)", text, re.I)
    loop = "StartLoop" if re.search(r"StartLoop", text, re.I) else (
        "PlayOneShot" if re.search(r"PlayOneShot", text, re.I) else "")
    return {
        "wavs": wavs,
        "activation": float(act.group(1)) if act else None,
        "volume": float(vol.group(1)) if vol else None,
        "trigger": loop,
        "encoding": enc,
        "header_ok": text.lstrip().startswith("SIMISA@@@@@@@@@@JINX0x1t"),
        "balanced": stf_balanced(text),
    }


def stf_balanced(text):
    """True if parentheses balance outside quoted strings (basic STF sanity)."""
    depth, q = 0, False
    for ch in text:
        if ch == '"':
            q = not q
        elif not q:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth < 0:
                    return False
    return depth == 0 and not q

# ---------------------------------------------------------------- ssource.dat

_SOUND_RE = re.compile(
    r'Sound\s*\(\s*Name\s*\(\s*"([^"]*)"\s*\)\s*FileName\s*\(\s*"([^"]*)"\s*\)\s*\)', re.I)


def parse_ssource(path):
    text, enc = read_text(path)
    entries = [{"name": m.group(1), "file": m.group(2)} for m in _SOUND_RE.finditer(text)]
    return {"entries": entries, "encoding": enc, "text": text,
            "header_ok": text.lstrip().startswith("SIMISA@@@@@@@@@@JINX0"),
            "balanced": stf_balanced(text)}


def ssource_line(display, sms_file):
    return f'Sound  ( Name ( "{clean_display_name(display)}" )\tFileName ( "{sms_file}" )\t)'


def append_ssource(path, items, backup=True):
    """Append Sound entries [(display, sms_file), ...] to ssource.dat.

    Keeps the file's encoding and line ending. Entries whose FileName is already
    listed are skipped. Returns dict(added=[...], skipped=[...], backup=path|None).
    """
    text, enc = read_text(path)
    nl = "\r\n" if "\r\n" in text or "\n" not in text else "\n"
    existing = {m.group(2).lower() for m in _SOUND_RE.finditer(text)}
    added, skipped = [], []
    new_lines = []
    for display, sms in items:
        if sms.lower() in existing:
            skipped.append(sms)
            continue
        existing.add(sms.lower())
        line = ssource_line(display, sms)
        new_lines.append(line)
        added.append(line)
    bak = None
    if new_lines:
        if backup:
            bak = path + ".bak"
            shutil.copy2(path, bak)
        body = text
        # strip trailing spaces/tabs on the last line, then make sure it ends with a newline
        body = body.rstrip(" \t")
        if body and not body.endswith(("\n", "\r")):
            body += nl
        body += nl.join(new_lines) + nl
        atomic_write(path, encode_text(body, enc))
    return {"added": added, "skipped": skipped, "backup": bak, "encoding": enc}


def new_ssource(path):
    """Create a fresh ssource.dat (used only if a route has none)."""
    atomic_write(path, encode_text(SSOURCE_HEADER + "\r\n\r\n", "utf-16-bom"))

# ---------------------------------------------------------------- WAV

WAVE_FORMATS = {1: "PCM", 3: "IEEE float", 85: "MP3 in WAV", 2: "ADPCM", 17: "IMA ADPCM",
                0xFFFE: "Extensible"}


def wav_info(path):
    """Parse a RIFF/WAVE header. Returns dict; 'ok' True if MSTS/OR-safe PCM."""
    info = {"exists": os.path.isfile(path), "ok": False, "problem": ""}
    if not info["exists"]:
        info["problem"] = "file missing"
        return info
    info["size"] = os.path.getsize(path)
    try:
        with open(path, "rb") as f:
            head = f.read(12)
            if len(head) < 12 or head[:4] != b"RIFF" or head[8:12] != b"WAVE":
                info["problem"] = "not a RIFF/WAVE file"
                return info
            fmt = None
            data_len = None
            while True:
                ch = f.read(8)
                if len(ch) < 8:
                    break
                cid, clen = ch[:4], struct.unpack("<I", ch[4:])[0]
                if cid == b"fmt ":
                    fmt = f.read(clen)
                    if clen % 2:
                        f.read(1)
                elif cid == b"data":
                    data_len = clen
                    break
                else:
                    f.seek(clen + (clen % 2), 1)
            if not fmt or len(fmt) < 16:
                info["problem"] = "no fmt chunk"
                return info
            tag, ch_, rate, brate, align, bits = struct.unpack("<HHIIHH", fmt[:16])
            if tag == 0xFFFE and len(fmt) >= 26:
                sub = struct.unpack("<H", fmt[24:26])[0]
                info["subformat"] = sub
            info.update(format=tag, format_name=WAVE_FORMATS.get(tag, f"0x{tag:04X}"),
                        channels=ch_, rate=rate, bits=bits)
            if data_len is not None and brate:
                info["duration"] = round(data_len / brate, 2)
            pcm = tag == 1 or (tag == 0xFFFE and info.get("subformat") == 1)
            if not pcm:
                info["problem"] = f"{info['format_name']} - MSTS/OR need plain PCM"
            elif bits not in (8, 16):
                info["problem"] = f"{bits}-bit - use 16-bit PCM"
            elif tag != 1:
                info["problem"] = "WAVE_FORMAT_EXTENSIBLE header - use plain PCM"
            elif ch_ not in (1, 2):
                info["problem"] = f"{ch_} channels"
            else:
                info["ok"] = True
    except OSError as e:
        info["problem"] = str(e)
    return info

# ---------------------------------------------------------------- routes

def routes_folder(root):
    return find_ci(root, "ROUTES") if root else None


def list_routes(root):
    rf = routes_folder(root)
    out = []
    if not rf:
        return out
    for n in sorted(os.listdir(rf), key=str.lower):
        p = os.path.join(rf, n)
        if os.path.isdir(p) and any(x.lower().endswith(".trk") for x in os.listdir(p)):
            out.append(route_summary(p))
    return out


def route_summary(route):
    sound = find_ci(route, "SOUND")
    ss = find_ci(route, "ssource.dat")
    return {"name": os.path.basename(route), "path": route, "sound": sound, "ssource": ss}


def is_route(path):
    return os.path.isdir(path) and any(x.lower().endswith(".trk") for x in os.listdir(path))


def verify_root(root):
    """An MSTS/OR root has a ROUTES folder (and usually TRAINS / GLOBAL / SOUND)."""
    res = {"root": root, "ok": False, "routes": 0, "has": {}}
    if not root or not os.path.isdir(root):
        return res
    for n in ("ROUTES", "TRAINS", "GLOBAL", "SOUND"):
        res["has"][n] = bool(find_ci(root, n))
    res["routes"] = len(list_routes(root))
    res["ok"] = res["has"]["ROUTES"] and res["routes"] > 0
    return res


def route_announcements(route, root=None):
    """Every ssource.dat entry with its .sms and .wav files resolved."""
    info = route_summary(route)
    sound = info["sound"]
    # MSTS looks in the route's SOUND folder first, then <root>\SOUND
    gsound = find_ci(root, "SOUND") if root else None
    cards = []
    if not info["ssource"]:
        return info, cards
    ss = parse_ssource(info["ssource"])
    seen = set()
    for i, e in enumerate(ss["entries"]):
        sms_path = find_ci(sound, e["file"]) if sound else None
        where = "route"
        if not sms_path and gsound:
            sms_path = find_ci(gsound, e["file"])
            where = "global" if sms_path else "missing"
        if not sms_path:
            where = "missing"
        card = {"index": i, "name": e["name"], "sms": e["file"], "sms_path": sms_path,
                "where": where, "wavs": [], "duplicate": e["file"].lower() in seen}
        seen.add(e["file"].lower())
        if sms_path:
            try:
                s = parse_sms(sms_path)
                card.update(trigger=s["trigger"], activation=s["activation"], volume=s["volume"])
                base = os.path.dirname(sms_path)
                for w in s["wavs"]:
                    wp = find_ci(base, w) or (find_ci(gsound, w) if gsound else None)
                    wi = wav_info(wp) if wp else {"exists": False, "ok": False, "problem": "file missing"}
                    wi.update(name=w, path=wp)
                    card["wavs"].append(wi)
            except Exception as ex:  # keep going on odd files
                card["error"] = str(ex)
        cards.append(card)
    return info, cards
