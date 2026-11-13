"""Makes the secret level's road textures from a photo of churned, dirty snow.

    python tools/make_road_texture.py <photo.png>

Writes src/assets/textures/road-slush.png        the photo, edge rows cropped (the shader tiles it mirrored)
       src/assets/textures/road-slush-normal.png the same tile's relief, as a normal map (from its brightness)
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

src = Path(sys.argv[1])
im = Image.open(src).convert('RGB')
W0, H0 = im.size
im = im.crop((6, 14, W0 - 6, H0 - 14))           # (the photo's own edge rows have a serrated rim and a dark line: dropped)
t = np.asarray(im)                                # (used with mirrored tiling in the shader: no seams, and no blending that would flatten it)
out = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'textures'
out.mkdir(parents=True, exist_ok=True)
Image.fromarray(t).save(out / 'road-slush.png')
# relief from the brightness: soft
L = np.asarray(Image.fromarray(t).convert('L').filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
dx = (np.roll(L, -1, 1) - np.roll(L, 1, 1)) * 0.5
dy = (np.roll(L, -1, 0) - np.roll(L, 1, 0)) * 0.5
k = 6.0
nx, ny, nz = -dx * k, -dy * k, np.ones_like(L)
l = np.sqrt(nx * nx + ny * ny + nz * nz)
nm = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5
Image.fromarray((nm * 255).astype(np.uint8)).save(out / 'road-slush-normal.png')
print('wrote', out)
