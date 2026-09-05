#!/usr/bin/env python3
"""«Festlig»-renderer for anledningsfilmer (Standard Ropert, 4/9 2026).

Oppskriften fra prototypen: klipp paa taktslagene i sangen, bland
tekstplakater (pop-inn), kundens bilder med langsom kamerabevegelse og
konfetti med gjennomsiktighet, i en palett per anledning. Alt er ffmpeg,
PIL og librosa — ingen moviepy.

Kjoeres av job-queue.js:  python3 festlig.py <config.json>
config: {
  "output": "/.../output.mp4",
  "backgroundMusic": "/.../laat.mp3" | null,
  "musicOffset": 0,
  "theme": "halloween",              # anledningsnoekkel (products.category)
  "cards": ["HALLOWEEN PARTY!", ...], # plakattekster i rekkefoelge
  "photos": ["/.../image_1.png", ...],# kundens bilder (eller AI-bilder)
  "clips": ["/.../clip_1.mp4", ...],  # valgfrie videoklipp (niva 249)
  "confettiOpacity": 0.8,
  "maxSeconds": 60                    # tak naar musikk mangler/er lang
}
"""
import os, sys, math, random, subprocess, json, shutil, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 24
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# ── Palett per anledning: (bakgrunn/aksentfarger) ─────────────────────────
# Noekler = verdiene i lib/verticals.ts (celebration.categoryOptions).
THEMES = {
    'default':       {'a': (212, 40, 63),  'b': (244, 197, 66), 'c': (255, 244, 230), 'd': (42, 21, 24),   'e': (41, 98, 155)},
    'bursdag':       {'a': (255, 92, 122), 'b': (255, 205, 66), 'c': (255, 248, 235), 'd': (46, 28, 60),   'e': (72, 170, 210)},
    'bryllup':       {'a': (200, 160, 110),'b': (255, 250, 240),'c': (240, 225, 210), 'd': (60, 50, 45),   'e': (150, 120, 80)},
    'utdrikningslag':{'a': (255, 60, 120), 'b': (255, 220, 60), 'c': (255, 245, 235), 'd': (30, 20, 50),   'e': (60, 200, 220)},
    'jubileum':      {'a': (196, 150, 60), 'b': (255, 240, 200),'c': (250, 245, 235), 'd': (40, 30, 30),   'e': (120, 90, 40)},
    'daap':          {'a': (140, 190, 230),'b': (255, 250, 240),'c': (235, 245, 255), 'd': (60, 80, 110),  'e': (245, 200, 210)},
    'konfirmasjon':  {'a': (60, 110, 200), 'b': (255, 250, 240),'c': (230, 240, 255), 'd': (30, 40, 80),   'e': (240, 180, 80)},
    'krepselag':     {'a': (212, 40, 63),  'b': (244, 197, 66), 'c': (255, 244, 230), 'd': (42, 21, 24),   'e': (41, 98, 155)},
    'oktoberfest':   {'a': (40, 90, 200),  'b': (255, 255, 255),'c': (255, 235, 180), 'd': (40, 30, 20),   'e': (220, 170, 60)},
    'halloween':     {'a': (255, 122, 24), 'b': (94, 44, 140),  'c': (255, 240, 210), 'd': (18, 10, 26),   'e': (120, 200, 80)},
    'julebord':      {'a': (180, 30, 45),  'b': (220, 180, 90), 'c': (255, 248, 240), 'd': (30, 45, 40),   'e': (40, 110, 70)},
    'jul':           {'a': (180, 30, 45),  'b': (40, 110, 70),  'c': (255, 250, 245), 'd': (25, 35, 45),   'e': (220, 180, 90)},
    'nyttaar':       {'a': (230, 190, 90), 'b': (255, 255, 255),'c': (240, 235, 220), 'd': (10, 10, 20),   'e': (90, 70, 160)},
    'valentine':     {'a': (220, 40, 80),  'b': (255, 180, 200),'c': (255, 245, 245), 'd': (60, 20, 40),   'e': (255, 120, 150)},
    'paaske':        {'a': (255, 210, 50), 'b': (150, 210, 110),'c': (255, 252, 235), 'd': (80, 60, 30),   'e': (190, 150, 230)},
    'syttendemai':   {'a': (186, 12, 47),  'b': (0, 32, 91),    'c': (255, 255, 255), 'd': (20, 25, 60),   'e': (240, 200, 90)},
    'firmafest':     {'a': (40, 60, 120),  'b': (240, 190, 70), 'c': (245, 245, 250), 'd': (25, 30, 50),   'e': (80, 180, 200)},
    'bedrift':       {'a': (40, 60, 120),  'b': (240, 190, 70), 'c': (245, 245, 250), 'd': (25, 30, 50),   'e': (80, 180, 200)},
}

