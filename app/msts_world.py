"""Route world data for the 3D Sound Placement editor (v1.1).

Formats, as found in the real routes in C:\\OR\\ROUTES:

* Placed sounds: <route>\\WORLD\\w-XXXXXX+ZZZZZZ.ws  (the sign belongs to X: w-002058+013374 = tile -2058, 13374)
    UTF-16 LE + BOM, CRLF, "SIMISA@@@@@@@@@@JINX0W0t______", blank line, "Tr_Worldsoundfile (" and objects:
        \\tSoundsource (
        \\t\\tPosition ( x y z )        local to the 2048 m tile (x, z in -1024..1024, y = height)
        \\t\\tFileName ( name.sms )     quoted when the name has spaces
        \\t\\tUiD ( 100004 )            per tile, 100000 and up
        \\t)
    The same files hold Soundregion objects (track sound zones); they are never touched.
* Track database <route>\\<route>.tdb: TrVectorSections ( n  then 16 values per section:
    SectionIdx ShapeIdx WFNameX WFNameZ WFUiD f1 f2 flags TileX TileZ X Y Z AX AY AZ
  PlatformItem: TrItemRData ( x y z tileX tileZ ), PlatformName, Station.
* Terrain <route>\\TILES\\<name>.t (binary JINX0t6b; token 142 = sample floor, 143 = sample scale)
  + <name>_y.raw (256 x 256 uint16, row 0 = north edge, 8 m apart). height = floor + raw * scale.
  <name> is the Open Rails / MSTS quad-tree tile name ("-" + 8 hex digits for 2048 m tiles).
"""
import array
import base64
import json
import os
import re
import shutil
import struct
import threading
import time
from datetime import datetime

import mstsfiles as M

WS_HEADER = "SIMISA@@@@@@@@@@JINX0W0t______"
TILE = 2048.0
_cache = {}
_cache_lock = threading.Lock()


# ------------------------------------------------------------------ tiles & terrain

def tile_name(tx, tz, zoom=15):
    """MSTS quad-tree tile name (as Open Rails' TileName.FromTileXZ)."""
    rx, rz, rw, rh = -16384, -16384, 16384, 16384
    name = "-" if zoom % 2 == 1 else "_"
    partial = 0
    for z in range(zoom):
        east = tx >= rx + rw
        north = tz >= rz + rh
        partial <<= 2
        partial += (0 if north else 2) + (0 if (east ^ north) else 1)
        if z % 2 == 1:
            name += format(partial, "x")
            partial = 0
        if east:
            rx += rw
        if north:
            rz += rh
        rw //= 2
        rh //= 2
    if zoom % 2 == 1:
        name += format(partial << 2, "x")
    return name


def _terrain_floor_scale(path):
    with open(path, "rb") as f:
        b = f.read()
    if b[:8] == b"SIMISA@F":
        import zlib
        b = b[:16] + zlib.decompress(b[16:])  # compressed binary tile
    res = {}

    def walk(off, end):
        while off + 8 <= end:
            tok, _fl, ln = struct.unpack_from("<HHI", b, off)
            s = off + 8
            e = s + ln
            if e > end or ln < 1:
                return
            body = s + 1 + b[s] * 2
            if tok in (142, 143) and e - body == 4:
                res[tok] = struct.unpack_from("<f", b, body)[0]
            elif tok in (136, 139):
                walk(body, e)
            off = e

    walk(32, len(b))
    if 142 not in res or 143 not in res:
        raise ValueError("no terrain floor/scale in " + os.path.basename(path))
    return res[142], res[143]


def terrain_heights(route, tx, tz, n=33):
    """n x n heights (row 0 = north) for one tile, or None if the tile has no terrain."""
    tiles = M.find_ci(route, "TILES")
    if not tiles:
        return None
    name = tile_name(tx, tz)
    t = M.find_ci(tiles, name + ".t")
    y = M.find_ci(tiles, name + "_y.raw")
    if not t or not y:
        return None
    floor, scale = _terrain_floor_scale(t)
    raw = array.array("H")
    with open(y, "rb") as f:
        raw.frombytes(f.read())
    if len(raw) < 65536:
        return None
    step = 256 // (n - 1)
    out = array.array("f")
    for r in range(n):
        iz = min(255, r * step)
        base = iz * 256
        for c in range(n):
            ix = min(255, c * step)
            out.append(floor + scale * raw[base + ix])
    return out


