// 方块世界：数据存储、确定性生成、修改记录（用于 localStorage 存档）
import { mulberry32, makeValueNoise2D, fbm2 } from './noise.js';
import { BLOCKS } from './textures.js';

export const WX = 96;   // 世界宽度（x）
export const WY = 64;   // 世界高度（y，垂直）
export const WZ = 96;   // 世界深度（z）
export const CHUNK = 16;

const index = (x, y, z) => (y * WZ + z) * WX + x;

const SAVE_KEY = 'mc3d_save_v1';

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.blocks = new Uint8Array(WX * WY * WZ); // 当前方块状态
    this.base = new Uint8Array(WX * WY * WZ);   // 种子生成的原始地形
    this.changes = new Map();                    // "x,y,z" -> id（与原始地形的差异）
    this.version = 0;                            // 每次修改 +1，用于触发自动保存
    this.onChange = null;                        // 回调 (x,y,z,id)
    this.generate();
  }

  index(x, y, z) { return index(x, y, z); }

  inBounds(x, y, z) {
    return x >= 0 && x < WX && y >= 0 && y < WY && z >= 0 && z < WZ;
  }

  // 越界处理：y<0 视为实体地面（防止玩家挖穿世界掉出虚空）；其余越界视为空气
  get(x, y, z) {
    if (y < 0) return 1;
    if (!this.inBounds(x, y, z)) return 0;
    return this.blocks[index(x, y, z)];
  }

  isSolid(x, y, z) {
    const id = this.get(x, y, z);
    const def = BLOCKS[id];
    return !!(def && def.solid);
  }

  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return false;
    const i = index(x, y, z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    const key = x + ',' + y + ',' + z;
    if (this.base[i] === id) this.changes.delete(key);
    else this.changes.set(key, id);
    this.version++;
    if (this.onChange) this.onChange(x, y, z, id);
    return true;
  }

  // 找到 (x,z) 列最高的实心方块 y
  topY(x, z) {
    for (let y = WY - 1; y >= 0; y--) {
      if (this.isSolid(x, y, z)) return y;
    }
    return 0;
  }

  // ---------------- 确定性世界生成 ----------------

  generate() {
    const n1 = makeValueNoise2D(this.seed);
    const n2 = makeValueNoise2D(this.seed ^ 0x9e3779b9);
    const n3 = makeValueNoise2D(this.seed ^ 0x85ebca6b);
    const rng = mulberry32(this.seed ^ 0x1234abcd);

    // 预计算高度图
    const heights = new Int16Array(WX * WZ);
    for (let x = 0; x < WX; x++) {
      for (let z = 0; z < WZ; z++) {
        let h = 17
          + fbm2(n1, x * 0.045, z * 0.045, 4) * 15
          + fbm2(n2, x * 0.13 + 100, z * 0.13 + 100, 3) * 5;
        h += Math.max(0, (fbm2(n3, x * 0.02, z * 0.02, 2) - 0.45)) * 18; // 偶尔的高原
        h = Math.max(3, Math.min(WY - 10, Math.floor(h)));
        heights[x * WZ + z] = h;
      }
    }

    // 填充方块
    for (let x = 0; x < WX; x++) {
      for (let z = 0; z < WZ; z++) {
        const h = heights[x * WZ + z];
        const beach = h <= 17; // 低洼处生成沙滩
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = 10;                 // 基岩
          else if (y === h) id = beach ? 6 : 1; // 沙 / 草
          else if (beach && y >= h - 2) id = 6; // 沙滩下的沙
          else if (y >= h - 3) id = 2;          // 泥土
          else id = 3;                          // 石头
          this.blocks[index(x, y, z)] = id;
          this.base[index(x, y, z)] = id;
        }
      }
    }

    // 种树（顺序固定，保证确定性）
    for (let x = 4; x < WX - 4; x++) {
      for (let z = 4; z < WZ - 4; z++) {
        const h = heights[x * WZ + z];
        if (h <= 17) continue; // 沙滩不种树
        if (this.blocks[index(x, h, z)] !== 1) continue; // 只在草地上
        if (rng() >= 0.02) continue;
        this.growTree(x, h, rng);
      }
    }
  }

  growTree(x, topY, rng) {
    const trunkH = 4 + Math.floor(rng() * 2);
    if (topY + trunkH + 2 >= WY) return;
    // 树干
    for (let y = topY + 1; y <= topY + trunkH; y++) {
      const i = index(x, y, x);
      this.blocks[i] = 4;
      this.base[i] = 4;
    }
    // 树叶：三层，下两层半径 2，顶层半径 1，四角随机挖掉
    for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
      const y = topY + dy;
      if (y < 1 || y >= WY - 1) continue;
      const r = dy >= trunkH ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.45) continue;
          const bx = x + dx, bz = x + dz;
          if (bx < 0 || bx >= WX || bz < 0 || bz >= WZ) continue;
          const i = index(bx, y, bz);
          if (this.blocks[i] !== 0) continue; // 不覆盖树干
          this.blocks[i] = 5;
          this.base[i] = 5;
        }
      }
    }
  }

  // ---------------- 存档 ----------------

  serialize() {
    const changes = [];
    for (const [key, id] of this.changes) {
      const [x, y, z] = key.split(',').map(Number);
      changes.push([x, y, z, id]);
    }
    return { v: 1, seed: this.seed, changes };
  }

  static restore(data) {
    const w = new World(data.seed >>> 0);
    if (data && Array.isArray(data.changes)) {
      for (const c of data.changes) {
        if (Array.isArray(c) && c.length === 4) w.set(c[0], c[1], c[2], c[3]);
      }
    }
    return w;
  }
}

// ---------------- localStorage 存取 ----------------

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.seed !== 'number') return null;
    return data;
  } catch (e) {
    console.warn('读取存档失败：', e);
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('写入存档失败：', e);
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