# Plakatstiler i rotasjon: (bg, fg, aksent, opts)
CARD_STYLES = [
    ('d', 'a', 'b', dict(size=190, tilt=-6, stripes=True)),
    ('a', 'd', 'c', dict(size=140, dots=True)),
    ('b', 'c', 'a', dict(size=150, tilt=4, ring=True)),
    ('c', 'a', 'b', dict(size=150, dots=True)),
    ('d', 'b', 'a', dict(size=160, tilt=-3, ring=True)),
    ('a', 'c', 'd', dict(size=140, stripes=True)),
    ('e', 'c', 'b', dict(size=140, dots=True)),
    ('c', 'd', 'a', dict(size=160, tilt=5, ring=True)),
]

def run(args, timeout=600):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + args, check=True, timeout=timeout)

def probe_dur(p):
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True, timeout=30)
        return float(out.stdout.strip() or 0)
    except Exception:
        return 0.0

# ── Takt ─────────────────────────────────────────────────────────────────────
def beats_for(music, offset, total):
    """Taktslag (sekunder fra offset) — librosa hvis den finnes, ellers 110 BPM."""
    try:
        import librosa
        y, sr = librosa.load(music, sr=22050, mono=True, offset=offset, duration=total + 10)
        tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units='frames')
        times = [float(t) for t in librosa.frames_to_time(frames, sr=sr) if t <= total + 0.5]
        tempo = float(np.atleast_1d(tempo)[0])
        if len(times) >= 8:
            if times[0] > 0.05:
                times.insert(0, 0.0)
            return tempo, times
    except Exception as e:
        print(f'[festlig] taktanalyse hoppet over: {e}', flush=True)
    step = 60.0 / 110
    return 110.0, list(np.arange(0, total + step, step))

# ── Plakater ──────────────────────────────────────────────────────────────────
def wrap(draw, text, font, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textbbox((0, 0), t, font=font)[2] > maxw and cur:
            lines.append(cur); cur = w
        else:
            cur = t
    if cur: lines.append(cur)
    return lines

def _lum(c):
    def ch(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])

