// 像素风材质：运行时用 Canvas 绘制 4x4 图集（每格 16x16），所有方块共享一张纹理
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const TILE = 16;
export const ATLAS_COLS = 4;

// 图集中的贴图索引（按行排列）
export const ATLAS = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3,
  LOG_SIDE: 4, LOG_TOP: 5, LEAVES: 6, SAND: 7,
  PLANKS: 8, GLASS: 9, COBBLE: 10, BEDROCK: 11,
};

// 方块定义：id -> { 名称, 上/下/侧面贴图, 是否不透明, 是否实体 }
export const BLOCKS = {
  0:  { name: '空气', opaque: false, solid: false },
  1:  { name: '草方块', top: ATLAS.GRASS_TOP, bottom: ATLAS.DIRT, side: ATLAS.GRASS_SIDE, opaque: true, solid: true },
  2:  { name: '泥土',   top: ATLAS.DIRT, bottom: ATLAS.DIRT, side: ATLAS.DIRT, opaque: true, solid: true },
  3:  { name: '石头',   top: ATLAS.STONE, bottom: ATLAS.STONE, side: ATLAS.STONE, opaque: true, solid: true },
  4:  { name: '原木',   top: ATLAS.LOG_TOP, bottom: ATLAS.LOG_TOP, side: ATLAS.LOG_SIDE, opaque: true, solid: true },
  5:  { name: '树叶',   top: ATLAS.LEAVES, bottom: ATLAS.LEAVES, side: ATLAS.LEAVES, opaque: false, solid: true },
  6:  { name: '沙子',   top: ATLAS.SAND, bottom: ATLAS.SAND, side: ATLAS.SAND, opaque: true, solid: true },
  7:  { name: '木板',   top: ATLAS.PLANKS, bottom: ATLAS.PLANKS, side: ATLAS.PLANKS, opaque: true, solid: true },
  8:  { name: '玻璃',   top: ATLAS.GLASS, bottom: ATLAS.GLASS, side: ATLAS.GLASS, opaque: false, solid: true },
  9:  { name: '圆石',   top: ATLAS.COBBLE, bottom: ATLAS.COBBLE, side: ATLAS.COBBLE, opaque: true, solid: true },
  10: { name: '基岩',   top: ATLAS.BEDROCK, bottom: ATLAS.BEDROCK, side: ATLAS.BEDROCK, opaque: true, solid: true },
};

// 快捷栏可选方块（草、泥土、石、原木、树叶、沙、木板、玻璃、圆石）
export const HOTBAR = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// ---------------- 绘制各贴图 ----------------

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// 在 16x16 ImageData 上叠加噪声纹理
function speckle(img, base, range, rng, alpha = 255) {
  for (let i = 0; i < img.data.length; i += 4) {
    const v = base + (rng() * 2 - 1) * range;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = alpha;
  }
}

function paintGrassTop(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      let cr, cg, cb;
      if (r < 0.5) { cr = 0x5d; cg = 0xa6; cb = 0x3e; }
      else if (r < 0.8) { cr = 0x86; cg = 0xcf; cb = 0x55; }
      else { cr = 0x4c; cg = 0x8f; cb = 0x36; }
      img.data[i] = cr + Math.floor((rng() * 2 - 1) * 8);
      img.data[i + 1] = cg + Math.floor((rng() * 2 - 1) * 8);
      img.data[i + 2] = cb;
      img.data[i + 3] = 255;
    }
  }
}

function paintGrassSide(img, rng) {
  speckle(img, 0x8a, 0x28, rng, 255); // 泥土底
  for (let x = 0; x < 16; x++) {
    const grassH = 3 + Math.floor(rng() * 2); // 参差的草皮边缘
    for (let y = 0; y <= grassH; y++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      img.data[i] = r < 0.6 ? 0x5d : 0x86;
      img.data[i + 1] = r < 0.6 ? 0xa6 : 0xcf;
      img.data[i + 2] = 0x3e + Math.floor(rng() * 0x1a);
      img.data[i + 3] = 255;
    }
  }
}

function paintDirt(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      if (r < 0.15) { img.data[i] = 0x6e; img.data[i + 1] = 0x49; img.data[i + 2] = 0x27; }
      else if (r < 0.3) { img.data[i] = 0x9d; img.data[i + 1] = 0x6b; img.data[i + 2] = 0x3e; }
      else { img.data[i] = 0x8a; img.data[i + 1] = 0x5a; img.data[i + 2] = 0x32; }
      img.data[i + 3] = 255;
    }
  }
}

function paintStone(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      if (r < 0.12) { img.data[i] = 0x66; img.data[i + 1] = 0x66; img.data[i + 2] = 0x66; }
      else if (r < 0.3) { img.data[i] = 0x92; img.data[i + 1] = 0x92; img.data[i + 2] = 0x92; }
      else { img.data[i] = 0x7e; img.data[i + 1] = 0x7e; img.data[i + 2] = 0x7e; }
      img.data[i + 3] = 255;
    }
  }
}

function paintLogSide(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const seam = (x + Math.floor(rng() * 2)) % 4 === 0;
      if (seam) { img.data[i] = 0x4e; img.data[i + 1] = 0x34; img.data[i + 2] = 0x1e; }
      else { img.data[i] = 0x6b; img.data[i + 1] = 0x4a; img.data[i + 2] = 0x2c; }
      img.data[i + 3] = 255;
    }
  }
}

