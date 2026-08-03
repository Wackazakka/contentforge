#!/usr/bin/env python3
"""
Reforhandle TikTok video generator
- Stills + ElevenLabs voiceover + background music
- Output: MP4 for TikTok
"""

from moviepy import AudioArrayClip
from moviepy import *
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import os
import json
import sys
import subprocess
import tempfile
import urllib.request

OUT_DIR = "/root/.openclaw/workspace/reforhandle-content"
ASSETS  = f"{OUT_DIR}/assets"
VO_DIR  = f"{OUT_DIR}/vo"
MUSIC   = f"{OUT_DIR}/background_music.mp3"

# Default dimensions (will be overridden by config)
W, H = 1080, 1920
DALL_E_SIZES = {'9:16': '1024x1792', '1:1': '1024x1024', '16:9': '1792x1024'}

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Reforhandle brand colors
COLOR_GREEN = "#16a34a"  # Primary green
COLOR_DARK = "#1f2937"   # Dark gray
COLOR_WHITE = "#ffffff"  # White

# Bildetilpasning: 'cover' = fyll rammen (beskjaerer), 'contain' = hele
# bildet med sort rundt (Lars 31/7: artistenes pressebilder/artwork er
# komposisjoner — de skal ikke beskjaeres). Settes fra config.imageFit.
_IMAGE_FIT = 'cover'

