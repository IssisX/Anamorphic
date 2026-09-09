/**
 * 3D Hyperspace Geodesic Pathway Mathematics
 * Defines the central spatial trajectory, Frenet-Serret framing,
 * and tangent vector fields for the relativistic 3D pathway.
 */

export interface PathwayFrame {
  center: [number, number, number];
  tangent: [number, number, number];
  normal: [number, number, number];
  binormal: [number, number, number];
}

export function getPathwayPoint(s: number): [number, number, number] {
  const rMajor = 2.2 + 0.65 * Math.cos(3.0 * s);
  const x = rMajor * Math.cos(2.0 * s);
  const y = 1.35 * Math.sin(3.0 * s);
  const z = rMajor * Math.sin(2.0 * s);
  return [x, y, z];
}

export function getPathwayTangent(s: number): [number, number, number] {
  const ds = 0.005;
  const p1 = getPathwayPoint(s - ds);
  const p2 = getPathwayPoint(s + ds);
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz) || 1.0;
  return [dx / len, dy / len, dz / len];
}

export function getPathwayFrame(s: number): PathwayFrame {
  const center = getPathwayPoint(s);
  const tangent = getPathwayTangent(s);

  // Up guide vector
  let gx = 0;
  let gy = 1;
  let gz = 0;
  if (Math.abs(tangent[1]) > 0.92) {
    gx = 0;
    gy = 0;
    gz = 1;
  }

  // normal = normalize(cross(tangent, guide))
  let nx = tangent[1] * gz - tangent[2] * gy;
  let ny = tangent[2] * gx - tangent[0] * gz;
  let nz = tangent[0] * gy - tangent[1] * gx;
  const nLen = Math.hypot(nx, ny, nz) || 1.0;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  // binormal = cross(tangent, normal)
  const bx = tangent[1] * nz - tangent[2] * ny;
  const by = tangent[2] * nx - tangent[0] * nz;
  const bz = tangent[0] * ny - tangent[1] * nx;

  return {
    center,
    tangent,
    normal: [nx, ny, nz],
    binormal: [bx, by, bz],
  };
}
