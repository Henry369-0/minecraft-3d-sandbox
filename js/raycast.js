// 体素射线投射（Amanatides & Woo DDA 算法）：
// 沿射线逐格前进，找到第一个非空气方块，同时返回命中面法线与上一个空格（放置位置）。

export function raycastVoxel(getBlock, ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ;

  let nx = 0, ny = 0, nz = 0;   // 命中面法线
  let px = x, py = y, pz = z;   // 上一个空格（放置方块的位置）

  // 先检查起点所在格
  if (getBlock(x, y, z) !== 0) {
    return { x, y, z, nx, ny, nz, px, py, pz };
  }

  for (let i = 0; i < 256; i++) {
    let t = tMaxX, axis = 0;
    if (tMaxY < t) { t = tMaxY; axis = 1; }
    if (tMaxZ < t) { t = tMaxZ; axis = 2; }
    if (t > maxDist) break;

    if (axis === 0) { x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
    else if (axis === 1) { y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
    else { z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }

    if (getBlock(x, y, z) !== 0) {
      return { x, y, z, nx, ny, nz, px, py, pz };
    }
    px = x; py = y; pz = z;
  }
  return null;
}
