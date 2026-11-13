#!/usr/bin/env python3
"""Render the branded 1200x630 share cards in this folder.

Uses the repo's logo, radio mark, concert photos, collage seeds, and merch
hoodie. Does not call any network or Firebase API. Re-run from the repo root:

    python3 og/render-share-cards.py

og/botw-current.jpg is written as a byte-for-byte copy of og/botw.jpg so the
Band of the Week page can keep a stable image URL.
"""

import math
import os
import shutil

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 630

TEAL = (37, 199, 193)
GOLD = (240, 193, 74)
PINK = (255, 61, 110)
ORANGE = (255, 106, 61)
WHITE = (246, 248, 248)
MUTED = (186, 198, 197)
INK = (7, 9, 11)

FONT_B = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
FONT_S = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf"
FONT_R = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def cover(path, size, focus=(0.5, 0.5)):
    image = Image.open(os.path.join(ROOT, path)).convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((int(image.width * scale) + 1, int(image.height * scale) + 1), Image.Resampling.LANCZOS)
    left = max(0, min(resized.width - size[0], int((resized.width - size[0]) * focus[0])))
    top = max(0, min(resized.height - size[1], int((resized.height - size[1]) * focus[1])))
    return resized.crop((left, top, left + size[0], top + size[1]))


def load_icon(size):
    icon = Image.open(os.path.join(ROOT, "apple-touch-icon.png")).convert("RGBA")
    return icon.resize((size, size), Image.Resampling.LANCZOS)


def load_radio(size):
    mark = Image.open(os.path.join(ROOT, "bt-radio-logo-280.webp")).convert("RGBA")
    return mark.resize((size, size), Image.Resampling.LANCZOS)


def shade(image, black=0.55, tint=None, tint_amount=0.18):
    darkened = Image.blend(image.convert("RGB"), Image.new("RGB", image.size, (0, 0, 0)), black)
    if tint:
        darkened = Image.blend(darkened, Image.new("RGB", image.size, tint), tint_amount)
    return darkened


def new_card(accent, photo=None, black=0.62, tint=None):
    if photo:
        base = shade(cover(photo, (W, H), (0.5, 0.42)), black, tint)
    else:
        base = Image.new("RGB", (W, H), INK)
        glow = Image.new("RGB", (W, H), accent)
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).ellipse((W - 520, -180, W + 180, 520), fill=70)
        ImageDraw.Draw(mask).ellipse((-220, 250, 420, 860), fill=46)
        base = Image.composite(glow, base, mask)
    draw = ImageDraw.Draw(base)
    draw.rectangle((0, 0, 14, H), fill=accent)
    return base.convert("RGBA")


def footer(card, accent, label):
    draw = ImageDraw.Draw(card)
    draw.rectangle((0, 566, W, H), fill=(5, 7, 9, 255))
    draw.rectangle((0, 566, W, 571), fill=accent + (255,))
    draw.text((48, 586), "bandtroductions.com", font=font(FONT_S, 22), fill=MUTED)
    draw.text((W - 40, 586), label, font=font(FONT_S, 20), fill=accent, anchor="ra")


def paste(card, sprite, xy):
    card.alpha_composite(sprite, xy)


def heading(card, kicker, title, subtitle, accent, x=64, y=78, title_size=86, max_width=700):
    draw = ImageDraw.Draw(card)
    draw.text((x, y), kicker, font=font(FONT_S, 22), fill=accent)
    title_font = font(FONT_B, title_size)
    cursor = y + 40
    for line in title.split("\n"):
        draw.text((x, cursor), line, font=title_font, fill=WHITE)
        cursor += title_size + 4
    sub_font = font(FONT_R, 28)
    for line in wrap(draw, subtitle, sub_font, max_width):
        draw.text((x, cursor + 16), line, font=sub_font, fill=MUTED)
        cursor += 36


