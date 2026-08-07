/**
 * Generates every app-icon asset from one source of truth.
 *
 * The mark is "five of six": six segments around a ring, five petrol and one pale.
 * See DECISIONS.md D-006. Geometry here must stay in step with src/components/Mark.tsx;
 * both derive from the same segment maths, so change them together.
 *
 * Run: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'assets');

const CREAM = '#F4F8F7';
const PETROL = '#0E5A50';
const PALE = '#BEDBD4';

const R = 26;
const STROKE = 15;
const CIRC = 2 * Math.PI * R;

/**
 * @param {object} o
 * @param {number} [o.segments]
 * @param {number} [o.filled]
 * @param {string} [o.bg] background fill, or 'none' for transparency
 * @param {string} [o.on]
 * @param {string} [o.off]
 * @param {number} [o.scale] shrinks the mark inside the canvas, for adaptive-icon safe zones
 */
function markSvg({
  segments = 6,
  filled = 5,
  bg = CREAM,
  on = PETROL,
  off = PALE,
  scale = 1,
} = {}) {
  const step = CIRC / segments;
  const gap = step * 0.26;
  const dash = step - gap;

  const offRings = Array.from({ length: segments - filled }, (_, i) => {
    const offset = -step * (filled + i);
    return `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${off}" stroke-width="${STROKE}"
      stroke-dasharray="${dash} ${CIRC - dash}" stroke-dashoffset="${offset}"/>`;
  }).join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  ${bg === 'none' ? '' : `<rect width="100" height="100" fill="${bg}"/>`}
  <g transform="rotate(-90 50 50) translate(${50 * (1 - scale)} ${50 * (1 - scale)}) scale(${scale})">
      <circle cx="50" cy="50" r="${R}" fill="none" stroke="${on}" stroke-width="${STROKE}"
        stroke-dasharray="${dash} ${gap}"/>
      ${offRings}
  </g>
</svg>`;
}

/** @type {{name: string, size: number, svg: string}[]} */
const TARGETS = [
  // iOS store icon. No transparency, no rounding: the OS masks it.
  { name: 'icon.png', size: 1024, svg: markSvg() },
  // Android adaptive foreground. The outer 1/3 is cropped, so the mark sits at 60%.
  { name: 'icon-foreground.png', size: 1024, svg: markSvg({ bg: 'none', scale: 0.6 }) },
  { name: 'favicon.png', size: 48, svg: markSvg() },
  { name: 'splash.png', size: 512, svg: markSvg({ bg: 'none' }) },
  // Android notification icons must be a single-colour silhouette.
  { name: 'notification-icon.png', size: 96, svg: markSvg({ bg: 'none', on: '#FFFFFF', off: '#FFFFFF' }) },
];

await mkdir(OUT, { recursive: true });

for (const t of TARGETS) {
  const png = await sharp(Buffer.from(t.svg)).resize(t.size, t.size).png().toBuffer();
  await writeFile(join(OUT, t.name), png);
  console.log(`wrote ${t.name} (${t.size}px, ${(png.length / 1024).toFixed(1)} KB)`);
}

// Keep the vector alongside the rasters so the mark is never re-drawn from scratch.
await writeFile(join(OUT, 'mark.svg'), markSvg({ bg: 'none' }));
console.log('wrote mark.svg');
