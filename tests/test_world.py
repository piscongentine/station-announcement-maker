"""v1.1 world-file tests. Run:  python tests\\test_world.py
Writes only to a temp folder; reads C:\\OR (if present) read-only."""
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app"))
import mstsfiles as M  # noqa: E402
import msts_world as W  # noqa: E402

BENGAL = r"C:\OR\ROUTES\Bengal V5"

WS = ("SIMISA@@@@@@@@@@JINX0W0t______\r\n\r\nTr_Worldsoundfile (\r\n"
      "\tSoundsource (\r\n\t\tPosition ( 1 2 3 )\r\n\t\tFileName ( a.sms )\r\n\t\tUiD ( 100001 )\r\n\t)\r\n"
      "\tSoundregion (\r\n\t\tSoundregionRoty ( -1.63476 )\r\n\t\tSoundregionTrackType ( 4 )\r\n\t\tTrItemId ( 0 1 )\r\n"
      "\t\tUiD ( 100002 )\r\n\t\tFileName ( IMRegionPoint.s )\r\n\t\tPosition ( 5 6 7 )\r\n\t)\r\n"
      "\tSoundsource (\r\n\t\tPosition ( 8 9 10 )\r\n\t\tFileName ( \"b c.sms\" )\r\n\t\tUiD ( 100003 )\r\n\t)\r\n)\r\n")


class T(unittest.TestCase):
    def setUp(self):
        self.route = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.route, "WORLD"))
        self.ws = os.path.join(self.route, "WORLD", W.ws_name(-2058, 13374))
        M.atomic_write(self.ws, M.encode_text(WS, "utf-16-bom"))

    def tearDown(self):
        shutil.rmtree(self.route, ignore_errors=True)

    def test_ws_name(self):
        self.assertEqual(W.ws_name(-2058, 13374), "w-002058+013374.ws")
        self.assertEqual(W.ws_name(12, -5), "w+000012-000005.ws")

    def test_read(self):
        _t, enc, src, reg, uids = W.read_ws(self.ws)
        self.assertEqual(enc, "utf-16-bom")
        self.assertEqual([s["file"] for s in src], ["a.sms", "b c.sms"])
        self.assertEqual(reg[0]["type"], 4)
        self.assertEqual(max(uids), 100003)

    def test_add_remove_keeps_region(self):
        bdir = os.path.join(self.route, "bk")
        rep = W.save_changes(self.route, [{"tx": -2058, "tz": 13374, "x": -1.5, "y": 0.25, "z": 9, "file": "New One.sms"}],
                             [{"tx": -2058, "tz": 13374, "uid": 100001}], bdir)
        self.assertEqual(rep[0]["added"][0]["uid"], 100004)
        self.assertEqual(rep[0]["removed"], [100001])
        text, enc, src, reg, _u = W.read_ws(self.ws)
        self.assertEqual(enc, "utf-16-bom")
        self.assertEqual(sorted(s["file"] for s in src), ["New One.sms", "b c.sms"])
        self.assertIn('FileName ( "New One.sms" )', text)
        self.assertEqual(len(reg), 1)
        self.assertIn("SoundregionRoty ( -1.63476 )", text)
        self.assertTrue(M.stf_balanced(text))
        backups = [os.path.join(r, f) for r, _d, fs in os.walk(bdir) for f in fs]
        with open(backups[0], "rb") as f:
            self.assertEqual(f.read(), M.encode_text(WS, "utf-16-bom"))

    def test_new_tile_file(self):
        W.save_changes(self.route, [{"tx": 1, "tz": 2, "x": 0, "y": 0, "z": 0, "file": "x.sms"}], [], None)
        p = os.path.join(self.route, "WORLD", W.ws_name(1, 2))
        text, enc, src, _r, _u = W.read_ws(p)
        self.assertTrue(text.startswith(W.WS_HEADER))
        self.assertEqual(src[0]["uid"], 100000)

    def test_triggers(self):
        sms = os.path.join(self.route, "t.sms")
        M.write_sms(sms, "t.wav")
        d = W.sms_detail(sms)
        tr = d["streams"][0]["triggers"]
        self.assertEqual([(t["var"], t["dir"], t["value"], t["action"]) for t in tr],
                         [("Distance", "Dec", 500.0, "StartLoop"), ("Distance", "Inc", 510.0, "ReleaseLoopRelease")])
        self.assertEqual(d["streams"][0]["curve"], [[0.0, 1.0], [300.0, 1.0], [490.0, 0.0]])

    def test_platform_label(self):
        self.assertEqual(W.platform_label("Naihati Junction", "Naihati Junction 1"), "NAIHATI JUNCTION PF1")
        self.assertEqual(W.platform_label("Howrah Jn.", "2"), "HOWRAH JN. PF2")
        self.assertEqual(W.platform_label("", "Halt"), "HALT")

    @unittest.skipUnless(os.path.isdir(BENGAL), "real route not present")
    def test_platforms_pair_on_real_route(self):
        W._cache.clear()
        base, _s, _r = W.load_route(BENGAL, r"C:\OR")
        pf = base["platforms"]
        self.assertGreater(len(pf), 100)
        nai = [p["label"] for p in pf if p["label"].startswith("NAIHATI JUNCTION PF")]
        self.assertIn("NAIHATI JUNCTION PF1", nai)

    @unittest.skipUnless(os.path.isdir(BENGAL), "real route not present")
    def test_tile_names_match_real_route(self):
        tiles = {f[:-2].lower() for f in os.listdir(os.path.join(BENGAL, "TILES")) if f.endswith(".t")}
        import re
        for f in os.listdir(os.path.join(BENGAL, "WORLD"))[:60]:
            m = re.match(r"w([+-]\d+)([+-]\d+)\.w$", f)
            if m:
                self.assertIn(W.tile_name(int(m.group(1)), int(m.group(2))), tiles)


if __name__ == "__main__":
    unittest.main(verbosity=2)
