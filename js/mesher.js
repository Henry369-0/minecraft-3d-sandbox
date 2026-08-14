// 区块网格化：把每个 16x16 整高列合并为单个 BufferGeometry，
// 仅生成暴露在外的面（相邻不透明方块之间的面被剔除），大幅减少顶点数。
import * as THREE from 'three';
import { BLOCKS, tileUV } from './textures.js';
import { WX, WY, WZ, CHUNK } from './world.js';

// 六个面的方向、明暗、顶点与 UV
// 说明：side: DoubleSide，故顶点绕序无关紧要；明暗用于模拟 Minecraft 的面部光照
const FACES = [
  { dir: [1, 0, 0], shade: 0.70, corners: [[1, 1, 0], [1, 1, 1], [1, 0, 1], [1, 0, 0]] }, // +x
  { dir: [-1, 0, 0], shade: 0.70, corners: [[0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1]] }, // -x
  { dir: [0, 1, 0], shade: 1.00, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] }, // +y 顶
  { dir: [0, -1, 0], shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] }, // -y 底
  { dir: [0, 0, 1], shade: 0.85, corners: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]] }, // +z
  { dir: [0, 0, -1], shade: 0.85, corners: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]] }, // -z
];

// 每个面 4 个顶点的 UV 角点（(0,1),(1,1),(1,0),(0,0) 顺序与 corners 对应）
const FACE_UV = [[0, 1], [1, 1], [1, 0], [0, 0]];

// 确定性哈希 → [0,1)，用于顶点颜色微变化，消除整齐划一的塑料感
function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

// 生成一个区块的几何体；若区块全空返回 null
export function buildChunkGeometry(world, cx, cz) {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  let vcount = 0;

  for (let x = x0; x < x0 + CHUNK; x++) {
    for (let y = 0; y < WY; y++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        const id = world.blocks[world.index(x, y, z)];
        if (id === 0) continue;
        const def = BLOCKS[id];
        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nid = world.get(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
          const ndef = BLOCKS[nid];
          // 两个不透明方块相邻 → 面隐藏；任一为透明（空气/树叶/玻璃）→ 画出来
          if (def.opaque && ndef.opaque) continue;

          const tile = f === 2 ? def.top : f === 3 ? def.bottom : def.side;
          const uv = tileUV(tile);
          const shade = face.shade * (0.88 + hash3(x, y, z) * 0.24);
          const cr = Math.min(1, shade), cg = Math.min(1, shade), cb = Math.min(1, shade);

          for (let v = 0; v < 4; v++) {
            const c = face.corners[v];
            positions.push(x + c[0], y + c[1], z + c[2]);
            normals.push(face.dir[0], face.dir[1], face.dir[2]);
            const fu = FACE_UV[v];
            uvs.push(uv.u0 + fu[0] * (uv.u1 - uv.u0), uv.v0 + fu[1] * (uv.v1 - uv.v0));
            colors.push(cr, cg, cb);
          }
          const base = vcount;
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          vcount += 4;
        }
      }
    }
  }

  if (vcount === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

// 区块坐标辅助
export function chunkOf(x, z) {
  return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];
}
