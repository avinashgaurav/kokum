import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { color } from '../theme';

/**
 * The Kokum mark: "five of six". See DECISIONS.md D-006.
 *
 * Six segments around a ring, five filled and one pale. It draws the moment the product
 * exists for: you have almost everything, and here is the one thing you do not.
 *
 * Drawn with a dashed stroke rather than paths so the segment count is a parameter. That
 * matters because D-006 leaves an open question (Q-01): a six-segment ring is one step away
 * from a loading spinner, and three segments may read better and echo the tagline's three
 * beats. Change `segments` to test it; nothing else needs to move.
 */

const R = 26;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function Mark({
  size = 48,
  segments = 6,
  filled = 5,
  gapRatio = 0.26,
  on = color.petrol,
  off = color.petrolPale,
}: {
  size?: number;
  segments?: number;
  filled?: number;
  gapRatio?: number;
  on?: string;
  off?: string;
}) {
  const step = CIRCUMFERENCE / segments;
  const gap = step * gapRatio;
  const dash = step - gap;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G rotation={-90} origin="50, 50">
        <Circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke={on}
          strokeWidth={15}
          strokeDasharray={`${dash} ${gap}`}
        />
        {Array.from({ length: segments - filled }, (_, i) => (
          <Circle
            key={i}
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke={off}
            strokeWidth={15}
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
            strokeDashoffset={-step * (filled + i)}
          />
        ))}
      </G>
    </Svg>
  );
}

/**
 * The mark used as a live gauge: segments lit in proportion to how stocked you are.
 * This is why a segmented mark earns its keep over a static logo.
 */
export function StockMark({ ratio, size = 48 }: { ratio: number; size?: number }) {
  const filled = Math.max(0, Math.min(6, Math.round(ratio * 6)));
  return <Mark size={size} segments={6} filled={filled} />;
}