def height_at(route, tx, tz, x, z):
    """Exact terrain height (bilinear on the full 256 grid) at local tile position."""
    tiles = M.find_ci(route, "TILES")
    name = tile_name(tx, tz)
    t = M.find_ci(tiles, name + ".t") if tiles else None
    y = M.find_ci(tiles, name + "_y.raw") if tiles else None
    if not t or not y:
        return None
    floor, scale = _terrain_floor_scale(t)
    raw = array.array("H")
    with open(y, "rb") as f:
        raw.frombytes(f.read())
    fx = max(0.0, min(255.0, (x + 1024.0) / 8.0))
    fz = max(0.0, min(255.0, (1024.0 - z) / 8.0))
    x0, z0 = int(fx), int(fz)
    x1, z1 = min(255, x0 + 1), min(255, z0 + 1)
    ax, az = fx - x0, fz - z0
    h = lambda ix, iz: floor + scale * raw[iz * 256 + ix]  # noqa: E731
    top = h(x0, z0) * (1 - ax) + h(x1, z0) * ax
    bot = h(x0, z1) * (1 - ax) + h(x1, z1) * ax
    return top * (1 - az) + bot * az


# ------------------------------------------------------------------ track database

_SECT = re.compile(r"TrVectorSections\s*\(\s*(\d+)\s+([^()]*)\)")
_PLAT = re.compile(r"(PlatformItem|SidingItem)\s*\((.*?)\n\t\t\)", re.S)
_RDATA = re.compile(r"TrItemRData\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+(-?\d+)\s+(-?\d+)")
_PNAME = re.compile(r'(?:PlatformName|SidingName)\s*\(\s*"?([^")]*)"?\s*\)')
_STATION = re.compile(r'Station\s*\(\s*"?([^")]*)"?\s*\)')
_ITEMID = re.compile(r"TrItemId\s*\(\s*(\d+)\s*\)")
_PDATA = re.compile(r"PlatformTrItemData\s*\(\s*(\w+)\s+(\d+)\s*\)")


def platform_label(station, name):
    """Track Viewer style: "NAIHATI PF1". Platform names are like "Howrah Jn. 1" or just "2"."""
    st = (station or "").strip()
    nm = (name or "").strip()
    m = re.search(r"(\d+[A-Za-z]?)\s*$", nm)
    if m and st:
        return f"{st.upper()} PF{m.group(1).upper()}"
    return (nm or st).upper()


def find_tdb(route):
    name = os.path.basename(os.path.normpath(route))
    p = M.find_ci(route, name + ".tdb")
    if p:
        return p
    for n in os.listdir(route):
        if n.lower().endswith(".tdb"):
            return os.path.join(route, n)
    return None


def parse_tdb(path):
    text, _enc = M.read_text(path)
    nodes = []
    for m in _SECT.finditer(text):
        n = int(m.group(1))
        v = m.group(2).split()
        pts = []
        for i in range(n):
            s = v[i * 16:(i + 1) * 16]
            if len(s) < 13:
                break
            try:
                pts.append((int(s[8]), int(s[9]), float(s[10]), float(s[11]), float(s[12])))
            except ValueError:
                break
        if pts:
            nodes.append(pts)
    plats = []
    for m in _PLAT.finditer(text):
        body = m.group(2)
        r = _RDATA.search(body)
        if not r:
            continue
        pn = _PNAME.search(body)
        st = _STATION.search(body)
        iid, pd = _ITEMID.search(body), _PDATA.search(body)
        plats.append({
            "id": int(iid.group(1)) if iid else None, "partner": int(pd.group(2)) if pd else None,
            "kind": "platform" if m.group(1) == "PlatformItem" else "siding",
            "name": (pn.group(1) if pn else "").strip(),
            "station": (st.group(1) if st else "").strip(),
            "tx": int(r.group(4)), "tz": int(r.group(5)),
            "x": float(r.group(1)), "y": float(r.group(2)), "z": float(r.group(3)),
        })
    return nodes, plats


# ------------------------------------------------------------------ world sound files

