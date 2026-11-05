// Inverse Airy 1830 transverse Mercator, then OSGB36 → WGS84 Helmert.
// Approximate datum transform: adequate for a 100 km weather sampling lattice,
// not an OSTN15 surveying conversion.
export function bngToWgs84(east: number, north: number): [number, number] {
  const a = 6377563.396,
    b = 6356256.909,
    f = 0.9996012717;
  const e2 = 1 - (b * b) / (a * a),
    n = (a - b) / (a + b),
    p0 = (49 * Math.PI) / 180;
  let p = p0,
    m = 0;
  for (let i = 0; i < 20; i++) {
    p += (north + 100000 - m) / (a * f);
    m =
      b *
      f *
      ((1 + n + 1.25 * n ** 2 + 1.25 * n ** 3) * (p - p0) -
        (3 * n + 3 * n ** 2 + 2.625 * n ** 3) * Math.sin(p - p0) * Math.cos(p + p0) +
        (1.875 * n ** 2 + 1.875 * n ** 3) * Math.sin(2 * (p - p0)) * Math.cos(2 * (p + p0)) -
        (35 / 24) * n ** 3 * Math.sin(3 * (p - p0)) * Math.cos(3 * (p + p0)));
    if (Math.abs(north + 100000 - m) < 0.00001) break;
  }
  const nu = (a * f) / Math.sqrt(1 - e2 * Math.sin(p) ** 2),
    rho = (a * f * (1 - e2)) / (1 - e2 * Math.sin(p) ** 2) ** 1.5;
  const eta = nu / rho - 1,
    t = Math.tan(p),
    sec = 1 / Math.cos(p),
    d = east - 400000;
  const lat =
    p -
    (t / (2 * rho * nu)) * d ** 2 +
    (t / (24 * rho * nu ** 3)) * (5 + 3 * t * t + eta - 9 * t * t * eta) * d ** 4 -
    (t / (720 * rho * nu ** 5)) * (61 + 90 * t * t + 45 * t ** 4) * d ** 6;
  const lon =
    (-2 * Math.PI) / 180 +
    (sec / nu) * d -
    (sec / (6 * nu ** 3)) * (nu / rho + 2 * t * t) * d ** 3 +
    (sec / (120 * nu ** 5)) * (5 + 28 * t * t + 24 * t ** 4) * d ** 5 -
    (sec / (5040 * nu ** 7)) * (61 + 662 * t * t + 1320 * t ** 4 + 720 * t ** 6) * d ** 7;
  const radius = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2),
    x = radius * Math.cos(lat) * Math.cos(lon),
    y = radius * Math.cos(lat) * Math.sin(lon),
    z = radius * (1 - e2) * Math.sin(lat);
  const arc = Math.PI / (180 * 3600),
    rx = 0.1502 * arc,
    ry = 0.247 * arc,
    rz = 0.8421 * arc,
    scale = 1 - 20.4894e-6;
  const xx = 446.448 + scale * x - rz * y + ry * z,
    yy = -125.157 + rz * x + scale * y - rx * z,
    zz = 542.06 - ry * x + rx * y + scale * z;
  const wgsE2 = 1 - (6356752.314245 / 6378137) ** 2,
    horizontal = Math.hypot(xx, yy);
  let phi = Math.atan2(zz, horizontal * (1 - wgsE2));
  for (let i = 0; i < 10; i++) {
    const r = 6378137 / Math.sqrt(1 - wgsE2 * Math.sin(phi) ** 2);
    phi = Math.atan2(zz + wgsE2 * r * Math.sin(phi), horizontal);
  }
  return [(phi * 180) / Math.PI, (Math.atan2(yy, xx) * 180) / Math.PI];
}
