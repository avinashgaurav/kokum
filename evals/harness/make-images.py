# Renders the two synthetic (typed, fictional) photo inputs from datasets/parse.json.
import json, sys, os
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__))
ds = json.load(open(os.path.join(here, '..', 'datasets', 'parse.json')))
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Courier New.ttf', 26)
for it in ds['items']:
    if 'image' not in it: continue
    img = Image.new('RGB', (640, 80 + 50 * len(it['lines'])), 'white')
    d = ImageDraw.Draw(img)
    for i, t in enumerate(it['lines']): d.text((30, 30 + i * 50), t, fill='black', font=font)
    img.save(os.path.join(here, '..', 'datasets', it['image']))