_WS_NAME = re.compile(r"^w([+-]\d+)([+-]\d+)\.ws$", re.I)
_SOURCE = re.compile(r"\tSoundsource \((.*?)\r?\n\t\)\r?\n", re.S)
_POS = re.compile(r"Position\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)")
_FILE = re.compile(r'FileName\s*\(\s*"?([^")]*?)"?\s*\)')
_UID = re.compile(r"UiD\s*\(\s*(\d+)\s*\)")


def ws_is_text(path):
    """True for the plain (UTF-16 / ANSI) text .ws that this editor can safely rewrite."""
    with open(path, "rb") as f:
        head = f.read(64)
    if head[:2] == b"\xff\xfe":
        head = head[2:].decode("utf-16-le", "replace").encode("latin-1", "replace")
    return head.startswith(b"SIMISA@@@@@@@@@@JINX0W0t")


def ws_name(tx, tz):
    return "w%s%06d%s%06d.ws" % ("-" if tx < 0 else "+", abs(tx), "-" if tz < 0 else "+", abs(tz))


def world_dir(route):
    return M.find_ci(route, "WORLD")


def read_ws(path):
    text, enc = M.read_text(path)
    sources = []
    for m in _SOURCE.finditer(text):
        body = m.group(1)
        p, f, u = _POS.search(body), _FILE.search(body), _UID.search(body)
        if not (p and f and u):
            continue
        sources.append({"x": float(p.group(1)), "y": float(p.group(2)), "z": float(p.group(3)),
                        "file": f.group(1).strip(), "uid": int(u.group(1))})
    regions = []
    for m in _REGION.finditer(text):
        body = m.group(1)
        p, t = _POS.search(body), re.search(r"SoundregionTrackType\s*\(\s*(-?\d+)", body)
        u = _UID.search(body)
        if p and t:
            regions.append({"x": float(p.group(1)), "y": float(p.group(2)), "z": float(p.group(3)),
                            "type": int(t.group(1)), "uid": int(u.group(1)) if u else 0})
    uids = [int(u) for u in _UID.findall(text)]
    return text, enc, sources, regions, uids


_REGION = re.compile(r"\tSoundregion \((.*?)\r?\n\t\)\r?\n", re.S | re.I)


def read_ttype(route):
    """ttype.dat: [{"name", "inside", "outside"}] indexed by SoundregionTrackType."""
    p = M.find_ci(route, "ttype.dat")
    if not p:
        return []
    text, _e = M.read_text(p)
    return [{"name": a, "inside": b, "outside": c}
            for a, b, c in re.findall(r'TrackType\s*\(\s*"([^"]*)"\s*"([^"]*)"\s*"([^"]*)"\s*\)', text)]


def list_sounds(route):
    wd = world_dir(route)
    out, regions = [], []
    if not wd:
        return out, regions
    for n in os.listdir(wd):
        m = _WS_NAME.match(n)
        if not m:
            continue
        tx, tz = int(m.group(1)), int(m.group(2))
        if not ws_is_text(os.path.join(wd, n)):
            continue  # compressed/binary .ws: not shown, never written
        try:
            _t, _e, srcs, reg, _u = read_ws(os.path.join(wd, n))
        except (OSError, UnicodeError):
            continue
        for r in reg:
            r.update(tx=tx, tz=tz)
            regions.append(r)
        for s in srcs:
            s.update(tx=tx, tz=tz)
            out.append(s)
    return out, regions


def _fmt(v):
    s = "%.6g" % v
    return "0" if s in ("-0",) else s


def source_block(x, y, z, file, uid):
    fname = '"%s"' % file if re.search(r"\s", file) else file
    return ("\tSoundsource (\r\n\t\tPosition ( %s %s %s )\r\n\t\tFileName ( %s )\r\n\t\tUiD ( %d )\r\n\t)\r\n"
            % (_fmt(x), _fmt(y), _fmt(z), fname, uid))