def star(draw, cx, cy, radius, fill):
    points = []
    for index in range(10):
        angle = math.radians(-90 + index * 36)
        arm = radius if index % 2 == 0 else radius * 0.42
        points.append((cx + arm * math.cos(angle), cy + arm * math.sin(angle)))
    draw.polygon(points, fill=fill)


def wrap(draw, text, face, max_width):
    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=face) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def save(card, name):
    rgb = card.convert("RGB")
    path = os.path.join(OUT, name)
    for quality in (88, 82, 76, 70, 64):
        rgb.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
        if os.path.getsize(path) <= 290 * 1024:
            break
    print(f"{name}: {os.path.getsize(path) // 1024} KB")
    return path


def card_botw():
    card = new_card(GOLD, "bt-radio-stage.jpg", 0.72, GOLD)
    paste(card, load_icon(168), (64, 150))
    heading(
        card,
        "WEEKLY CROWN",
        "BAND OF\nTHE WEEK",
        "Fans vote Monday through Saturday. One band is crowned Sunday.",
        GOLD,
        x=268,
        y=150,
        title_size=78,
        max_width=860,
    )
    draw = ImageDraw.Draw(card)
    for x in (980, 1048, 1116):
        star(draw, x, 118, 18, GOLD)
    footer(card, GOLD, "BAND OF THE WEEK")
    return card


def card_radio():
    card = new_card(TEAL, "bt-radio-stage.jpg", 0.7, TEAL)
    paste(card, load_radio(360), (760, 100))
    heading(
        card,
        "ON AIR",
        "RADIO",
        "Independent music discovery. Local bands, no algorithms, just the song.",
        TEAL,
        x=64,
        y=150,
        title_size=108,
        max_width=680,
    )
    footer(card, TEAL, "LIVE RADIO")
    return card


def card_btv():
    card = new_card(PINK)
    heading(
        card,
        "ORIGINAL VIDEO",
        "BTV",
        "Original music videos and band interviews. No covers.",
        PINK,
        x=64,
        y=150,
        title_size=120,
        max_width=620,
    )
    screen = Image.new("RGBA", (430, 280), (0, 0, 0, 0))
    draw = ImageDraw.Draw(screen)
    draw.rounded_rectangle((8, 8, 422, 272), 22, outline=PINK, width=8, fill=(10, 8, 12, 255))
    draw.rounded_rectangle((28, 28, 402, 220), 8, fill=(16, 12, 16, 255))
    screen.alpha_composite(load_icon(120), (155, 52))
    draw.rectangle((28, 228, 402, 236), fill=TEAL)
    paste(card, screen, (700, 145))
    footer(card, PINK, "ON AIR")
    return card


def card_plans():
    card = new_card(TEAL)
    heading(
        card,
        "WEBSITE + MERCH",
        "BAND\nWEBSITES",
        "An official site and merch store. Free accounts stay free.",
        TEAL,
        x=64,
        y=118,
        title_size=78,
        max_width=620,
    )
    window = Image.new("RGBA", (460, 300), (0, 0, 0, 0))
    draw = ImageDraw.Draw(window)
    draw.rounded_rectangle((0, 0, 459, 299), 16, fill=(16, 22, 22, 255), outline=TEAL, width=3)
    draw.rounded_rectangle((0, 0, 459, 48), 16, fill=(22, 32, 32, 255))
    draw.rectangle((0, 32, 459, 48), fill=(22, 32, 32, 255))
    for index, color in enumerate(((255, 95, 86), GOLD, (80, 200, 120))):
        draw.ellipse((18 + index * 26, 16, 34 + index * 26, 32), fill=color)
    draw.text((150, 12), "yourband.com", font=font(FONT_S, 18), fill=MUTED)
    draw.text((28, 78), "YOUR BAND", font=font(FONT_B, 36), fill=WHITE)
    draw.text((28, 128), "Music  ·  Shows  ·  Merch", font=font(FONT_R, 20), fill=MUTED)
    draw.rounded_rectangle((28, 190, 250, 250), 10, fill=TEAL)
    draw.text((46, 206), "YOUR SITE", font=font(FONT_B, 24), fill=INK)
    paste(card, window, (690, 130))
    footer(card, TEAL, "PLANS")
    return card


