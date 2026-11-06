#!/usr/bin/env python3
"""Renders docs/demo.gif from the storyboard (simulated terminal, fake data). Needs Pillow:  python3 scripts/make-demo.py"""
import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frames = json.loads(subprocess.check_output(["node", os.path.join(root, "scripts", "demo-storyboard.js")]))
H, PAD, TOP, LH, FS = 560, 22, 52, 21, 15
BG, BAR = (27, 29, 35), (40, 43, 52)
COL = {"fg": (215, 218, 224), "bold": (255, 255, 255), "dim": (125, 133, 144), "green": (126, 231, 135), "yellow": (227, 179, 65), "cyan": (121, 192, 255)}
MENLO = "/System/Library/Fonts/Menlo.ttc"
reg, bold = ImageFont.truetype(MENLO, FS, index=0), ImageFont.truetype(MENLO, FS, index=1)
cap = ImageFont.truetype(MENLO, 12, index=0)
CW = reg.getlength("M")
maxc = max(len("".join(t for t, _ in line)) for fr in frames for line in fr["lines"])
W = max(980, int(maxc * CW + 2 * PAD))                 # wide enough for the longest line
rows = (H - TOP - 34) // LH

def render(lines):
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 34], fill=BAR)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]): d.ellipse([16 + i * 22, 11, 28 + i * 22, 23], fill=c)
    d.text((W // 2 - 90, 9), "Zalo Exporter - Terminal", font=cap, fill=(160, 166, 176))
    y = TOP
    for line in lines[-rows:]:
        x = PAD
        for text, style in line:
            for ch in text:
                if ch == chr(0x2713):                           # draw the check mark ourselves; these fonts lack the glyph
                    d.line([(x + 1, y + 10), (x + 4, y + 14), (x + 11, y + 4)], fill=COL.get(style, COL["fg"]), width=2)
                else:
                    d.text((x, y), ch, font=bold if style == "bold" else reg, fill=COL.get(style, COL["fg"]))
                x += CW
        y += LH
    d.text((W - 250, H - 22), "Demo with simulated data", font=cap, fill=(90, 98, 110))
    return im

imgs, durs = [], []
for fr in frames:
    imgs.append(render(fr["lines"]).convert("P", palette=Image.ADAPTIVE, colors=32)); durs.append(fr["ms"])
out = os.path.join(root, "docs", "demo.gif"); os.makedirs(os.path.dirname(out), exist_ok=True)
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durs, loop=0, optimize=True, disposal=1)
if "--png" in sys.argv:   # preview a mid-run frame and the last frame
    mid = next(i for i, f in enumerate(frames) if any("[3/4]" in "".join(t for t, _ in l) for l in f["lines"]))
    for name, idx in (("mid", mid), ("done", len(frames) - 1)): render(frames[idx]["lines"]).save(f"/tmp/demo_{name}.png")
print(f"{out}  {os.path.getsize(out)/1024:.0f} KB  {len(frames)} frames  {sum(durs)/1000:.1f}s")
