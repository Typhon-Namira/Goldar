/** One contact surface for routing and occlusion. Body-local mm, +Z front. */
export type NeckSurface = {
  radius: number;
  depth: number;
  height: number;
  drop: number;
  clearance: number;
};
export function neckSurface(
  radius: number,
  height: number,
  drop = 50,
): NeckSurface {
  const r = Math.max(24, Math.min(140, radius));
  return {
    radius: r,
    depth: r * 0.78,
    height: Math.max(45, Math.min(110, height)),
    drop: Math.max(28, Math.min(85, drop)),
    clearance: 3,
  };
}
export function bodySection(surface: NeckSurface, y: number) {
  const base = surface.radius * 0.55;
  if (y >= -base) {
    const taper =
      y >= 0
        ? 1 - 0.1 * Math.min(1, y / surface.height)
        : 1 + 0.04 * Math.min(1, -y / base);
    return { radius: surface.radius * taper, depth: surface.depth * taper };
  }
  return {
    radius: Math.min(
      190,
      surface.radius * 1.04 + Math.min(-y - base, 130) * 1.05,
    ),
    depth: surface.depth * 1.04 + Math.min(-y - base, 90) * 0.32,
  };
}
export function bodyFront(surface: NeckSurface, x: number, y: number) {
  const section = bodySection(surface, y);
  return Math.abs(x) >= section.radius
    ? 0
    : section.depth * Math.sqrt(Math.max(0, 1 - (x / section.radius) ** 2));
}
export function chainPoint(
  surface: NeckSurface,
  t: number,
): [number, number, number] {
  const angle = t * Math.PI * 2,
    s = Math.sin(angle),
    c = Math.cos(angle);
  const y = s < 0 ? 9 * (-s) ** 1.2 : -surface.drop * s ** 1.8;
  const neck = bodySection(surface, Math.max(0, y));
  const x = (neck.radius + surface.clearance) * c;
  let z = (neck.depth + surface.clearance) * s;
  if (s > 0 && Math.abs(x) < bodySection(surface, y).radius)
    z = Math.max(z, bodyFront(surface, x, y) + surface.clearance);
  return [x, y, z];
}

export function bodyLevels(surface: NeckSurface) {
  const base = surface.radius * 0.55;
  return [
    -base - 150,
    -base - 120,
    -base - 90,
    -base - 70,
    -base - 50,
    -base - 30,
    -base - 15,
    -base,
    -base * 0.65,
    -base * 0.3,
    0,
    surface.height * 0.25,
    surface.height * 0.5,
    surface.height * 0.75,
    surface.height,
  ];
}