def card_band():
    card = new_card(TEAL, "bt-hero-horns-user.jpg", 0.58, (8, 24, 28))
    paste(card, load_icon(150), (64, 78))
    heading(
        card,
        "BAND PROFILE",
        "THE BAND",
        "Music, shows, videos, and the people behind an independent band.",
        TEAL,
        x=64,
        y=250,
        title_size=92,
        max_width=760,
    )
    footer(card, TEAL, "BANDS")
    return card


def card_musician():
    card = new_card((120, 210, 255), "bt-radio-speaker-crisp.jpg", 0.48, (10, 28, 40))
    paste(card, load_icon(150), (64, 78))
    heading(
        card,
        "MUSICIAN PROFILE",
        "THE\nPLAYER",
        "Singers, players, and songwriters from the independent scene.",
        TEAL,
        x=64,
        y=250,
        title_size=92,
        max_width=780,
    )
    footer(card, TEAL, "MUSICIANS")
    return card


def card_venue():
    card = new_card(ORANGE, "assets/collage/seed-03.jpg", 0.5, (40, 18, 8))
    paste(card, load_icon(140), (64, 78))
    heading(
        card,
        "VENUE PROFILE",
        "THE ROOM",
        "Bars, listening rooms, and stages that keep live music playing.",
        GOLD,
        x=64,
        y=250,
        title_size=92,
        max_width=760,
    )
    footer(card, GOLD, "VENUES")
    return card


def card_shows():
    card = new_card(ORANGE, "bt-wide-crowd.jpg", 0.66, (28, 12, 8))
    heading(
        card,
        "LIVE CALENDAR",
        "SHOWS",
        "Upcoming nights from bands, musicians, and venues. Go to shows.",
        ORANGE,
        x=64,
        y=150,
        title_size=108,
        max_width=680,
    )
    ticket = Image.new("RGBA", (250, 320), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ticket)
    draw.rounded_rectangle((10, 10, 240, 310), 18, fill=(18, 10, 8, 245), outline=ORANGE, width=4)
    draw.line((10, 210, 240, 210), fill=ORANGE, width=3)
    for y in range(24, 200, 18):
        draw.line((28, y, 40, y), fill=ORANGE, width=3)
    draw.text((36, 70), "LIVE", font=font(FONT_B, 48), fill=WHITE)
    draw.text((36, 132), "ADMIT ONE", font=font(FONT_S, 20), fill=ORANGE)
    draw.text((36, 236), "TONIGHT", font=font(FONT_B, 28), fill=WHITE)
    paste(card, ticket, (880, 120))
    footer(card, ORANGE, "SHOWS")
    return card


def card_join():
    card = new_card(TEAL)
    paste(card, load_icon(150), (64, 78))
    heading(
        card,
        "FREE ACCOUNT",
        "JOIN\nTHE SCENE",
        "Bands, musicians, venues, and fans. Free to create an account.",
        TEAL,
        x=64,
        y=250,
        title_size=84,
        max_width=700,
    )
    stamp = Image.new("RGBA", (280, 280), (0, 0, 0, 0))
    draw = ImageDraw.Draw(stamp)
    draw.ellipse((12, 12, 268, 268), outline=TEAL, width=8)
    draw.ellipse((28, 28, 252, 252), outline=TEAL, width=2)
    draw.text((140, 118), "FREE", font=font(FONT_B, 54), fill=TEAL, anchor="ma")
    paste(card, stamp, (860, 130))
    footer(card, TEAL, "JOIN")
    return card