def _contrast(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def pick_fg(bg, fg, pal):
    """Lesbar tekstfarge (Lars 5/9: lilla paa moerk lilla var uleselig).
    Beholder oensket farge om kontrasten holder (>= 4.5), ellers den i
    paletten med best kontrast mot bakgrunnen — hvitt/svart som siste utvei."""
    if _contrast(bg, fg) >= 4.5:
        return fg
    cands = list(pal.values()) + [(255, 255, 255), (20, 16, 24)]
    return max(cands, key=lambda c: _contrast(bg, c))

def card(text, bg, fg, accent, path, size=170, tilt=0, stripes=False, dots=False, ring=False, pal=None):
    if pal:
        fg = pick_fg(bg, fg, pal)
    img = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(img)
    if stripes:
        for i in range(-H, W + H, 160):
            d.polygon([(i, 0), (i + 70, 0), (i + 70 - H, H), (i - H, H)], fill=accent)
    if dots:
        rnd = random.Random(len(text) * 7 + 3)
        for _ in range(28):
            r = rnd.randint(18, 60); x = rnd.randint(0, W); y = rnd.randint(0, H)
            d.ellipse((x - r, y - r, x + r, y + r), fill=accent)
    if ring:
        for r, wdt in ((700, 26), (560, 14)):
            d.ellipse((W // 2 - r, H // 2 - r, W // 2 + r, H // 2 + r), outline=accent, width=wdt)
    maxw = W - 160
    font = ImageFont.truetype(FONT, size)
    lines = wrap(d, text, font, maxw)
    def too_wide():
        return any(d.textbbox((0, 0), ln, font=font)[2] > maxw for ln in lines)
    while (len(lines) > 3 or too_wide()) and size > 60:
        size -= 10; font = ImageFont.truetype(FONT, size); lines = wrap(d, text, font, maxw)
    lh = int(size * 1.12)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    y = (H - lh * len(lines)) // 2
    for ln in lines:
        bw = ld.textbbox((0, 0), ln, font=font)[2]
        x = (W - bw) // 2
        ld.text((x + 10, y + 10), ln, font=font, fill=(0, 0, 0, 120))
        ld.text((x, y), ln, font=font, fill=fg + (255,))
        y += lh
    if tilt:
        layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(W // 2, H // 2))
    img.paste(layer, (0, 0), layer)
    img.save(path)

def card_clip(png, dur, out):
    n = max(2, int(round(dur * FPS)))
    z = "if(lt(on,7),1.28-0.04*on,1.0+0.003*(on-7))"
    vf = f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
    run(['-loop', '1', '-i', png, '-vf', vf, '-frames:v', str(n), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out])

def video_clip(src, start, dur, out, reverse=False):
    vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},format=yuv420p"
    if reverse:
        vf = "reverse," + vf
    run(['-ss', str(start), '-t', str(dur), '-i', src, '-an', '-vf', vf, '-t', str(dur), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out])

def photo_clip(png, dur, out, pattern=0):
    n = max(2, int(round(dur * FPS)))
    p = f"((on/{n})*(on/{n})*(3-2*(on/{n})))"
    if pattern % 4 == 0: z, x = f"1+0.14*{p}", "iw/2-(iw/zoom/2)"
    elif pattern % 4 == 1: z, x = "1.08", f"(iw-iw/zoom)*{p}"
    elif pattern % 4 == 2: z, x = f"1.14-0.14*{p}", "iw/2-(iw/zoom/2)"
    else: z, x = "1.08", f"(iw-iw/zoom)*(1-{p})"
    bw, bh = int(W * 1.15), int(H * 1.15)
    vf = f"scale={bw}:{bh}:force_original_aspect_ratio=increase,crop={bw}:{bh},zoompan=z='{z}':x='{x}':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={FPS},format=yuv420p"
    run(['-loop', '1', '-i', png, '-vf', vf, '-frames:v', str(n), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out])

# ── Konfetti (RGBA-rammer, gjennomsiktig bakgrunn) ─────────────────────────
def confetti(total, cols, out_dir, alpha=0.8):
    rnd = random.Random(7)
    n = int(total * FPS)
    parts = []
    for _ in range(170):
        parts.append({'x': rnd.uniform(0, W), 'y': rnd.uniform(-H, H), 'vy': rnd.uniform(140, 320),
                      'sw': rnd.uniform(0.5, 1.6), 'ph': rnd.uniform(0, 6.28), 'w': rnd.randint(14, 30),
                      'h': rnd.randint(22, 46), 'c': rnd.choice(cols), 'rot': rnd.uniform(0, 360), 'rv': rnd.uniform(-160, 160)})
    frames_dir = os.path.join(out_dir, 'konf'); os.makedirs(frames_dir, exist_ok=True)
    a8 = int(255 * alpha)
    for f in range(n):
        t = f / FPS
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        for p in parts:
            y = (p['y'] + p['vy'] * t) % (H + 80) - 40
            x = (p['x'] + 60 * math.sin(p['sw'] * t + p['ph'])) % (W + 40) - 20
            a = math.radians(p['rot'] + p['rv'] * t)
            ww = p['w'] * abs(math.cos(a * 0.7)) + 3; hh = p['h']
            ca, sa = math.cos(a), math.sin(a)
            pts = [(x + dx * ca - dy * sa, y + dx * sa + dy * ca) for dx, dy in ((-ww/2, -hh/2), (ww/2, -hh/2), (ww/2, hh/2), (-ww/2, hh/2))]
            d.polygon(pts, fill=p['c'] + (a8,))
        img.save(os.path.join(frames_dir, f'k{f:05d}.png'), compress_level=1)
    return os.path.join(frames_dir, 'k%05d.png')

# ── Hovedprogram ─────────────────────────────────────────────────────────────
def build(cfg):
    output = cfg['output']
    job_dir = os.path.dirname(output)
    work = os.path.join(job_dir, 'festlig'); os.makedirs(work, exist_ok=True)
    music = cfg.get('backgroundMusic') or None
    if music and not os.path.exists(music):
        print(f'[festlig] musikk finnes ikke: {music} — uten musikk', flush=True); music = None
    offset = float(cfg.get('musicOffset') or 0)
    pal = THEMES.get(str(cfg.get('theme') or ''), THEMES['default'])
    texts = [str(t).strip() for t in (cfg.get('cards') or []) if str(t).strip()]
    photos = [p for p in (cfg.get('photos') or []) if p and os.path.exists(p)]
    clips = [c for c in (cfg.get('clips') or []) if c and os.path.exists(c)]
    if not texts:
        texts = ['Velkommen!']
    print(f'[festlig] tema={cfg.get("theme")} plakater={len(texts)} bilder={len(photos)} klipp={len(clips)} musikk={bool(music)}', flush=True)

    # Lengde: musikkens (allerede klippet til 30/60 s av flyten), ellers etter innhold
    max_sec = float(cfg.get('maxSeconds') or 90)
    if music:
        total = min(max(8.0, probe_dur(music) - offset), max_sec)
        tempo, beats = beats_for(music, offset, total)
    else:
        total = min(max_sec, 3.0 * (len(texts) + max(len(photos), 2)))
        step = 60.0 / 110
        tempo, beats = 110.0, list(np.arange(0, total + step, step))
    print(f'[festlig] {tempo:.0f} BPM, {len(beats)} slag, {total:.1f} s', flush=True)

    # Plakater: stil i rotasjon, tekstene i rekkefoelge
    card_png = []
    for i, txt in enumerate(texts):
        bg, fg, acc, kw = CARD_STYLES[i % len(CARD_STYLES)]
        if i == 0: bg, fg, acc, kw = CARD_STYLES[0]
        p = os.path.join(work, f'kort{i}.png')
        card(txt, pal[bg], pal[fg], pal[acc], p, pal=pal, **kw); card_png.append(p)

    # Visuelle kilder i rotasjon: bilder (og klipp naar de finnes).
    visuals = []  # ('photo', path) | ('video', path)
    for p in photos: visuals.append(('photo', p))
    for c in clips: visuals.append(('video', c))
    if not visuals:
        # Ingen bilder i det hele tatt: bruk plakatene som bakgrunn ogsaa
        visuals = [('photo', p) for p in card_png]
    vi = 0
    def nxt_visual():
        nonlocal vi
        kind, src = visuals[vi % len(visuals)]
        runde = vi // len(visuals); vi += 1
        return kind, src, runde

    # Lesetid (Lars 4/9: «flere av tekstsegmentene sto altfor kort»): en plakat
    # maa staa lenge nok til aa leses — ~1,6 s + 0,06 s per tegn, minst 2 s —
    # og bytter fortsatt paa et taktslag (avrundet OPP til partall slag).
    diffs = np.diff(beats[:32]) if len(beats) > 2 else np.array([0.5])
    beat_len = float(np.median(diffs)) if len(diffs) else 0.5
    def card_beats(text, minimum=2):
        need = max(2.0, 1.4 + 0.05 * len(text))
        return max(minimum, int(math.ceil(need / max(beat_len, 0.2))))
    # PLAKATENE FOERST (4/9): alle svarene fra skjemaet skal med. Regn ut hvor
    # mange slag plakatene trenger, og fordel resten av filmen som bilder i
    # mellomrommene (2- og 4-slags biter). Er det for lite plass, krympes
    # plakatene jevnt mot minimum foer noe droppes.
    n_cards = len(texts)
    avail = len(beats) - 1
    cb = [card_beats(t, 4 if i in (0, n_cards - 1) else 2) for i, t in enumerate(texts)]
    while sum(cb) > avail and any(b > 2 for b in cb):
        cb = [max(2, b - 1) for b in cb]
    gaps = max(0, n_cards - 1)
    rest = max(0, avail - sum(cb))
    per_gap = (rest // gaps) if gaps else rest
    per_gap -= per_gap % 2          # hele 2-slags biter
    slack = rest - per_gap * gaps   # ekstra bilder paa slutten
    seq = []
    for i in range(n_cards):
        seq.append(('card', i, cb[i]))
        if i < n_cards - 1:
            g = per_gap
            # 4-2-... veksling i mellomrommet
            k = 0
            while g >= 2:
                take = 4 if (g >= 4 and k % 2 == 1) else 2
                seq.append(('visual', nxt_visual(), take)); g -= take; k += 1
    # ledige slag etter siste plakat: bilder til musikken er slutt
    g = slack - slack % 2
    while g >= 2:
        seq.append(('visual', nxt_visual(), 2)); g -= 2
    plan, t_idx = [], 0
    for typ, ref, nb in seq:
        if t_idx >= len(beats) - 1: break
        plan.append((typ, ref, nb)); t_idx += nb
    print(f'[festlig] plakater {cb} slag, {per_gap} slag bilder per mellomrom', flush=True)

    seg_files, t_idx, pattern = [], 0, 0
    for k, (typ, ref, nb) in enumerate(plan):
        if t_idx >= len(beats) - 1: break
        end_idx = min(t_idx + nb, len(beats) - 1)
        dur = beats[end_idx] - beats[t_idx]
        if beats[t_idx] >= total: break
        dur = min(dur, total - beats[t_idx])
        if dur < 0.3: break
        out = os.path.join(work, f'seg{k:02d}.mp4')
        if typ == 'card':
            card_clip(card_png[ref], dur, out)
        else:
            kind, src, runde = ref
            if kind == 'video':
                video_clip(src, (0.0, 1.6, 2.8)[runde % 3], dur, out, reverse=(runde % 2 == 1))
            else:
                photo_clip(src, dur, out, pattern); pattern += 1
        seg_files.append(out); t_idx = end_idx
    total_v = sum(probe_dur(f) for f in seg_files)
    print(f'[festlig] {len(seg_files)} scener, {total_v:.1f} s', flush=True)

    lst = os.path.join(work, 'list.txt')
    with open(lst, 'w') as f:
        for s in seg_files: f.write(f"file '{s}'\n")
    body = os.path.join(work, 'body.mp4')
    run(['-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', body])

    konf = confetti(total_v, [pal['a'], pal['b'], pal['c'], pal['e']], work, float(cfg.get('confettiOpacity') or 0.8))

    tmp_out = output + '.tmp.mp4'
    fade_st = max(0, total_v - 2.5)
    if music:
        run(['-i', body, '-framerate', str(FPS), '-i', konf, '-ss', str(offset), '-i', music, '-filter_complex',
             f"[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v];[2:a]atrim=0:{total_v:.3f},afade=t=out:st={fade_st:.2f}:d=2.5,volume=0.95[a]",
             '-map', '[v]', '-map', '[a]', '-t', f'{total_v:.3f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', tmp_out])
    else:
        run(['-i', body, '-framerate', str(FPS), '-i', konf, '-filter_complex',
             "[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v]",
             '-map', '[v]', '-t', f'{total_v:.3f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', tmp_out])
    os.replace(tmp_out, output)
    shutil.rmtree(os.path.join(work, 'konf'), ignore_errors=True)
    # Samme ferdigmarkoer som hovedrenderen
    try:
        open(output + '.done', 'w').write('ok')
    except Exception:
        pass
    print(f'✅ Ferdig! → {output} ({probe_dur(output):.1f}s)', flush=True)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('bruk: festlig.py config.json'); sys.exit(1)
    with open(sys.argv[1]) as f:
        build(json.load(f))
