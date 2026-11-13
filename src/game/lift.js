// Stage 2's terraces are raised for looks only (see heightAt in world.js); gameplay stays 2D. A shot
// therefore keeps its own height above the ground, which decides when it lands exactly as on flat
// ground, and is drawn lifted by the ground height under it, followed smoothly so it glides up and
// over a terrace's edge instead of flying into it.

// Call once per frame after moving the shot. o: the shot's record (keeps the lift it's drawn with in
// o.g); p: its mesh position. Returns its height above the ground (<= 0: it has landed).
export function followGround(o, p, world, dt) {
  const h = world.shotHeightAt ? world.shotHeightAt(p.x, p.z) : world.heightAt ? world.heightAt(p.x, p.z) : 0; // (a chasm is not a drop for a shot)
  if (o.g === undefined) o.g = h;
  const g = o.g + (h - o.g) * Math.min(1, dt * 10);
  p.y += g - o.g; o.g = g;
  return p.y - g;
}