def save_changes(route, add, remove, backup_dir=None):
    """Apply placements/removals to the .ws files. Returns a report per file.

    add:    [{tx, tz, x, y, z, file}]
    remove: [{tx, tz, uid}]
    Every touched file is copied to backup_dir first (if given). Soundregion objects and
    everything else in the file are kept byte for byte.
    """
    wd = world_dir(route)
    if not wd:
        raise ValueError("route has no WORLD folder")
    by_tile = {}
    for a in add or []:
        by_tile.setdefault((int(a["tx"]), int(a["tz"])), {"add": [], "remove": set()})["add"].append(a)
    for r in remove or []:
        by_tile.setdefault((int(r["tx"]), int(r["tz"])), {"add": [], "remove": set()})["remove"].add(int(r["uid"]))
    report = []
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for (tx, tz), ch in sorted(by_tile.items()):
        name = ws_name(tx, tz)
        path = M.find_ci(wd, name) or os.path.join(wd, name)
        existed = os.path.isfile(path)
        if existed and not ws_is_text(path):
            raise ValueError(f"{name} is a compressed/binary world file - edit that tile in TSRE5 (nothing was written)")
        if existed:
            text, enc, _s, _r, uids = read_ws(path)
            if backup_dir:
                dst = os.path.join(backup_dir, stamp)
                os.makedirs(dst, exist_ok=True)
                shutil.copy2(path, os.path.join(dst, os.path.basename(path)))
        else:
            text, enc, uids = WS_HEADER + "\r\n\r\nTr_Worldsoundfile (\r\n)\r\n", "utf-16-bom", []
        removed = []

        def drop(m):
            u = _UID.search(m.group(1))
            if u and int(u.group(1)) in ch["remove"]:
                removed.append(int(u.group(1)))
                return ""
            return m.group(0)

        text = _SOURCE.sub(drop, text)
        next_uid = max([99999] + uids) + 1
        new_blocks, added = "", []
        for a in ch["add"]:
            new_blocks += source_block(float(a["x"]), float(a["y"]), float(a["z"]), a["file"], next_uid)
            added.append({"uid": next_uid, "file": a["file"]})
            next_uid += 1
        if new_blocks:
            k = text.rstrip().rfind(")")
            if k < 0:
                raise ValueError(name + " has no closing bracket")
            text = text[:k] + new_blocks + text[k:]
        if not M.stf_balanced(text):
            raise ValueError(name + ": result would not be valid, nothing written")
        M.atomic_write(path, M.encode_text(text, enc))
        report.append({"file": path, "created": not existed, "added": added, "removed": removed,
                       "tx": tx, "tz": tz})
    return report


# ------------------------------------------------------------------ .sms details for the preview

_NUM = r"[-\d.eE+]+"


def sms_detail(path):
    """What the simulator uses to play a sound source: activation/deactivation distances, volume,
    and per stream the start/stop trigger distances, play mode, wav files and distance curve."""
    text, _enc = M.read_text(path)
    out = {"activation": None, "deactivation": None, "volume": 1.0, "streams": []}
    a = re.search(r"Activation\s*\((.*?)\n\s*\)", text, re.S)
    d = re.search(r"Deactivation\s*\((.*?)\n\s*\)", text, re.S)
    if a:
        m = re.search(r"Distance\s*\(\s*(" + _NUM + r")", a.group(1))
        out["activation"] = float(m.group(1)) if m else None
    if d:
        m = re.search(r"Distance\s*\(\s*(" + _NUM + r")", d.group(1))
        out["deactivation"] = float(m.group(1)) if m else None
    v = re.search(r"\n\s*Volume\s*\(\s*(" + _NUM + r")\s*\)", text)
    if v:
        out["volume"] = float(v.group(1))
    for st in re.split(r"\n\s*Stream\s*\(", text)[1:]:
        s = {"start": None, "release": None, "mode": "", "wavs": [], "curve": [], "curveType": "", "volume": 1.0,
             "triggers": _triggers(st)}
        m = re.search(r"Distance_Dec_Past\s+(" + _NUM + ")", st)
        s["start"] = float(m.group(1)) if m else None
        m = re.search(r"Distance_Inc_Past\s+(" + _NUM + ")", st)
        s["release"] = float(m.group(1)) if m else None
        m = re.search(r"(StartLoopRelease|StartLoop|PlayOneShot|EnableTrigger)", st)
        s["mode"] = m.group(1) if m else ""
        s["wavs"] = [w for w in dict.fromkeys(re.findall(r'File\s*\(\s*"([^"]+\.wav)"', st, re.I))]
        m = re.search(r"Volume\s*\(\s*(" + _NUM + r")\s*\)", st)
        if m:
            s["volume"] = float(m.group(1))
        c = re.search(r"VolumeCurve\s*\(\s*(\w+)\s*CurvePoints\s*\(\s*(\d+)\s+([^()]*)\)", st, re.S)
        if c:
            s["curveType"] = c.group(1)
            nums = [float(x) for x in c.group(3).split()]
            s["curve"] = [[nums[i], nums[i + 1]] for i in range(0, min(len(nums), 2 * int(c.group(2))) - 1, 2)]
        out["streams"].append(s)
    return out


