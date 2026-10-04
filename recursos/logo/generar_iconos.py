"""Genera los iconos de Rated a partir de la marca 03 (R+).

La geometria es la del lienzo (MarcaR.dc.html): reticula de 100, R de trazo
unico (9) y el + a la altura del arco. Se dibuja con poligonos, no con una
fuente, para que salga igual en todos lados. Abajo de 24 px el trazo engorda
(11 / 9), como en el lienzo, para que no se pierda.

Dos estilos:
  - "tile": la R+ crema sobre el cuadro oscuro. Programa de Windows, favicon,
    PWA, Android (legado).
  - "solo": la R+ sola, sin fondo y mas grande. Ventana abierta y bandeja de
    Windows (decision de Angel: blanca, su barra es oscura).

Uso, desde la raiz del repo:  python recursos/logo/generar_iconos.py
Los iconos de Tauri salen de `npx tauri icon` con el 1024 que deja aqui; el
.ico se reescribe despues con un render por tamano (el de Tauri reduce el de
1024 y a 16 px el trazo queda de 1.4 px).
"""
import io
import math
import os
import struct
import sys

from PIL import Image, ImageDraw

RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
NEGRO = (0x14, 0x12, 0x10)
CREMA = (0xF3, 0xEF, 0xE7)
BLANCO = (0xFF, 0xFF, 0xFF)


def _glifo(draw, T, w, wp):
    """Dibuja la R+ en `draw` (modo L) con T: (x, y) de la reticula -> pixel."""
    def poly(pts):
        draw.polygon([T(x, y) for x, y in pts], fill=255)

    h = w / 2
    poly([(30 - h, 26), (30 + h, 26), (30 + h, 74), (30 - h, 74)])          # asta
    poly([(30, 30.5 - h), (46, 30.5 - h), (46, 30.5 + h), (30, 30.5 + h)])   # arriba
    poly([(30, 53.5 - h), (46, 53.5 - h), (46, 53.5 + h), (30, 53.5 + h)])   # abajo
    # Arco: media corona de radio 11.5 centrada en (46, 42).
    n = 64
    ext = [(46 + (11.5 + h) * math.cos(a), 42 + (11.5 + h) * math.sin(a))
           for a in (math.pi * (-0.5 + i / n) for i in range(n + 1))]
    inte = [(46 + (11.5 - h) * math.cos(a), 42 + (11.5 - h) * math.sin(a))
            for a in (math.pi * (0.5 - i / n) for i in range(n + 1))]
    poly(ext + inte)
    hp = wp / 2
    poly([(73 - hp, 24), (73 + hp, 24), (73 + hp, 38), (73 - hp, 38)])       # + vertical
    poly([(66, 31 - hp), (80, 31 - hp), (80, 31 + hp), (66, 31 + hp)])       # + horizontal


def _pierna(draw, T, w):
    dx, dy = 13, 22.5
    l = math.hypot(dx, dy)
    nx, ny = dy / l * w / 2, -dx / l * w / 2
    a, b = (44, 53.5), (57, 76)
    draw.polygon([T(a[0] + nx, a[1] + ny), T(b[0] + nx, b[1] + ny),
                  T(b[0] - nx, b[1] - ny), T(a[0] - nx, a[1] - ny)], fill=255)