function paintLogTop(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const dx = x - 7.5, dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.floor(dist);
      let v;
      if (ring % 2 === 0) v = 0x8a + Math.floor(rng() * 0x14);
      else v = 0x5e + Math.floor(rng() * 0x14);
      if (dist < 1.2) v = 0x4e;
      img.data[i] = v; img.data[i + 1] = v * 0.72; img.data[i + 2] = v * 0.45;
      img.data[i + 3] = 255;
    }
  }
}

function paintLeaves(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      if (r < 0.16) { img.data[i + 3] = 0; continue; } // 镂空
      if (r < 0.45) { img.data[i] = 0x2e; img.data[i + 1] = 0x7d; img.data[i + 2] = 0x32; }
      else if (r < 0.8) { img.data[i] = 0x3c; img.data[i + 1] = 0x94; img.data[i + 2] = 0x3f; }
      else { img.data[i] = 0x22; img.data[i + 1] = 0x62; img.data[i + 2] = 0x26; }
      img.data[i + 3] = 255;
    }
  }
}

function paintSand(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      if (r < 0.15) { img.data[i] = 0xcd; img.data[i + 1] = 0xc2; img.data[i + 2] = 0x95; }
      else if (r < 0.35) { img.data[i] = 0xe8; img.data[i + 1] = 0xdf; img.data[i + 2] = 0xb8; }
      else { img.data[i] = 0xdc; img.data[i + 1] = 0xd2; img.data[i + 2] = 0xa6; }
      img.data[i + 3] = 255;
    }
  }
}

function paintPlanks(img, rng) {
  for (let y = 0; y < 16; y++) {
    const board = Math.floor(y / 4);
    const seamLine = (y % 4) === 3;
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      // 木板错缝
      const offset = (board % 2 === 0) ? 0 : 6;
      const seamCol = ((x + offset) % 8) === 0;
      const r = rng();
      let cr, cg, cb;
      if (seamLine || seamCol) { cr = 0x5d; cg = 0x3f; cb = 0x22; }
      else if (r < 0.3) { cr = 0xb5; cg = 0x8a; cb = 0x50; }
      else { cr = 0xa4; cg = 0x7a; cb = 0x42; }
      img.data[i] = cr; img.data[i + 1] = cg; img.data[i + 2] = cb;
      img.data[i + 3] = 255;
    }
  }
}

function paintGlass(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const cross = (x === 7 || x === 8) || (y === 7 || y === 8);
      if (border || cross) {
        img.data[i] = 0xe4; img.data[i + 1] = 0xf4; img.data[i + 2] = 0xff;
        img.data[i + 3] = 235;
      } else if (rng() < 0.04) {
        img.data[i] = 0xff; img.data[i + 1] = 0xff; img.data[i + 2] = 0xff;
        img.data[i + 3] = 160; // 少量高光
      } else {
        img.data[i + 3] = 0;
      }
    }
  }
}

function paintCobble(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      if (r < 0.10) { img.data[i] = 0x52; img.data[i + 1] = 0x52; img.data[i + 2] = 0x52; }   // 灰缝
      else if (r < 0.35) { img.data[i] = 0x8e; img.data[i + 1] = 0x8e; img.data[i + 2] = 0x8e; }
      else { img.data[i] = 0x75; img.data[i + 1] = 0x75; img.data[i + 2] = 0x75; }
      img.data[i + 3] = 255;
    }
  }
}

function paintBedrock(img, rng) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const r = rng();
      if (r < 0.25) { img.data[i] = 0x4a; img.data[i + 1] = 0x4a; img.data[i + 2] = 0x4a; }
      else { img.data[i] = 0x33; img.data[i + 1] = 0x33; img.data[i + 2] = 0x33; }
      img.data[i + 3] = 255;
    }
  }
}

// ---------------- 图集（惰性构建：Node 无 DOM 环境也能 import 本模块） ----------------

let atlasCanvas = null;

export function getAtlasCanvas() {
  if (!atlasCanvas) {
    atlasCanvas = makeCanvas(TILE * ATLAS_COLS);
    buildAtlas(atlasCanvas);
  }
  return atlasCanvas;
}

function buildAtlas(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  const painters = [
    paintGrassTop, paintGrassSide, paintDirt, paintStone,
    paintLogSide, paintLogTop, paintLeaves, paintSand,
    paintPlanks, paintGlass, paintCobble, paintBedrock,
  ];
  painters.forEach((paint, tile) => {
    const rng = mulberry32(tile * 101 + 7);
    paint(img, rng);
    const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
    ctx.putImageData(img, col * TILE, row * TILE);
  });
}

// 每个贴图在 UV 空间的矩形 [u0,v0,u1,v1]（v 方向已按 flipY 处理）
export function tileUV(tile) {
  const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
  const u0 = col / ATLAS_COLS, u1 = (col + 1) / ATLAS_COLS;
  const v1 = 1 - row / ATLAS_COLS, v0 = 1 - (row + 1) / ATLAS_COLS;
  return { u0, v0, u1, v1 };
}

let atlasTexture = null;
export function getAtlasTexture() {
  if (atlasTexture) return atlasTexture;
  const canvas = getAtlasCanvas();
  atlasTexture = new THREE.CanvasTexture(canvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestMipmapNearestFilter;
  atlasTexture.generateMipmaps = true;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  return atlasTexture;
}