_ACTIONS = r"(StartLoopRelease|StartLoop|ReleaseLoopReleaseWithJump|ReleaseLoopRelease|PlayOneShot|EnableTrigger|DisableTrigger|SetStreamVolume)"


def _blocks(text, keyword):
    """Balanced-bracket blocks that start with `keyword (`."""
    out = []
    for m in re.finditer(keyword + r"\s*\(", text):
        i, depth, q = m.end(), 1, False
        while i < len(text) and depth:
            ch = text[i]
            if ch == '"':
                q = not q
            elif not q:
                depth += ch == "("
                depth -= ch == ")"
            i += 1
        out.append((m.start(), text[m.end():i - 1]))
    return out


def _triggers(stream_text):
    """Every trigger of a stream, in file order, as Open Rails reads them:
    {kind: Initial|Variable|Discrete|Random, var: Distance|Speed|Variable1.., dir: Inc|Dec, value, action, wavs}"""
    out = []
    for kind in ("Initial_Trigger", "Variable_Trigger", "Discrete_Trigger", "Random_Trigger"):
        for pos, body in _blocks(stream_text, kind):
            t = {"kind": kind.split("_")[0], "var": None, "dir": None, "value": None, "action": None, "wavs": [], "pos": pos}
            m = re.match(r"\s*(\w+?)_(Inc|Dec)_Past\s+(" + _NUM + ")", body)
            if m:
                t.update(var=m.group(1), dir=m.group(2), value=float(m.group(3)))
            a = re.search(_ACTIONS, body)
            if a:
                t["action"] = a.group(1)
            t["wavs"] = re.findall(r'File\s*\(\s*"([^"]+\.wav)"', body, re.I)
            out.append(t)
    out.sort(key=lambda t: t["pos"])
    for t in out:
        del t["pos"]
    return out


# ------------------------------------------------------------------ route model (cached)

def _route_key(route):
    tdb = find_tdb(route)
    return (os.path.normcase(route), os.path.getmtime(tdb) if tdb else 0)


