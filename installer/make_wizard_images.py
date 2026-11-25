"""Wizard artwork for the Inno Setup installer (normal + high-DPI), in the app's Midnight Rail style.
Run:  python installer\\make_wizard_images.py"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONTS = os.path.join(ROOT, "ui", "fonts")
EMBLEM = Image.open(os.path.join(ROOT, "ui", "img", "emblem.png")).convert("RGBA")
LOGO = Image.open(os.path.join(ROOT, "ui", "img", "logo.png")).convert("RGBA")
VERSION = "v1.1.2"

NAVY, NAVY2, ACCENT, AMBER, TEXT2 = (15, 23, 42), (8, 13, 27), (59, 130, 246), (245, 158, 11), (148, 163, 184)


def font(weight, size):
    return ImageFont.truetype(os.path.join(FONTS, f"Inter-{weight}.ttf"), size)


def side(w, h, path):
    s = w / 164.0
    im = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(im)
    for y in range(h):  # vertical gradient
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(NAVY[i] * (1 - t) + NAVY2[i] * t) for i in range(3)))
    # faint rail grid
    for x in range(0, w, int(16 * s)):
        d.line([(x, 0), (x, h)], fill=(22, 32, 54))
    for y in range(0, h, int(16 * s)):
        d.line([(0, y), (w, y)], fill=(22, 32, 54))
    # blue glow
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([int(10 * s), int(60 * s), int(154 * s), int(170 * s)], fill=(59, 130, 246, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(22 * s))
    im = Image.alpha_composite(im.convert("RGBA"), glow)
    em = EMBLEM.copy()
    ew = int(150 * s)
    em = em.resize((ew, int(ew * em.height / em.width)), Image.LANCZOS)
    im.alpha_composite(em, ((w - ew) // 2, int(70 * s)))
    d = ImageDraw.Draw(im)

    def center(text, y, f, fill):
        tw = d.textlength(text, font=f)
        d.text(((w - tw) / 2, y), text, font=f, fill=fill)

    center("Station", int(170 * s), font("ExtraBold", int(17 * s)), (255, 255, 255))
    center("Announcement", int(190 * s), font("ExtraBold", int(17 * s)), (255, 255, 255))
    center("Maker", int(210 * s), font("ExtraBold", int(17 * s)), (255, 255, 255))
    center(VERSION + "  ·  MSTS / TSRE5 / OR", int(236 * s), font("SemiBold", int(8.5 * s)), (96, 165, 250))
    # UTILITY TOOLS pill
    f = font("Bold", int(7.5 * s))
    label = "UTILITY TOOLS"
    tw = d.textlength(label, font=f)
    px, py = (w - tw) / 2, int(256 * s)
    d.rounded_rectangle([px - 8 * s, py - 3 * s, px + tw + 8 * s, py + 11 * s], radius=int(7 * s), outline=AMBER, width=max(1, int(s)))
    d.text((px, py), label, font=f, fill=AMBER)
    center("by Piscongentine · Made in Bharat", int(284 * s), font("Regular", int(7.5 * s)), TEXT2)
    # tricolour strip
    sh = int(3 * s)
    d.rectangle([0, h - sh, w // 3, h], fill=(255, 153, 51))
    d.rectangle([w // 3, h - sh, 2 * w // 3, h], fill=(255, 255, 255))
    d.rectangle([2 * w // 3, h - sh, w, h], fill=(19, 136, 8))
    im.convert("RGB").save(path, "BMP")


def small(n, path):
    bg = Image.new("RGBA", (n, n), NAVY + (255,))
    bg.alpha_composite(LOGO.resize((n, n), Image.LANCZOS))
    bg.convert("RGB").save(path, "BMP")


side(164, 314, os.path.join(HERE, "wizard.bmp"))
side(328, 628, os.path.join(HERE, "wizard@2x.bmp"))
small(55, os.path.join(HERE, "wizard-small.bmp"))
small(110, os.path.join(HERE, "wizard-small@2x.bmp"))
Image.open(os.path.join(HERE, "wizard@2x.bmp")).save(os.path.join(HERE, "preview.png"))
print("ok")

