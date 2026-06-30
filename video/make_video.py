#!/usr/bin/env python3
"""Render a real demo-reel video of Revive: title -> problem -> the actual
LangGraph recovery transcript (revealed line by line) -> outcome -> CTA.

Frames are drawn with Pillow and assembled with ffmpeg. The terminal transcript
is the genuine output of `python -m examples.langgraph_agent`.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 900
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frames")
os.makedirs(OUT, exist_ok=True)

# brand palette (RGB)
PAPER = (246, 241, 231)
PAPER2 = (239, 231, 215)
INK = (33, 28, 22)
INKDK = (24, 21, 16)
INKMUT = (92, 83, 70)
INKFAINT = (147, 138, 122)
COBALT = (31, 71, 200)
COBALT_LT = (132, 162, 255)   # cobalt on dark
ICE = (190, 205, 250)
OK = (47, 107, 71)
OK_LT = (104, 196, 142)       # green on dark
FAIL = (168, 52, 31)
FAIL_LT = (224, 130, 110)     # red on dark
WARN_LT = (224, 184, 110)
HAIR = (223, 215, 198)
TERM = (26, 23, 18)

MONO = "/System/Library/Fonts/Menlo.ttc"
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_B = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"

def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.truetype(MONO, size)

F_TITLE = font(SERIF_B, 78)
F_TITLE2 = font(SERIF_B, 60)
F_H = font(SERIF_B, 46)
F_BODY = font(SANS, 30)
F_EYE = font(MONO, 21)
F_MONO = font(MONO, 27)
F_MONO_SM = font(MONO, 22)
F_STAT = font(SERIF_B, 96)
F_STATL = font(MONO, 24)

frames = []  # (Image, duration_seconds)

def add(img, dur):
    frames.append((img, dur))

def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def eyebrow(draw, text, x, y, color):
    draw.text((x, y), text.upper(), font=F_EYE, fill=color)
    # crude letter-spacing emulation: Menlo is mono so spacing is uniform; ok.

# ---------------- Title card (dark) ----------------
def title_card():
    img = Image.new("RGB", (W, H), INKDK)
    d = ImageDraw.Draw(img)
    # wordmark
    d.text((120, 150), "Revive", font=F_TITLE2, fill=PAPER)
    wm_w = d.textlength("Revive", font=F_TITLE2)
    d.ellipse((120 + wm_w + 8, 150 + 44, 120 + wm_w + 28, 150 + 64), fill=COBALT)
    # tagline
    d.text((120, 350), "When the refresh token dies,", font=F_TITLE, fill=PAPER)
    d.text((120, 450), "the run shouldn't.", font=F_TITLE, fill=ICE)
    d.text((120, 610), "Run-level dead-reauth-resume for long-running agents.",
           font=F_BODY, fill=INKFAINT)
    return img

add(title_card(), 3.2)

# ---------------- Problem card (paper) ----------------
def problem_card():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    eyebrow(d, "The silent failure", 120, 130, FAIL)
    d.text((120, 200), "Re-authenticating doesn't", font=F_H, fill=INK)
    d.text((120, 262), "repair a live run.", font=F_H, fill=INK)
    lines = [
        "A multi-day agent's OAuth refresh token dies mid-run.",
        "The agent silently breaks — and even re-authenticating",
        "doesn't fix the live run. Filed across every agent runtime:",
    ]
    for i, ln in enumerate(lines):
        d.text((120, 400 + i * 46), ln, font=F_BODY, fill=INKMUT)
    refs = ["openai/codex #14144", "claude-code #12447", "copilot-cli #2779"]
    x = 120
    for r in refs:
        w = d.textlength(r, font=F_MONO_SM) + 40
        rounded(d, (x, 580, x + w, 632), 10, fill=PAPER2, outline=HAIR, width=1)
        d.text((x + 20, 594), r, font=F_MONO_SM, fill=FAIL)
        x += w + 24
    return img

add(problem_card(), 3.6)

# ---------------- Terminal recovery (the real transcript) ----------------
# (tag, text, color)
LINES = [
    ("prompt", "$ python -m examples.langgraph_agent", INKFAINT),
    ("head", "REAL LANGGRAPH AGENT — dead-reauth-resume", PAPER),
    ("ok", "  ok    1/8  acquire", OK_LT),
    ("ok", "  ok    2/8  identity", OK_LT),
    ("ok", "  ok    3/8  inbox", OK_LT),
    ("ok", "  ok    4/8  calendar", OK_LT),
    ("park", "  PARKED      langgraph thread interrupted (checkpointed)", COBALT_LT),
    ("clf", "  classify    AADSTS700082 · refresh token expired · conf 0.98", FAIL_LT),
    ("rec", "  re-consent  awaiting out-of-band approval …", WARN_LT),
    ("splice", "  splice      fresh token minted → resuming same thread", OK_LT),
    ("ok", "  ok    5/8  files", OK_LT),
    ("ok", "  ok    6/8  compose", OK_LT),
    ("ok", "  ok    7/8  send", OK_LT),
    ("ok", "  ok    8/8  archive", OK_LT),
    ("done", "  COMPLETED 8/8 on the same thread · 0 restarts", OK_LT),
]

def terminal_frame(n):
    """Show the first n lines."""
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    # window
    wx, wy, ww, wh = 120, 90, W - 240, H - 180
    rounded(d, (wx, wy, wx + ww, wy + wh), 16, fill=TERM, outline=(54, 48, 40), width=2)
    # title bar dots
    for i, c in enumerate([(224, 108, 94), (224, 196, 120), (120, 200, 140)]):
        d.ellipse((wx + 28 + i * 26, wy + 24, wx + 28 + i * 26 + 14, wy + 38), fill=c)
    d.text((wx + ww / 2 - 90, wy + 20), "revive — recovery", font=F_MONO_SM, fill=INKFAINT)
    # lines
    ty = wy + 80
    for i in range(n):
        tag, text, color = LINES[i]
        bold = tag in ("done", "head")
        f = F_MONO
        d.text((wx + 40, ty), text, font=f, fill=color)
        if bold:  # fake bold by overdraw
            d.text((wx + 41, ty), text, font=f, fill=color)
        ty += 44
    # blinking cursor on the latest line region
    if n < len(LINES):
        d.rectangle((wx + 40, ty + 6, wx + 54, ty + 30), fill=COBALT_LT)
    return img

# reveal line by line; dramatic pauses on key beats
beat = {"prompt": 0.6, "head": 0.7, "ok": 0.42, "park": 1.0, "clf": 1.2,
        "rec": 1.0, "splice": 1.1, "done": 0.0}
for n in range(1, len(LINES) + 1):
    tag = LINES[n - 1][0]
    add(terminal_frame(n), beat.get(tag, 0.5))
# hold the completed terminal
add(terminal_frame(len(LINES)), 2.4)

# ---------------- Outcome card ----------------
def outcome_card():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    eyebrow(d, "The result", 120, 110, COBALT)
    d.text((120, 175), "Same bug. Two outcomes.", font=F_H, fill=INK)
    # two columns
    col_y = 330
    # without
    d.text((150, col_y - 60), "WITHOUT REVIVE", font=F_EYE, fill=FAIL)
    d.text((150, col_y), "4/8", font=F_STAT, fill=INKFAINT)
    d.line((150, col_y + 70, 150 + 200, col_y + 70), fill=INKFAINT, width=4)
    d.text((150, col_y + 130), "steps · run abandoned", font=F_STATL, fill=INKMUT)
    # divider
    d.line((W / 2, 300, W / 2, 620), fill=HAIR, width=2)
    # with
    d.text((W / 2 + 120, col_y - 60), "WITH REVIVE", font=F_EYE, fill=COBALT)
    d.text((W / 2 + 120, col_y), "8/8", font=F_STAT, fill=INK)
    d.line((W / 2 + 120, col_y + 108, W / 2 + 120 + 175, col_y + 108), fill=COBALT, width=5)
    d.text((W / 2 + 120, col_y + 130), "steps · recovered · 0 restarts", font=F_STATL, fill=INKMUT)
    return img

add(outcome_card(), 4.0)

# ---------------- CTA card (dark) ----------------
def cta_card():
    img = Image.new("RGB", (W, H), INKDK)
    d = ImageDraw.Draw(img)
    d.text((120, 200), "Stop restarting dead runs.", font=F_TITLE2, fill=PAPER)
    d.text((120, 320), "When the refresh token dies, the run shouldn't.",
           font=F_BODY, fill=ICE)
    rounded(d, (120, 430, 700, 510), 12, fill=TERM, outline=(54, 48, 40), width=1)
    d.text((150, 452), "$ pip install revive-sidecar", font=F_MONO, fill=ICE)
    # wordmark
    d.text((120, 640), "Revive", font=F_TITLE2, fill=PAPER)
    wm_w = d.textlength("Revive", font=F_TITLE2)
    d.ellipse((120 + wm_w + 8, 640 + 44, 120 + wm_w + 28, 640 + 64), fill=COBALT)
    d.text((120, 730), "founders@revive.dev   ·   revive.dev", font=F_MONO_SM, fill=INKFAINT)
    return img

add(cta_card(), 4.2)

# ---------------- write frames + concat list ----------------
concat = os.path.join(os.path.dirname(os.path.abspath(__file__)), "concat.txt")
total = 0.0
with open(concat, "w") as f:
    for i, (img, dur) in enumerate(frames):
        path = os.path.join(OUT, f"f{i:03d}.png")
        img.save(path)
        f.write(f"file '{path}'\nduration {dur}\n")
        total += dur
    # concat demuxer needs the last file repeated (its duration is otherwise ignored)
    f.write(f"file '{os.path.join(OUT, f'f{len(frames)-1:03d}.png')}'\n")

print(f"frames={len(frames)} total={total:.1f}s")
print(concat)
