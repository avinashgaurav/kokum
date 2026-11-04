# Renders the photo inputs for the new test set (datasets/new-cases.json).
# "hand" items: a handwriting-style font on lined paper, each line nudged and the page tilted.
# "bill" items: a narrow till-receipt layout, tilted, with light grey speckle.
# Still made on a computer: this is closer to a phone photo of a list than the first set's
# plain typed images, but it is not real handwriting. Fixed random seed, so reruns match.
import json, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
here = os.path.dirname(os.path.abspath(__file__))
ds = json.load(open(os.path.join(here, '..', 'datasets', 'new-cases.json')))
SUP = '/System/Library/Fonts/Supplemental/'
for it in ds['parse']['items']:
    if 'image' not in it: continue
    rnd = random.Random(it['id'])
    if it['style'] == 'hand':
        font = ImageFont.truetype(SUP + 'Bradley Hand Bold.ttf', 34)
        w, h = 620, 110 + 62 * len(it['lines'])
        img = Image.new('RGB', (w, h), (250, 248, 238))
        d = ImageDraw.Draw(img)
        for y in range(70, h, 62): d.line([(0, y + 6), (w, y + 6)], fill=(170, 195, 225), width=2)
        d.line([(70, 0), (70, h)], fill=(225, 150, 150), width=2)
        for i, t in enumerate(it['lines']):
            d.text((90 + rnd.randint(-8, 14), 22 + i * 62 + rnd.randint(-4, 4)), t, fill=(30, 40, 110), font=font)
        img = img.rotate(rnd.uniform(-4, 4), expand=True, fillcolor=(120, 110, 95), resample=Image.BICUBIC)
    else:
        font = ImageFont.truetype(SUP + 'Courier New.ttf', 22)
        w, h = 520, 70 + 38 * len(it['lines'])
        img = Image.new('RGB', (w, h), (245, 245, 240))
        d = ImageDraw.Draw(img)
        for i, t in enumerate(it['lines']): d.text((24, 30 + i * 38), t, fill=(45, 45, 45), font=font)
        for _ in range(2500):
            x, y = rnd.randrange(w), rnd.randrange(h); g = rnd.randint(150, 215); d.point((x, y), fill=(g, g, g))
        img = img.rotate(rnd.uniform(-3, 3), expand=True, fillcolor=(90, 90, 90), resample=Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(os.path.join(here, '..', 'datasets', it['image']))
    print('wrote', it['image'], img.size)
