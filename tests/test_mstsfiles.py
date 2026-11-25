"""Checks for the MSTS file helpers. Run:  python tests\\test_mstsfiles.py
Read-only against C:\\OR (if present); writes only to a temp folder."""
import os
import shutil
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app"))
import mstsfiles as M  # noqa: E402

REAL_SMS = r"C:\OR\ROUTES\Bengal V5\sound\Bandel.sms"
REAL_SS = r"C:\OR\ROUTES\Bengal V5\ssource.dat"


def pcm_wav(path, rate=22050, ch=1, n=100):
    data = b"\x00\x00" * n * ch
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, ch, rate, rate * ch * 2, ch * 2, 16) + b"data" + struct.pack("<I", len(data))
    with open(path, "wb") as f:
        f.write(hdr + data)


class T(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def test_sanitize(self):
        self.assertEqual(M.sanitize_name('Howrah Jn. "Pf 1".mp3'), "Howrah_Jn_Pf_1")
        self.assertEqual(M.sanitize_name("con"), "con_1")
        self.assertEqual(M.sanitize_name("  "), "Announcement")

    @unittest.skipUnless(os.path.isfile(REAL_SMS), "real route not present")
    def test_sms_matches_real_route_byte_for_byte(self):
        with open(REAL_SMS, "rb") as f:
            real = f.read()
        self.assertEqual(M.encode_text(M.sms_text("Bandel.wav"), "utf-16-bom"), real)

    def test_sms_parses(self):
        p = os.path.join(self.d, "a.sms")
        M.write_sms(p, "a.wav", 400, 420, 0.8)
        s = M.parse_sms(p)
        self.assertEqual(s["wavs"], ["a.wav"])
        self.assertEqual(s["activation"], 400)
        self.assertTrue(s["header_ok"] and s["balanced"])
        self.assertEqual(s["encoding"], "utf-16-bom")

    def _ssource(self, src=None, ending="\r\n"):
        p = os.path.join(self.d, "ssource.dat")
        if src and os.path.isfile(src):
            shutil.copy(src, p)
        else:
            body = M.SSOURCE_HEADER + "\r\n\r\n" + 'Sound  ( Name ( "A" )\tFileName ( "a.sms" )\t)' + ending
            M.atomic_write(p, M.encode_text(body, "utf-16-bom"))
        return p

    def test_append_keeps_prefix_and_encoding(self):
        for ending in ("\r\n", ""):  # with and without a trailing newline
            p = self._ssource(ending=ending)
            with open(p, "rb") as f:
                before = f.read()
            r = M.append_ssource(p, [("New One", "New_One.sms")])
            with open(p, "rb") as f:
                after = f.read()
            self.assertTrue(after.startswith(before))
            self.assertEqual(after[:2], b"\xff\xfe")
            ps = M.parse_ssource(p)
            self.assertEqual([e["file"] for e in ps["entries"]], ["a.sms", "New_One.sms"])
            self.assertTrue(ps["balanced"])
            with open(r["backup"], "rb") as f:
                self.assertEqual(f.read(), before)

    def test_append_skips_existing(self):
        p = self._ssource()
        r = M.append_ssource(p, [("A again", "A.SMS")])
        self.assertEqual(r["added"], [])
        self.assertEqual(r["skipped"], ["A.SMS"])
        self.assertIsNone(r["backup"])

    @unittest.skipUnless(os.path.isfile(REAL_SS), "real route not present")
    def test_append_on_real_copy(self):
        p = self._ssource(REAL_SS)
        n = len(M.parse_ssource(p)["entries"])
        M.append_ssource(p, [("Test", "Test_xyz.sms")], backup=False)
        self.assertEqual(len(M.parse_ssource(p)["entries"]), n + 1)

    def test_wav_info(self):
        p = os.path.join(self.d, "x.wav")
        pcm_wav(p, 44100, 2)
        i = M.wav_info(p)
        self.assertTrue(i["ok"])
        self.assertEqual((i["rate"], i["channels"], i["bits"]), (44100, 2, 16))
        with open(p, "r+b") as f:
            f.seek(20)
            f.write(struct.pack("<H", 85))
        self.assertFalse(M.wav_info(p)["ok"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