def make_bg_frame(bg_path):
    """Prepare background with overlays as numpy array."""
    bg = Image.open(bg_path).convert("RGBA")
    if _IMAGE_FIT == 'contain':
        # Hele bildet synlig, sort utenfor
        scale = min(W / bg.width, H / bg.height)
        bg = bg.resize((max(1, int(bg.width*scale)), max(1, int(bg.height*scale))), Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        canvas.paste(bg, ((W - bg.width)//2, (H - bg.height)//2))
        bg = canvas
    else:
        # Scale to fill
        scale = max(W / bg.width, H / bg.height)
        bg = bg.resize((int(bg.width*scale), int(bg.height*scale)), Image.LANCZOS)
        cx, cy = bg.width//2, bg.height//2
        bg = bg.crop((cx-W//2, cy-H//2, cx+W//2, cy+H//2))

    # Light overall dim
    dim = Image.new("RGBA", (W, H), (0, 0, 0, 45))
    bg = Image.alpha_composite(bg, dim)

    # Dark text zone bottom 25% (more transparent)
    bar = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bar)
    draw.rectangle([(0, int(H*0.78)), (W, H)], fill=(10, 10, 25, 185))
    bg = Image.alpha_composite(bg, bar)

    return np.array(bg.convert("RGB"))

def make_text_frame(lines, sub=None, logo_url=None):
    """Text-only layer on transparent background."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    y = int(H * 0.80)  # start litt under feltets topp (H*0.78)
    pad = 60
    for line in lines:
        size = line.get("size", 52)
        color = line.get("color", COLOR_WHITE)
        bold = line.get("bold", True)
        font = ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)
        text = line["text"]

        # Split on explicit newlines first, then word-wrap each part
        paragraphs = text.split('\n')
        wrapped = []
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                wrapped.append('')  # preserve blank lines
                continue
            words = paragraph.split()
            current = ""
            for w in words:
                test = (current + " " + w).strip()
                bbox = draw.textbbox((0, 0), test, font=font)
                if bbox[2] - bbox[0] > W - 80:
                    if current:
                        wrapped.append(current)
                    current = w
                else:
                    current = test
            if current:
                wrapped.append(current)

        for wline in wrapped:
            if wline == '':
                y += int(font.size * 0.5)  # half-line spacing for blank lines
                continue
            bbox = draw.textbbox((0, 0), wline, font=font)
            x = (W - (bbox[2] - bbox[0])) // 2
            draw.text((x, y), wline, font=font, fill=color)
            y += bbox[3] - bbox[1] + 8

        y += line.get("margin_bottom", 8)

    # Brand logo on right side (transparent PNG, not over text)
    logo_path = None
    fallback_logo = ""  # No fallback logo — only use product logo if provided

    if logo_url:
        try:
            import urllib.request
            import tempfile
            logo_tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
            req = urllib.request.Request(logo_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                logo_tmp.write(resp.read())
            logo_tmp.flush()
            logo_path = logo_tmp.name
            print(f"[make_text_frame] Downloaded logo from {logo_url}", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Could not download logo from {logo_url}: {e}", file=sys.stderr)
            logo_path = None

    # Fallback to local logo if no URL or download failed
    if not logo_path and os.path.exists(fallback_logo):
        logo_path = fallback_logo
        print(f"[make_text_frame] Using fallback logo at {fallback_logo}", file=sys.stderr)

    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo_h = 120  # Larger logo
            logo_w = int(logo.width * (logo_h / logo.height))
            logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
            # Place on right side, below text area
            logo_x = W - logo_w - pad
            logo_y = H - logo_h - 100
            layer.paste(logo, (logo_x, logo_y), logo)
            print(f"[make_text_frame] Logo pasted successfully", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Could not load logo: {e}", file=sys.stderr)

    if sub:
        sub_font = ImageFont.truetype(FONT_BOLD, 46)
        # Word-wrap subtitle to fit within dark bar
        words = sub.split()
        sub_lines = []
        current = ""
        for w in words:
            test = (current + " " + w).strip()
            bbox = draw.textbbox((0, 0), test, font=sub_font)
            if bbox[2] - bbox[0] > W - 100:
                if current:
                    sub_lines.append(current)
                current = w
            else:
                current = test
        if current:
            sub_lines.append(current)

        # Centre text block vertically in dark bar (H*0.79 → H*0.97)
        bar_top  = int(H * 0.80)
        bar_bot  = int(H * 0.97)
        line_h   = int(sub_font.size * 1.25)
        total_h  = len(sub_lines) * line_h
        start_y  = bar_top + max(0, (bar_bot - bar_top - total_h) // 2)

        for sline in sub_lines:
            bbox = draw.textbbox((0, 0), sline, font=sub_font)
            x = (W - (bbox[2] - bbox[0])) // 2
            # Drop-shadow for legibility
            draw.text((x + 2, start_y + 2), sline, font=sub_font, fill=(0, 0, 0, 200))
            draw.text((x, start_y), sline, font=sub_font, fill=COLOR_WHITE)
            start_y += line_h
    return np.array(layer)

import subprocess as _sp, re as _re, json as _json

# Stemmens peak-maal i dBFS. -1,5 ga tale 7 dB OVER musikken (Lars 31/7:
# «rett og slett for hoy») — -6 legger den ~2-3 dB over musikkens topper:
# tydelig foran, uten aa overdoyve. Overstyrbar via config.mix.voicePeakDb.
_VOICE_PEAK_DB = -6.0

def _normalize_voice(vo_path):
    """PEAK-normaliser stemmen til _VOICE_PEAK_DB — i RENDEREREN, siste ledd
    foer miksen. loudnorm er UPAALITELIG paa klipp < ~3 s (maalt 2026-07-30:
    'target_offset 27.96' men leverte -41 dB — den KNUSTE korte taleklipp).
    Peak-maaling + konstant gain kan ikke bomme, uansett klipplengde.
    Gain brukes BEGGE veier (ogsaa demping), saa maalet alltid treffes.
    Skriver .mix.mp3 ved siden av; feiler noe, returneres originalen."""
    try:
        out = vo_path + '.mix.mp3'
        p1 = _sp.run(['ffmpeg', '-i', vo_path, '-af', 'volumedetect', '-f', 'null', '-'],
                     capture_output=True, text=True, timeout=60)
        m = _re.search(r'max_volume:\s*(-?[0-9.]+) dB', p1.stderr)
        if not m:
            return vo_path
        gain = _VOICE_PEAK_DB - float(m.group(1))
        if abs(gain) <= 0.1:
            return vo_path  # allerede paa maalet
        _sp.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', vo_path,
                 '-af', 'volume=%.2fdB' % gain, '-c:a', 'libmp3lame', '-b:a', '160k', out],
                check=True, timeout=60)
        print('[normalize_voice] %s: %+.1f dB (peak -> %.1f)' % (vo_path.split('/')[-1], gain, _VOICE_PEAK_DB))
        return out
    except Exception as e:
        print(f'[normalize_voice] hoppet over: {e}')
        return vo_path


def _extend_boomerang(v, duration):
    """Forleng et videoklipp til `duration` med frem-baklengs-frem-looping —
    bevegelsen lever hele klippet (Lars 2026-07-30), soemloese vendepunkter."""
    if v.duration >= duration:
        return v.subclipped(0, duration)
    parts = []
    covered = 0.0
    forward = True
    while covered < duration - 1e-6:
        parts.append(v if forward else v.with_effects([vfx.TimeMirror()]))
        covered += v.duration
        forward = not forward
    out = concatenate_videoclips(parts)
    return out.subclipped(0, duration) if out.duration > duration else out

def make_segment(bg_path, lines, vo_path, sub=None, logo_url=None, hold=0.0):
    """Create single video segment from background + text + voiceover.

    hold: ekstra hviletid (sek) ETTER at stemmen er ferdig — bildet blir
    staaende og musikken faar plass (duckingen loefter den automatisk).
    Additivt: hold=0 gir noeyaktig gammel oppfoersel. (Musikkdrevet tempo,
    Lars/IndigoBoom 2026-07-30.)

    vo_path=None: STILLE segment (Lars 31/7) — bare bilde + musikk.
    Stemmelengde 0 gir duration = 0.4 + hold, saa film=musikk-matten
    gaar opp uendret. Ingen audio => duckingen lar musikken staa."""
    vo = AudioFileClip(_normalize_voice(vo_path)) if vo_path else None
    duration = (vo.duration if vo else 0.0) + 0.4 + max(0.0, float(hold or 0))

    bg_arr = make_bg_frame(bg_path)
    txt_arr = make_text_frame(lines, sub, logo_url=logo_url)

    bg_clip  = ImageClip(bg_arr, duration=duration)
    txt_clip = ImageClip(txt_arr, duration=duration).with_effects([vfx.FadeIn(0.5)])

    comp = CompositeVideoClip([bg_clip, txt_clip], size=(W, H))
    if vo is not None:
        comp = comp.with_audio(vo)
    return comp

def make_dim_bar_overlay():
    """Transparent overlay: light overall dim + dark bottom text bar (matches make_bg_frame)."""
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 45))
    draw = ImageDraw.Draw(ov)
    draw.rectangle([(0, int(H*0.78)), (W, H)], fill=(10, 10, 25, 185))
    return np.array(ov)  # (H, W, 4)


def make_segment_video(clip_path, lines, vo_path, sub=None, logo_url=None, hold=0.0):
    """Like make_segment but uses a video clip (image-to-video) as the moving background.

    hold: se make_segment. Bevegelsesklipp saktnes aldri mot hold-tiden
    (ville gitt slow motion-suppe) — de saktnes mot talelengden som foer,
    og fryses ut hviletiden.

    vo_path=None: stille segment — klippet fyller 0.4 + hold, ingen lyd."""
    vo = AudioFileClip(_normalize_voice(vo_path)) if vo_path else None
    base_duration = (vo.duration if vo else 0.0) + 0.4
    duration = base_duration + max(0.0, float(hold or 0))

    # Video background: cover = scale-fill + center-crop; contain = hele
    # bildet med sort rundt (samme valg som stillbildene, Lars 31/7)
    src = VideoFileClip(clip_path)
    # Fabric lip-sync-klipp baerer lyd; pixverse/kling-bevegelsesklipp gjoer ikke det.
    is_talk = src.audio is not None
    v = src.without_audio()
    if _IMAGE_FIT == 'contain':
        scale = min(W / v.w, H / v.h)
        v = v.resized((round(v.w * scale), round(v.h * scale)))
    else:
        scale = max(W / v.w, H / v.h)
        v = v.resized((round(v.w * scale), round(v.h * scale)))
        v = v.cropped(x_center=v.w / 2, y_center=v.h / 2, width=W, height=H)
    if is_talk:
        # Lip-sync: ALDRI tidsstrekk - munnen maa foelge voiceoveren 1:1.
        # Spill i naturlig tempo fra t=0 (samme start som vo) og frys siste
        # bilde ut resten av segmentet i stedet.
        # Foerste gjennomspilling naturlig (munn = stemme); resten boomerang —
        # animasjonen fortsetter hele klippet (Lars 2026-07-30; lip-sync-
        # kompromisset er kjent og akseptert).
        v = _extend_boomerang(v, duration)
    # Fit to voiceover length: trim if longer, loop if shorter
    elif v.duration >= duration:
        v = v.subclipped(0, duration)
    else:
        v = _extend_boomerang(v, duration)

    # Dim + bottom bar overlay (same look as stills)
    ov_rgba = make_dim_bar_overlay()
    ov_clip = ImageClip(ov_rgba[:, :, :3], duration=duration).with_mask(
        ImageClip(ov_rgba[:, :, 3] / 255.0, is_mask=True, duration=duration)
    )

    # Subtitle/text overlay (reuse existing renderer)
    txt_arr = make_text_frame(lines, sub, logo_url=logo_url)
    txt_clip = ImageClip(txt_arr, duration=duration).with_effects([vfx.FadeIn(0.5)])

    if _IMAGE_FIT == 'contain':
        # Sort bakgrunn + sentrert klipp (klippet dekker ikke hele rammen)
        base = ColorClip(size=(W, H), color=(0, 0, 0)).with_duration(duration)
        comp = CompositeVideoClip([base, v.with_position('center'), ov_clip, txt_clip], size=(W, H))
    else:
        comp = CompositeVideoClip([v, ov_clip, txt_clip], size=(W, H))
    if vo is not None:
        comp = comp.with_audio(vo)
    return comp


def encode_video(input_path, output_path):
    """Encode video file using direct ffmpeg subprocess call."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        output_path,
    ]
    print(f"  ffmpeg: {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    if result.returncode != 0:
        raise Exception(f"ffmpeg encoding failed:\n{result.stderr.decode()}")


def _hex_to_rgb(hex_color, default=(26, 26, 46)):
    """Parse a #rrggbb color string into an (r, g, b) tuple."""
    if not hex_color or not isinstance(hex_color, str):
        return default
    s = hex_color.strip().lstrip('#')
    if len(s) == 3:
        s = ''.join(c * 2 for c in s)
    if len(s) != 6:
        return default
    try:
        return tuple(int(s[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        return default


def _wrap_text(draw, text, font, max_width):
    """Word-wrap text to fit max_width pixels."""
    words = (text or '').split()
    lines, current = [], ''
    for w in words:
        test = (current + ' ' + w).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_width and current:
            lines.append(current)
            current = w
        else:
            current = test
    if current:
        lines.append(current)
    return lines



def _draw_brand_card(cfg, width, height):
    """Merkekort til slutt (Lars 1/8): tenantens logo + «<Navn> VideoMaker»
    + adressen (Lars 3/8: «du kan også skrive indigoboom.com/videomaker på
    plakaten»). Kommer ETTER artistens sluttplakat og erstatter den aldri —
    artistens egen oppfordring er det viktigste i filmen.

    Hele blokken sentreres som ÉN enhet. Før lå logoen fast på 40 % høyde og
    teksten fulgte under; siden tekststørrelsen følger BREDDEN, endte blokken
    ulikt i de tre formatene — 16:9 fikk en stor tom flate under seg.
    """
    bg = _hex_to_rgb(cfg.get('bgColor'), (20, 20, 30))
    fg = _hex_to_rgb(cfg.get('textColor'), (255, 255, 255))
    img = Image.new('RGB', (width, height), bg)
    draw = ImageDraw.Draw(img)

    logo = None
    logo_url = cfg.get('logoUrl')
    if logo_url:
        try:
            tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
            req = urllib.request.Request(logo_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                tmp.write(resp.read())
            tmp.flush()
            logo = Image.open(tmp.name).convert('RGBA')
            ratio = min((width * 0.42) / logo.width, (height * 0.22) / logo.height)
            logo = logo.resize((max(1, int(logo.width * ratio)), max(1, int(logo.height * ratio))), Image.LANCZOS)
        except Exception as e:
            print(f'[brand_card] logo hoppet over: {e}', file=sys.stderr)
            logo = None

    tekst = cfg.get('text') or 'VideoMaker'
    size = max(34, min(64, width // 20))
    font = ImageFont.truetype(FONT_REG, size)
    tbb = draw.textbbox((0, 0), tekst, font=font)
    t_h = tbb[3] - tbb[1]

    url = (cfg.get('url') or '').strip()
    ufont = None
    ubb = None
    u_h = 0
    if url:
        ufont = ImageFont.truetype(FONT_REG, max(24, int(size * 0.62)))
        ubb = draw.textbbox((0, 0), url, font=ufont)
        u_h = ubb[3] - ubb[1]

    gap1 = int(height * 0.035)
    gap2 = int(height * 0.022)
    total = (logo.height + gap1 if logo else 0) + t_h + (gap2 + u_h if url else 0)
    y = (height - total) // 2

    if logo:
        img.paste(logo, ((width - logo.width) // 2, y), logo)
        y += logo.height + gap1
    draw.text(((width - (tbb[2] - tbb[0])) // 2, y - tbb[1]), tekst, font=font, fill=fg)
    if url:
        y += t_h + gap2
        draw.text(((width - (ubb[2] - ubb[0])) // 2, y - ubb[1]), url, font=ufont, fill=fg)
    return img


def _draw_outro(outro_cfg, width, height):
    primary = _hex_to_rgb(outro_cfg.get('primaryColor'), (26, 26, 46))
    secondary_hex = outro_cfg.get('secondaryColor') or '#ffffff'
    secondary = _hex_to_rgb(secondary_hex, (255, 255, 255))
    url = outro_cfg.get('url') or ''
    cta = outro_cfg.get('cta') or ''
    logo_url = outro_cfg.get('logoUrl')

    # 1. Build the frame image
    img = Image.new('RGB', (width, height), primary)
    draw = ImageDraw.Draw(img)

    pad = 80
    max_w = width - 2 * pad
    secondary_rgb = secondary

    # Logo (upper area, ~30% from top, max 500px wide / 300px tall, aspect-ratio preserved)
    logo_bottom_y = int(height * 0.30)
    if logo_url:
        try:
            logo_tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
            req = urllib.request.Request(logo_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                logo_tmp.write(resp.read())
            logo_tmp.flush()
            logo = Image.open(logo_tmp.name).convert('RGBA')
            max_logo_w = int(width * 0.85)  # opp fra 0.6 - storre logo pa sluttplakaten
            max_logo_h = int(height * 0.54) # opp fra 0.18 (~3x) etter onske
            ratio = min(max_logo_w / logo.width, max_logo_h / logo.height)  # ikke 1.0-tak: liten logo skaleres ogsa opp
            new_w = int(logo.width * ratio)
            new_h = int(logo.height * ratio)
            logo = logo.resize((new_w, new_h), Image.LANCZOS)
            logo_x = (width - logo.width) // 2
            logo_y = int(height * 0.30) - logo.height // 2
            img.paste(logo, (logo_x, logo_y), logo)
            logo_bottom_y = logo_y + logo.height
            print(f"[render_outro_card] Logo placed at ({logo_x}, {logo_y}), size={logo.width}x{logo.height}", flush=True)
        except Exception as e:
            print(f"[render_outro_card] Logo download/render failed: {e}", file=sys.stderr)

    # CTA text (medium, centered below logo)
    cta_bottom_y = logo_bottom_y + 40  # default when there is no CTA
    if cta:
        cta_font_size = max(36, min(64, width // 18))
        cta_font = ImageFont.truetype(FONT_REG, cta_font_size)
        cta_lines = _wrap_text(draw, cta, cta_font, max_w)
        y = logo_bottom_y + 60
        for ln in cta_lines:
            bbox = draw.textbbox((0, 0), ln, font=cta_font)
            x = (width - (bbox[2] - bbox[0])) // 2
            draw.text((x, y), ln, font=cta_font, fill=secondary_rgb)
            y += (bbox[3] - bbox[1]) + 12
        cta_bottom_y = y  # remember where the CTA ended so the URL never overlaps it

    # URL (large bold, near bottom third).
    # Dedup (Lars 31/7): staar lenken allerede i budskapet, vises den ikke
    # en gang til i gigantskrift — en gang holder.
    if url:
        _disp = url.replace('https://', '').replace('http://', '').rstrip('/')
        if cta and _disp.lower() in cta.lower():
            print(f"[render_outro_card] Lenken staar i budskapet - egen lenkelinje droppes", flush=True)
            url = ''
    if url:
        display_url = url.replace('https://', '').replace('http://', '').rstrip('/')
        url_font_size = max(48, min(96, width // 12))
        # Fit url to width
        url_font = ImageFont.truetype(FONT_BOLD, url_font_size)
        bbox = draw.textbbox((0, 0), display_url, font=url_font)
        while bbox[2] - bbox[0] > max_w and url_font_size > 24:
            url_font_size -= 4
            url_font = ImageFont.truetype(FONT_BOLD, url_font_size)
            bbox = draw.textbbox((0, 0), display_url, font=url_font)
        x = (width - (bbox[2] - bbox[0])) // 2
        y = max(int(height * 0.66), cta_bottom_y + 30)
        draw.text((x, y), display_url, font=url_font, fill=secondary_rgb)
        url_bottom_y = y + (bbox[3] - bbox[1])
    else:
        url_bottom_y = max(int(height * 0.66), cta_bottom_y + 30)

    # Kontaktlinje: telefon under URL-en (diskret, regular font)
    phone = outro_cfg.get('phone') or ''
    if phone:
        ph_text = 'tlf. ' + str(phone)
        ph_font_size = max(30, min(54, width // 24))
        ph_font = ImageFont.truetype(FONT_REG, ph_font_size)
        pb = draw.textbbox((0, 0), ph_text, font=ph_font)
        px = (width - (pb[2] - pb[0])) // 2
        py = url_bottom_y + 28
        draw.text((px, py), ph_text, font=ph_font, fill=secondary_rgb)

    return img


def build_outro_frame(outro_cfg, width, height):
    """Tegn sluttplakatens bilde (uten lyd/video). Brukes baade av den
    separate plakat-videoen (jingle-veien) og som ET KLIPP I FILMEN naar
    musikken skal gaa uavbrutt gjennom plakaten (Lars 31/7: «ingen grunn
    til aa klippe og lime der»)."""
    return _draw_outro(outro_cfg, width, height)


def render_outro_card(outro_cfg, output_path, width, height, jingle_path=None,
                      music_path=None, music_start=0.0, music_vol=0.38):
    """Render a 3-second branded outro card and save as mp4 to output_path.

    outro_cfg dict keys: url, cta, logoUrl, primaryColor, secondaryColor, durationSeconds.
    """
    duration = int(outro_cfg.get('durationSeconds') or 3)
    img = _draw_outro(outro_cfg, width, height)

    # 2. Save the frame PNG
    work_dir = os.path.dirname(output_path)
    frame_path = os.path.join(work_dir, 'outro_frame.png')
    img.save(frame_path)
    print(f"[render_outro_card] Frame saved → {frame_path}", flush=True)

    # 3. Build mp4 with either jingle audio or silent track
    if jingle_path and os.path.exists(jingle_path):
        # Let the outro last as long as the jingle so it is not cut off, capped at 10s.
        MAX_OUTRO_SECONDS = 10.0
        jingle_dur = None
        try:
            _probe = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'csv=p=0', jingle_path],
                capture_output=True, timeout=20)
            jingle_dur = float(_probe.stdout.decode().strip())
        except Exception as _e:
            print(f'[render_outro_card] Jingle duration probe failed: {_e}', file=sys.stderr)
        if jingle_dur and jingle_dur > 0:
            outro_dur = min(max(float(duration), jingle_dur), MAX_OUTRO_SECONDS)
        else:
            outro_dur = float(duration)
        # Fade out only when the jingle is longer than the cap (actually cut); otherwise play it whole.
        # Loudness-normaliser jingelen til talenivaa (-16 LUFS, som radio-flyten) --
        # musikk er ellers mye hoyere enn ElevenLabs-voiceover.
        filters = ['loudnorm=I=-22:TP=-2:LRA=11']  # kalibrert mot talenivaaet i videoene (tale ~ -23 LUFS)
        if jingle_dur and jingle_dur > outro_dur + 0.05:
            filters.append(f'afade=t=out:st={max(0.0, outro_dur - 1.0):.2f}:d=1')
        audio_filter = ['-af', ','.join(filters)]
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', frame_path,
            '-i', jingle_path,
            '-map', '0:v', '-map', '1:a',
            '-t', f'{outro_dur:.2f}',
            '-vf', f'scale={width}:{height}',
            '-r', '24',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '44100',
            *audio_filter,
            '-movflags', '+faststart',
            output_path,
        ]
        print(f'[render_outro_card] Using jingle: {jingle_path} (outro {outro_dur:.2f}s, jingle {jingle_dur}s)', flush=True)
    elif music_path and os.path.exists(music_path):
        # Ingen jingle: la MUSIKKEN fortsette under plakaten (Lars 31/7 —
        # «musikken sluttet der sluttplakaten kom inn»). Vi fortsetter fra
        # der filmen slapp (music_start) paa samme nivaa som ellers, med
        # myk uttoning de siste sekundene saa slutten ikke er braa.
        fade = min(1.5, float(duration) * 0.6)
        af = (f'volume={music_vol:.3f},'
              f'afade=t=out:st={max(0.0, float(duration) - fade):.2f}:d={fade:.2f}')
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', frame_path,
            '-ss', f'{max(0.0, float(music_start)):.2f}', '-i', music_path,
            '-map', '0:v', '-map', '1:a',
            '-t', str(duration),
            '-vf', f'scale={width}:{height}',
            '-r', '24',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-af', af,
            '-c:a', 'aac', '-ar', '44100',
            '-movflags', '+faststart',
            output_path,
        ]
        print(f'[render_outro_card] Musikken fortsetter under plakaten (fra {music_start:.1f}s, {duration}s, fade {fade:.1f}s)', flush=True)
    else:
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', frame_path,
            '-f', 'lavfi', '-i', f'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-t', str(duration),
            '-vf', f'scale={width}:{height}',
            '-r', '24',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-shortest',
            '-movflags', '+faststart',
            output_path,
        ]
    print(f"[render_outro_card] ffmpeg: {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    if result.returncode != 0:
        raise Exception(f"outro ffmpeg failed:\n{result.stderr.decode()}")
    print(f"[render_outro_card] Outro clip saved → {output_path}", flush=True)
    return output_path


def concat_videos(main_path, outro_path, final_path):
    """Concat main video + outro clip into final_path using ffmpeg concat demuxer."""
    work_dir = os.path.dirname(final_path)
    list_path = os.path.join(work_dir, 'concat_list.txt')
    with open(list_path, 'w') as f:
        f.write(f"file '{main_path}'\n")
        f.write(f"file '{outro_path}'\n")

    # Re-encode during concat to ensure consistent codec/container.
    cmd = [
        'ffmpeg', '-y',
        '-i', main_path,
        '-i', outro_path,
        '-filter_complex',
        '[0:v]setsar=1,fps=24[v0];[1:v]setsar=1,fps=24[v1];[0:a]aresample=44100[a0];[1:a]aresample=44100[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '44100',
        '-movflags', '+faststart',
        final_path,
    ]
    print(f"[concat_videos] ffmpeg: {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    if result.returncode != 0:
        raise Exception(f"concat ffmpeg failed:\n{result.stderr.decode()}")
    print(f"[concat_videos] Concatenated → {final_path}", flush=True)



def _duck_music(music_path, clips, duck_vol=0.08, full_vol=0.38, fade_secs=0.30, fade_tail=True):
    """Auto-ducking: lower music volume while voice is active, rise during 0.4s end gap."""
    import numpy as np
    total = sum(c.duration for c in clips)
    # Loop the track to fill the full video when the music is shorter than the video
    # (otherwise subclipped(0, total) raises ValueError: end_time > clip duration).
    _music_src = AudioFileClip(music_path)
    if _music_src.duration < total:
        _n_loops = int(total // _music_src.duration) + 1
        music = concatenate_audioclips([AudioFileClip(music_path) for _ in range(_n_loops)]).subclipped(0, total)
    else:
        music = _music_src.subclipped(0, total)
    fps = music.fps
    music_arr = music.to_soundarray(fps=fps)   # (n_frames, channels)
    n = len(music_arr)
    env = np.full(n, full_vol, dtype=np.float64)
    fade_n = max(1, int(fade_secs * fps))

    t = 0.0
    for clip in clips:
        dur = clip.duration
        # Faktisk stemmelengde fra klippets audio (presist ogsaa med hold-tid).
        # Ingen audio = STILLE segment (31/7) — musikken skal staa i full
        # hoyde, ingen ducking. (Alle segmenter MED tale baerer alltid audio.)
        try:
            vo_dur = float(clip.audio.duration) if clip.audio is not None else 0.0
        except Exception:
            vo_dur = max(0.0, dur - 0.4)
        vo_dur = min(vo_dur, dur)
        if vo_dur > 0:
            vs = int(t * fps)
            ve = min(n, int((t + vo_dur) * fps))
            # smooth ramp down into duck
            ramp_s = max(0, vs - fade_n // 2)
            ramp_e = min(n, ramp_s + fade_n)
            env[ramp_s:ramp_e] = np.linspace(full_vol, duck_vol, ramp_e - ramp_s)
            # flat duck zone
            env[min(n, vs):ve] = duck_vol
            # smooth ramp back up after voice
            ramp_s2 = min(n, ve - fade_n // 2)
            ramp_e2 = min(n, ramp_s2 + fade_n)
            env[ramp_s2:ramp_e2] = np.linspace(duck_vol, full_vol, ramp_e2 - ramp_s2)
        t += dur

    # Fade ut musikken de siste ~1.2 s i stedet for braatt kutt ved videoslutt.
    # MEN: kommer det en sluttplakat som SELV har musikk, skal det ikke fades
    # her — da ville lyden gaatt ned, hoppet opp igjen naar plakaten starter,
    # og ned en gang til (Lars 31/7: «fade foer sluttplakaten, saa plutselig
    # hoyt og saa en ny fade»). Plakaten eier uttoningen i det tilfellet.
    if fade_tail:
        fade_out_n = min(n, int(1.2 * fps))
        if fade_out_n > 1:
            env[n - fade_out_n:] *= np.linspace(1.0, 0.0, fade_out_n)

    result = music_arr * env[:, np.newaxis] if music_arr.ndim == 2 else music_arr * env
    return AudioArrayClip(result, fps=fps)


def build_video(segments_def, output_path, backgroundMusicPath=None, logoUrl=None, outroCard=None, mix=None, brandCard=None):
    """Build full video from segments."""
    print("🎬 Bygger Reforhandle TikTok video...")

    if backgroundMusicPath is None:
        backgroundMusicPath = MUSIC

    # Stemme-peak kan overstyres fra config (mix.voicePeakDb) — settes FOER
    # segmentbyggingen, det er der _normalize_voice kalles.
    global _VOICE_PEAK_DB
    try:
        if mix and mix.get('voicePeakDb') is not None:
            _VOICE_PEAK_DB = float(mix['voicePeakDb'])
            print(f"[mix] voicePeakDb overstyrt: {_VOICE_PEAK_DB}")
    except Exception as e:
        print(f"[mix] ugyldig voicePeakDb ignorert: {e}")

    clips = []
    for i, seg in enumerate(segments_def):
        print(f"  📹 Segment {i+1}/{len(segments_def)}...")
        seg_hold = float(seg.get("hold") or 0)
        seg_vo = seg.get("vo_path") or None  # None = stille segment
        if seg.get("clip"):
            clip = make_segment_video(seg["clip"], seg["lines"], seg_vo, seg.get("sub"), logo_url=logoUrl, hold=seg_hold)
        else:
            clip = make_segment(seg["bg"], seg["lines"], seg_vo, seg.get("sub"), logo_url=logoUrl, hold=seg_hold)
        if i > 0:
            clip = clip.with_effects([vfx.FadeIn(0.3)])
        clips.append(clip)

    # Sluttplakat UTEN jingle: legg den inn som et KLIPP i filmen i stedet for
    # aa lage en egen video og skjoete den paa (Lars 31/7: «hoerbart klipp i
    # musikken akkurat der plakaten begynner … ingen grunn til aa klippe og
    # lime der»). Da er musikken én sammenhengende stroem hele veien, og
    # uttoningen skjer én gang — paa slutten av plakaten.
    outro_in_timeline = bool(outroCard) and not outroCard.get('jingleFile') and os.path.exists(backgroundMusicPath)
    if outro_in_timeline:
        _od = float(outroCard.get('durationSeconds') or 3)
        _frame = np.array(_draw_outro(outroCard, W, H).convert('RGB'))
        clips.append(ImageClip(_frame, duration=_od))
        print(f"  🪧 Sluttplakat lagt inn i tidslinjen ({_od:.1f}s) — musikken gaar uavbrutt", flush=True)

    # Merkekort ETTER artistens plakat (aldri i stedet for). Ligger ogsaa i
    # tidslinjen, saa musikken gaar uavbrutt helt ut.
    if brandCard and os.path.exists(backgroundMusicPath):
        _bd = float(brandCard.get('durationSeconds') or 2)
        _bframe = np.array(_draw_brand_card(brandCard, W, H).convert('RGB'))
        clips.append(ImageClip(_bframe, duration=_bd))
        print(f"  🏷️  Merkekort lagt inn ({_bd:.1f}s): {brandCard.get('text')}", flush=True)

    total = sum(c.duration for c in clips)
    print(f"⏱️  Total: {total:.1f}s — legger til musikk...")

    if os.path.exists(backgroundMusicPath):
        # Mix-nivaaer kan overstyres fra config (mix: {duckVol, fullVol}) —
        # finjustering uten deploy (Lars 30/7: stemme/musikk-balansen)
        _mix = mix or {}
        # Plakat uten jingle spiller musikken videre — da skal hovedfilmen
        # IKKE tone ut foerst (ellers: ned, opp, ned igjen)
        # Plakaten ligger naa I tidslinjen naar den ikke har jingle, saa den
        # normale uttoningen treffer plakatens slutt — akkurat som oensket.
        music = _duck_music(backgroundMusicPath, clips,
                            duck_vol=float(_mix.get('duckVol') or 0.08),
                            full_vol=float(_mix.get('fullVol') or 0.38))
        final = concatenate_videoclips(clips, method="compose")
        final_audio = CompositeAudioClip([final.audio, music])
        final = final.with_audio(final_audio)
    else:
        final = concatenate_videoclips(clips, method="compose")

    print("🎥 Encoder...", flush=True)
    tmp_path = None
    main_render_path = output_path
    work_dir = os.path.dirname(output_path)
    # If outro card requested, render main video to a temp path first
    if outroCard and not outro_in_timeline:
        main_render_path = os.path.join(work_dir, 'main_no_outro.mp4')
    try:
        with tempfile.NamedTemporaryFile(suffix=".mkv", delete=False) as tmp:
            tmp_path = tmp.name
        print(f"  Skriv temp video med moviepy (matroska) → {tmp_path}", flush=True)
        final.write_videofile(tmp_path, fps=24, codec="libx264", audio_codec="aac", logger=None, preset="ultrafast")
        print(f"  Enkoder med ffmpeg (libx264, h.264) → {main_render_path}", flush=True)
        encode_video(tmp_path, main_render_path)

        if outroCard and not outro_in_timeline:
            outro_path = os.path.join(work_dir, 'outro_clip.mp4')
            try:
                # Uten jingle skal musikken fortsette under plakaten — fra
                # der filmen slapp. Er sporet kortere enn filmen, har det
                # loopet: regn ut posisjonen i loopen (samme som _duck_music).
                _mus = backgroundMusicPath if (backgroundMusicPath and os.path.exists(backgroundMusicPath)) else None
                _start = 0.0
                if _mus:
                    try:
                        _src_dur = float(AudioFileClip(_mus).duration)
                        _start = (total % _src_dur) if _src_dur > 0 else 0.0
                    except Exception:
                        _start = 0.0
                render_outro_card(outroCard, outro_path, W, H,
                                  jingle_path=outroCard.get('jinglePath'),
                                  music_path=_mus, music_start=_start,
                                  music_vol=float((mix or {}).get('fullVol') or 0.38))
                concat_videos(main_render_path, outro_path, output_path)
            except Exception as outro_err:
                print(f"[build_video] Outro generation failed, using main video only: {outro_err}", file=sys.stderr)
                # Fallback: copy main as final
                if main_render_path != output_path:
                    subprocess.run(['cp', main_render_path, output_path], check=False)

        # Create .done marker file to signal completion to Node.js
        open(output_path + '.done', 'w').close()
        print(f"\n✅ Ferdig! → {output_path}", flush=True)
    except Exception as e:
        print(f"❌ ERROR encoding video: {e}", flush=True, file=sys.stderr)
        raise
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python make_tiktok_reforhandle.py <config.json>")
        print("\nconfig.json format:")
        print("""
{
  "segments": [
    {
      "bg": "/path/to/bg.png",
      "vo_path": "/path/to/voiceover.mp3",
      "lines": [
        {"text": "Main text", "size": 64, "bold": true, "color": "#ffffff"},
        {"text": "Subtitle", "size": 36, "bold": false, "color": "#cccccc"}
      ],
      "sub": "Bottom text"
    }
  ],
  "output": "/path/to/output.mp4"
}
        """)
        sys.exit(1)

    config_path = sys.argv[1]
    with open(config_path) as f:
        config = json.load(f)

    # Set dimensions based on format
    format_choice = config.get('format', '9:16')
    if format_choice == '1:1':
        W, H = 1080, 1080
    elif format_choice == '16:9':
        W, H = 1920, 1080
    else:  # Default to 9:16
        W, H = 1080, 1920

    # DALL-E image size
    image_size = DALL_E_SIZES.get(format_choice, '1024x1792')

    backgroundMusicPath = config.get('backgroundMusic', MUSIC)
    logoUrl = config.get('logoUrl')
    outroCard = config.get('outroCard')
    # Bildetilpasning (31/7): 'contain' = hele bildet, sort rundt
    if config.get('imageFit') in ('contain', 'cover'):
        _IMAGE_FIT = config['imageFit']
        print(f"[imageFit] {_IMAGE_FIT}")
    build_video(config["segments"], config["output"], backgroundMusicPath, logoUrl=logoUrl, outroCard=outroCard, mix=config.get("mix"), brandCard=config.get("brandCard"))

    # Signal completion to job-queue
    done_path = config["output"] + ".done"
    with open(done_path, 'w') as f:
        f.write('done')
    print(f"[renderer] Done marker written: {done_path}")
