/**
 * Vertices of a regular polygon (or a star when `innerRatio` is given)
 * inscribed in a width x height box, as an SVG `points` string.
 */
export function polygonPoints(
  box: { width: number; height: number },
  count: number,
  innerRatio?: number,
): string {
  const cx = box.width / 2;
  const cy = box.height / 2;
  const vertices = innerRatio === undefined ? count : count * 2;
  return Array.from({ length: vertices }, (_, index) => {
    const isInner = innerRatio !== undefined && index % 2 === 1;
    const scale = isInner ? innerRatio : 1;
    const angle = (index / vertices) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * cx * scale;
    const y = cy + Math.sin(angle) * cy * scale;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}