def polaroid(path, angle):
    photo = cover(path, (230, 210), (0.5, 0.35))
    frame = Image.new("RGBA", (270, 310), (244, 240, 230, 255))
    frame.paste(photo, (20, 20))
    shadow = Image.new("RGBA", (290, 330), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((8, 8, 282, 322), 4, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    board = Image.new("RGBA", (320, 360), (0, 0, 0, 0))
    board.alpha_composite(shadow, (8, 10))
    board.alpha_composite(frame, (16, 12))
    return board.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def card_collage():
    card = new_card((201, 164, 106))
    heading(
        card,
        "COLLAGE WALL",
        "CAUGHT IN\nTHE CROWD",
        "Show photos, dropped on a shared wall.",
        GOLD,
        x=48,
        y=120,
        title_size=64,
        max_width=520,
    )
    frames = [
        ("assets/collage/seed-01.jpg", -8, 620, 150),
        ("assets/collage/seed-05.jpg", 7, 860, 120),
        ("assets/collage/seed-03.jpg", -2, 760, 300),
    ]
    for path, angle, x, y in frames:
        paste(card, polaroid(path, angle), (x, y))
    footer(card, GOLD, "COLLAGE")
    return card


def card_profile():
    card = new_card(TEAL)
    paste(card, load_icon(168), (64, 86))
    heading(
        card,
        "BAND  ·  MUSICIAN  ·  VENUE",
        "PROFILE",
        "Bands, musicians, and venues. One public page on BANDtroductions.",
        TEAL,
        x=268,
        y=110,
        title_size=92,
        max_width=860,
    )
    draw = ImageDraw.Draw(card)
    labels = ("BAND", "MUSICIAN", "VENUE")
    x = 268
    for label in labels:
        width = int(draw.textlength(label, font=font(FONT_B, 22))) + 36
        draw.rounded_rectangle((x, 430, x + width, 478), 24, outline=TEAL, width=3)
        draw.text((x + 18, 440), label, font=font(FONT_B, 22), fill=WHITE)
        x += width + 16
    footer(card, TEAL, "PROFILES")
    return card


def card_merch():
    card = new_card(TEAL)
    hoodie = cover("merch-platform-hoodie.webp", (560, 630), (0.5, 0.42))
    hoodie = ImageEnhance.Brightness(hoodie).enhance(0.92)
    card.paste(hoodie, (640, 0))
    fade = Image.new("L", (220, H), 0)
    for x in range(220):
        fade.paste(int(255 * (1 - x / 220)), (x, 0, x + 1, H))
    black = Image.new("RGBA", (220, H), INK + (255,))
    black.putalpha(fade)
    card.alpha_composite(black, (640, 0))
    heading(
        card,
        "MARKETPLACE",
        "MERCH",
        "Official gear and independent artist merch, in one music-first shop.",
        TEAL,
        x=64,
        y=180,
        title_size=96,
        max_width=620,
    )
    footer(card, TEAL, "MERCH")
    return card


def card_sponsors():
    card = new_card(TEAL)
    paste(card, load_icon(160), (64, 86))
    heading(
        card,
        "FOR BUSINESSES",
        "SPONSOR\nTHE SCENE",
        "Reach bands, musicians, venues, and fans while supporting independent music.",
        TEAL,
        x=64,
        y=270,
        title_size=78,
        max_width=900,
    )
    footer(card, TEAL, "SPONSORS")
    return card


def main():
    cards = {
        "botw.jpg": card_botw(),
        "radio.jpg": card_radio(),
        "btv.jpg": card_btv(),
        "plans.jpg": card_plans(),
        "band.jpg": card_band(),
        "musician.jpg": card_musician(),
        "venue.jpg": card_venue(),
        "shows.jpg": card_shows(),
        "join.jpg": card_join(),
        "collage.jpg": card_collage(),
        "profile.jpg": card_profile(),
        "merch.jpg": card_merch(),
        "sponsors.jpg": card_sponsors(),
    }
    for name, card in cards.items():
        save(card, name)
    shutil.copyfile(os.path.join(OUT, "botw.jpg"), os.path.join(OUT, "botw-current.jpg"))
    print("botw-current.jpg: copy of botw.jpg")


if __name__ == "__main__":
    main()
