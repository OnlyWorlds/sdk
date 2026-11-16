/**
 * The by-links-3d layout's start: each free element starts at its own place in a ball of its group's guessed size
 * round the group's point, with nothing a second runtime or language could round differently. No cosine, no sine,
 * no cube root from the runtime: the group's radius by a cube root worked out in a fixed count of Newton steps
 * (addition, multiplication, division and one square root to begin), and the place by drawing points in the cube
 * round the group's point from a generator seeded with the element's own number, taking the first that falls inside
 * the ball. The place is worked out from the element's own number (read from its id), so it does not move when
 * another element is removed. Module-internal.
 */

export interface SpreadFeed {
  rest: number;
  pos: ReadonlyArray<readonly number[]>;
  anchor: ReadonlyArray<readonly number[]>;
  fixed: ReadonlyArray<boolean> | null;
}

const key = (p: readonly number[]): string => p.join(',');

// the groups, read from the arrays: free elements held to one point are one group
export function groupsOf(feed: SpreadFeed): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  feed.anchor.forEach((p, i) => {
    if (feed.fixed && feed.fixed[i]) return;
    const k = key(p);
    if (!groups.has(k)) groups.set(k, []);
    (groups.get(k) as number[]).push(i);
  });
  return groups;
}

// The cube root of v by 40 Newton steps from sqrt(v) (or 1, when that is under 1); 0 for v not over 0.
export function cubeRoot(v: number): number {
  if (!(v > 0)) return 0;
  let x = Math.sqrt(v);              // above the root for v over 1, and Newton's steps come down onto it
  if (x < 1) x = 1;
  for (let k = 0; k < 40; k++) x = (2 * x + v / (x * x)) / 3;
  return x;
}

// `num` is required: one whole number from 0 to 2^32 - 1 per element, read from its id.
export function plainStart(feed: SpreadFeed, num: readonly number[]): number[][] {
  if (!num) throw new Error('plainStart: needs each element\'s own number');
  const REST = feed.rest;
  const groups = groupsOf(feed);
  return feed.pos.map((p, i) => {
    if (feed.fixed && feed.fixed[i]) return p as number[];
    const lobe = REST * 1.1 * cubeRoot((groups.get(key(feed.anchor[i])) as number[]).length);
    let g = num[i] >>> 0;
    const draw = (): number => (g = (g * 1664525 + 1013904223) % 4294967296) / 4294967296;
    draw(); draw();                  // the first draws of near seeds lie near each other: passed over
    let x = 0, y = 0, z = 0;
    for (let tries = 0; tries < 64; tries++) {
      const a = 2 * draw() - 1, b = 2 * draw() - 1, c = 2 * draw() - 1;
      if (a * a + b * b + c * c <= 1) { x = a; y = b; z = c; break; }
    }
    return [feed.anchor[i][0] + x * lobe, feed.anchor[i][1] + y * lobe, feed.anchor[i][2] + z * lobe];
  });
}
