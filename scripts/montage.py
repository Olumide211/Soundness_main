import sys
from PIL import Image
out = sys.argv[1]; files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
h = 960
ims = [im.resize((int(im.width * h / im.height), h)) for im in ims]
W = sum(im.width for im in ims)
m = Image.new('RGB', (W, h))
x = 0
for im in ims:
    m.paste(im, (x, 0)); x += im.width
m.save(out)
