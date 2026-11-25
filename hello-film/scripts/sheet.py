# usage: python3 scripts/sheet.py out.png cols img...   (labels each tile with its filename)
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w = 480; tiles = [im.resize((w, int(im.height * w / im.width))) for im in ims]
h = max(t.height for t in tiles); rows = (len(tiles) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), (0, 0, 0)); d = ImageDraw.Draw(S)
for i, (t, f) in enumerate(zip(tiles, files)):
    x, y = (i % cols) * w, (i // cols) * h; S.paste(t, (x, y)); d.text((x + 6, y + 4), f.split('/')[-1], fill=(0, 255, 0))
S.save(out)