def load_route(route, root=None):
    key = _route_key(route)
    with _cache_lock:
        if key in _cache:
            base = _cache[key]
        else:
            base = None
    if base is None:
        t0 = time.time()
        tdb = find_tdb(route)
        nodes, plats = parse_tdb(tdb) if tdb else ([], [])
        tiles = set()
        for pts in nodes:
            for p in pts:
                tiles.add((p[0], p[1]))
        wd = world_dir(route)
        if wd:
            for n in os.listdir(wd):
                m = re.match(r"^w([+-]\d+)([+-]\d+)\.w$", n, re.I)
                if m:
                    tiles.add((int(m.group(1)), int(m.group(2))))
        stations = {}
        for p in plats:
            if p["kind"] != "platform":
                continue
            key_s = p["station"] or p["name"]
            s = stations.setdefault(key_s, {"name": key_s, "n": 0, "pts": []})
            s["n"] += 1
            s["pts"].append(p)
        # origin: the middle of the track
        if tiles:
            xs = sorted(t[0] for t in tiles)
            zs = sorted(t[1] for t in tiles)
            origin = (xs[len(xs) // 2], zs[len(zs) // 2])
        else:
            origin = (0, 0)
        # track segments bucketed per tile, plus a thinned overview
        per_tile = {}
        total = sum(len(n) for n in nodes) or 1
        keep_every = max(1, total // 60000)
        overview = []
        for pts in nodes:
            line = []
            for i, (tx, tz, x, y, z) in enumerate(pts):
                gx = (tx - origin[0]) * TILE + x
                gz = (tz - origin[1]) * TILE + z
                line.append((gx, y, gz))
            for i in range(len(line) - 1):
                a, b = line[i], line[i + 1]
                if abs(a[0] - b[0]) > 3000 or abs(a[2] - b[2]) > 3000:
                    continue
                key_t = (pts[i][0], pts[i][1])
                per_tile.setdefault(key_t, []).extend([round(a[0], 1), round(a[1], 2), round(a[2], 1),
                                                       round(b[0], 1), round(b[1], 2), round(b[2], 1)])
            ov = line[::keep_every]
            if line and (not ov or ov[-1] != line[-1]):
                ov.append(line[-1])
            if len(ov) > 1:
                overview.append([round(c, 1) for p in ov for c in (p[0], p[1], p[2])])
        st_list = []
        for s in stations.values():
            gx = sum((p["tx"] - origin[0]) * TILE + p["x"] for p in s["pts"]) / len(s["pts"])
            gz = sum((p["tz"] - origin[1]) * TILE + p["z"] for p in s["pts"]) / len(s["pts"])
            gy = sum(p["y"] for p in s["pts"]) / len(s["pts"])
            st_list.append({"name": s["name"], "platforms": s["n"], "x": round(gx, 1), "y": round(gy, 2), "z": round(gz, 1)})
        st_list.sort(key=lambda s: s["name"].lower())
        # platforms: pair the two end markers (PlatformTrItemData partner) into one segment
        by_id = {p["id"]: p for p in plats if p["kind"] == "platform" and p["id"] is not None}
        pf_list, seen = [], set()
        for p in by_id.values():
            q = by_id.get(p["partner"])
            if not q or p["id"] in seen:
                continue
            seen.update((p["id"], q["id"]))
            g = lambda e: (round((e["tx"] - origin[0]) * TILE + e["x"], 2), round(e["y"], 2), round((e["tz"] - origin[1]) * TILE + e["z"], 2))  # noqa: E731
            pf_list.append({"name": p["name"], "station": p["station"], "label": platform_label(p["station"], p["name"]),
                            "a": g(p), "b": g(q)})
        base = {"origin": origin, "tiles": sorted(tiles), "trackPerTile": per_tile, "overview": overview,
                "stations": st_list, "platforms": pf_list, "parseSeconds": round(time.time() - t0, 2)}
        with _cache_lock:
            _cache.clear()
            _cache[key] = base
    # sounds are read fresh every time (they change when you save)
    origin = base["origin"]
    sounds, regions = list_sounds(route)
    for s in sounds + regions:
        s["id"] = "%d,%d,%d" % (s["tx"], s["tz"], s["uid"])
        s["gx"] = round((s["tx"] - origin[0]) * TILE + s["x"], 2)
        s["gz"] = round((s["tz"] - origin[1]) * TILE + s["z"], 2)
    return base, sounds, regions


def resolve_sms(route, root, name):
    sd = M.find_ci(route, "SOUND")
    p = M.find_ci(sd, name) if sd else None
    if not p and root:
        p = M.find_ci(M.find_ci(root, "SOUND"), name)
    return p


def sms_infos(route, root, names):
    out = {}
    for n in names:
        p = resolve_sms(route, root, n)
        info = {"path": p, "found": bool(p), "where": None}
        if p:
            info["where"] = "route" if os.path.normcase(os.path.dirname(p)).startswith(os.path.normcase(route)) else "global"
            try:
                det = sms_detail(p)
                base = os.path.dirname(p)
                for s in det["streams"]:
                    s["wavPaths"] = []
                    for w in s["wavs"]:
                        wp = M.find_ci(base, w) or (M.find_ci(M.find_ci(root, "SOUND"), w) if root else None)
                        s["wavPaths"].append(wp)
                info.update(det)
            except Exception as e:  # noqa: BLE001
                info["error"] = str(e)
        out[n] = info
    return out


def terrain_batch(route, tiles, n=33):
    out = {}
    for tx, tz in tiles[:120]:
        h = terrain_heights(route, int(tx), int(tz), n)
        out["%d,%d" % (tx, tz)] = base64.b64encode(h.tobytes()).decode() if h is not None else None
    return out