def render(size, estilo='tile', tinta=None, grueso=None, forma='cuadro'):
    """PNG RGBA de `size` px. forma: 'cuadro' (rx 23) o 'circulo' (legado Android)."""
    ss = 16 if size <= 64 else 4
    S = size * ss
    grueso = size <= 24 if grueso is None else grueso
    w, wp = (11, 9) if grueso else (9, 6.5)

    if estilo == 'solo':
        # Igual que Icono03 del lienzo: escala 1.3 alrededor del centro.
        T = lambda x, y: (((x - 3 - 50) * 1.3 + 50) * S / 100, ((y - 50) * 1.3 + 50) * S / 100)
        tinta = tinta or BLANCO
    else:
        T = lambda x, y: ((x - 3) * S / 100, y * S / 100)
        tinta = tinta or CREMA

    mascara = Image.new('L', (S, S), 0)
    _glifo(ImageDraw.Draw(mascara), T, w, wp)
    pierna = Image.new('L', (S, S), 0)
    _pierna(ImageDraw.Draw(pierna), T, w)
    corte = int(round(T(0, 74)[1]))
    pierna.paste(0, (0, corte, S, S))       # la pierna se corta en la linea base
    mascara.paste(255, (0, 0), pierna)

    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if estilo == 'tile':
        fondo = Image.new('L', (S, S), 0)
        d = ImageDraw.Draw(fondo)
        if forma == 'circulo':
            d.ellipse([0, 0, S - 1, S - 1], fill=255)
        else:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=23 * S / 100, fill=255)
        img.paste(NEGRO + (255,), (0, 0), fondo)
        if forma == 'cuadro':
            # La orilla crema al 12 % del lienzo.
            orilla = Image.new('L', (S, S), 0)
            od = ImageDraw.Draw(orilla)
            od.rounded_rectangle([0, 0, S - 1, S - 1], radius=23 * S / 100, fill=31)
            m = max(1, S // 100)
            od.rounded_rectangle([m, m, S - 1 - m, S - 1 - m], radius=23 * S / 100 - m, fill=0)
            img.paste(CREMA + (255,), (0, 0), orilla)
    img.paste(tinta + (255,), (0, 0), mascara)
    return img.resize((size, size), Image.LANCZOS)


def ico(ruta, estilo, tamanos):
    """ICO con un PNG por tamano, cada uno dibujado a su tamano."""
    pngs = []
    for t in tamanos:
        b = io.BytesIO()
        render(t, estilo).save(b, 'PNG')
        pngs.append((t, b.getvalue()))
    cab = struct.pack('<HHH', 0, 1, len(pngs))
    off = 6 + 16 * len(pngs)
    dirs, datos = b'', b''
    for t, png in pngs:
        dirs += struct.pack('<BBBBHHII', t % 256, t % 256, 0, 0, 1, 32, len(png), off)
        off += len(png)
        datos += png
    with open(ruta, 'wb') as f:
        f.write(cab + dirs + datos)


def main():
    p = lambda *r: os.path.join(RAIZ, *r)
    os.makedirs(p('recursos', 'logo'), exist_ok=True)

    # Maestro para `npx tauri icon`.
    render(1024, 'tile').save(p('recursos', 'logo', 'rated-1024.png'))

    if '--solo-maestro' in sys.argv:
        return

    # Escritorio: el .ico por tamano, y los dos de la R+ sola.
    iconos = p('desktop', 'src-tauri', 'icons')
    ico(os.path.join(iconos, 'icon.ico'), 'tile', [16, 20, 24, 32, 40, 48, 64, 256])
    render(64, 'solo').save(os.path.join(iconos, 'ventana.png'))
    render(32, 'solo', grueso=True).save(os.path.join(iconos, 'bandeja.png'))

    # Web.
    render(192, 'tile').save(p('frontend', 'public', 'icon-192.png'))
    render(512, 'tile').save(p('frontend', 'public', 'icon-512.png'))
    render(180, 'tile').save(p('frontend', 'public', 'apple-touch-icon.png'))

    # Android, iconos de legado (antes de Android 8; el S24 usa el adaptativo).
    res = p('mobile', 'android', 'app', 'src', 'main', 'res')
    for carpeta, t in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        d = os.path.join(res, 'mipmap-' + carpeta)
        render(t, 'tile').save(os.path.join(d, 'ic_launcher.png'))
        render(t, 'tile', forma='circulo').save(os.path.join(d, 'ic_launcher_round.png'))
    print('listo')


if __name__ == '__main__':
    main()
