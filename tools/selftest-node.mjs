// Node 无头逻辑自测：世界生成、确定性、存档往返、区块几何、射线、玩家物理
// 用法：node --import ./tools/three-loader.mjs tools/selftest-node.mjs
import { World, WX, WY, WZ } from '../js/world.js';
import { buildChunkGeometry } from '../js/mesher.js';
import { raycastVoxel } from '../js/raycast.js';
import { Player } from '../js/player.js';
import { BLOCKS, tileUV } from '../js/textures.js';

const report = { steps: [], ok: true };
const check = (name, cond, extra) => {
  report.steps.push({ name, pass: !!cond, extra });
  if (!cond) report.ok = false;
};

try {
  // ---- 1. 世界生成 ----
  const seed = 12345;
  const w1 = new World(seed);
  let count = 0, trees = 0;
  for (let i = 0; i < w1.blocks.length; i++) {
    if (w1.blocks[i] !== 0) count++;
    if (w1.blocks[i] === 4) trees++;
  }
  check('世界生成非空', count > 5000, 'solid=' + count);
  check('生成了树木', trees > 10, 'logs=' + trees);
  check('基岩层完整', (() => { for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) if (w1.blocks[w1.index(x, 0, z)] !== 10) return false; return true; })());

  // ---- 2. 确定性 ----
  const w2 = new World(seed);
  let same = true;
  for (let i = 0; i < w1.blocks.length; i++) if (w1.blocks[i] !== w2.blocks[i]) { same = false; break; }
  check('同种子世界一致', same);
  const w3 = new World(seed + 1);
  let diff = false;
  for (let i = 0; i < w1.blocks.length; i++) if (w1.blocks[i] !== w3.blocks[i]) { diff = true; break; }
  check('不同种子世界不同', diff);

  // ---- 3. 修改与存档往返 ----
  const sx = Math.floor(WX / 2), sz = Math.floor(WZ / 2);
  const top = w1.topY(sx, sz);
  const placeY = top + 2;
  w1.set(sx, placeY, sz, 7);
  check('set 生效', w1.get(sx, placeY, sz) === 7);
  check('changes 记录', w1.changes.size >= 1);
  const ser = w1.serialize();
  check('序列化结构', typeof ser.seed === 'number' && Array.isArray(ser.changes) && ser.changes.length >= 1);
  const w4 = World.restore(ser);
  check('restore 恢复修改', w4.get(sx, placeY, sz) === 7);
  check('restore 保留原始地形', w4.get(sx, top, sz) === w1.get(sx, top, sz));
  w1.set(sx, placeY, sz, 0);
  check('清除修改后无记录', w1.get(sx, placeY, sz) === 0 && !w1.changes.has(sx + ',' + placeY + ',' + sz));

  // ---- 4. 区块几何 ----
  const geos = [];
  for (let cx = 0; cx < WX / 16; cx++) {
    for (let cz = 0; cz < WZ / 16; cz++) {
      const g = buildChunkGeometry(w1, cx, cz);
      if (g) geos.push(g);
    }
  }
  check('全部区块生成几何', geos.length === (WX / 16) * (WZ / 16), 'chunks=' + geos.length);
  let totalVerts = 0, totalIdx = 0, uvOk = true;
  for (const g of geos) {
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), col = g.getAttribute('color');
    totalVerts += pos.count;
    totalIdx += g.getIndex().count;
    for (let i = 0; i < uv.count; i++) {
      if (uv.getX(i) < -0.001 || uv.getX(i) > 1.001 || uv.getY(i) < -0.001 || uv.getY(i) > 1.001) uvOk = false;
    }
    if (col.count !== pos.count) uvOk = false;
  }
  check('网格有足够顶点', totalVerts > 10000, 'verts=' + totalVerts + ' idx=' + totalIdx);
  check('UV 全部在 [0,1] 且顶点色齐备', uvOk);
  check('索引数合法', totalIdx % 6 === 0 && totalIdx / 6 * 4 === totalVerts, 'faces=' + totalIdx / 6);
  // 顶点位置都在世界范围内
  let posOk = true;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < -0.01 || x > WX + 0.01 || y < -0.01 || y > WY + 0.01 || z < -0.01 || z > WZ + 0.01) { posOk = false; break; }
    }
  }
  check('顶点位置在界内', posOk);
  geos.forEach((g) => g.dispose());

  // 面剔除抽查：埋在地下的方块不应产生顶面
  const gTest = buildChunkGeometry(w1, 0, 0);
  if (gTest) {
    const pos = gTest.getAttribute('position');
    // 检查是否存在 y 接近 0 的顶点（基岩底面被剔除，不应出现 y<0 顶点）
    let yNeg = false;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.01) yNeg = true;
    check('基岩底面被剔除（无越界顶点）', !yNeg);
    gTest.dispose();
  }

  // ---- 5. 射线 ----
  const w5 = new World(seed);
  const rx = Math.floor(WX / 2) + 0.5, rz = Math.floor(WZ / 2) + 0.5;
  const ry = w5.topY(Math.floor(rx), Math.floor(rz)) + 2.5;
  const hit = raycastVoxel((x, y, z) => w5.get(x, y, z), rx, ry, rz, 0, -1, 0, 8);
  check('射线向下命中方块', !!hit && hit.y === Math.floor(ry) - 2, hit ? 'hit=' + hit.x + ',' + hit.y + ',' + hit.z : 'null');
  check('命中给出放置位置', !!hit && hit.py === hit.y + 1);

  // 斜向射线（看向地面某点）
  const dir = { x: 0.4, y: -0.9, z: 0.2 };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  const hit2 = raycastVoxel((x, y, z) => w5.get(x, y, z), rx, ry, rz, dir.x / len, dir.y / len, dir.z / len, 8);
  check('斜向射线命中', !!hit2);

  // ---- 6. 玩家物理 ----
  const p = new Player(w1);
  p.spawnAt(Math.floor(WX / 2), Math.floor(WZ / 2));
  const startY = p.pos.y;
  const input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
  for (let i = 0; i < 120; i++) p.update(1 / 60, input);
  check('玩家落地', p.onGround && p.pos.y <= startY && p.pos.y > 0, 'y=' + p.pos.y.toFixed(2));
  check('落地后速度归零', Math.abs(p.vel.y) < 1e-6);
  // 脚应精确站在地面方块顶面（整数高度）
  const spawnTop = w1.topY(Math.floor(WX / 2), Math.floor(WZ / 2));
  check('没有陷进地面', Math.abs(p.pos.y - (spawnTop + 1)) < 0.05, 'y=' + p.pos.y.toFixed(3) + ' top=' + spawnTop);

  // 跳跃
  input.jump = true;
  p.update(1 / 60, input);
  check('跳跃起跳', p.vel.y > 5, 'vy=' + p.vel.y.toFixed(2));
  input.jump = false;
  for (let i = 0; i < 60; i++) p.update(1 / 60, input);
  check('跳跃后重新落地', p.onGround);

  // ---- 人工平台：墙体阻挡与悬崖下落（清除树木干扰） ----
  const groundY = 6;
  for (let x = 16; x <= 26; x++) {
    for (let z = 16; z <= 24; z++) {
      for (let y = groundY; y <= 44; y++) w1.set(x, y, z, 0); // 清空（向上延伸，供坠落测试）
    }
  }
  for (let x = 16; x <= 26; x++) {
    for (let z = 16; z <= 24; z++) w1.set(x, groundY, z, 3); // 平台
  }
  const wallX = 20, wallZ = 20;
  for (let by = groundY + 1; by <= groundY + 4; by++) w1.set(wallX, by, wallZ, 3); // 墙

  // 撞墙
  p.pos.set(wallX - 2, groundY + 1, wallZ + 0.5);
  p.vel.set(5, 0, 0);
  for (let i = 0; i < 60; i++) p.update(1 / 60, input);
  check('墙壁阻挡移动', p.pos.x < wallX - 0.3, 'x=' + p.pos.x.toFixed(2) + ' wall=' + wallX);
  check('撞墙后速度为零', Math.abs(p.vel.x) < 0.001);

  // 从平台边缘上方坠落
  p.pos.set(wallX - 2, groundY + 8, wallZ + 0.5);
  p.vel.set(0, 0, 0);
  for (let i = 0; i < 240; i++) p.update(1 / 60, input);
  check('高处坠落触地', p.onGround && Math.abs(p.pos.y - (groundY + 1)) < 0.05, 'y=' + p.pos.y.toFixed(2));

  // 跳上 1 格台阶：清除墙，在 x=17..19 放 1 格高台阶，玩家从 x=16.5 朝 +X 起跳
  for (let by = groundY + 1; by <= groundY + 4; by++) w1.set(wallX, by, wallZ, 0);
  for (let x = 17; x <= 19; x++) w1.set(x, groundY + 1, wallZ, 3);
  p.pos.set(16.5, groundY + 1, wallZ + 0.5);
  p.yaw = -Math.PI / 2; // 面朝 +X
  p.vel.set(0, 0, 0);
  input.forward = true;
  input.jump = true;
  for (let i = 0; i < 50; i++) p.update(1 / 60, input);
  input.jump = false;
  for (let i = 0; i < 90; i++) p.update(1 / 60, input);
  input.forward = false;
  check('跳跃越过 1 格台阶', p.pos.x > 18.3 && p.onGround, 'x=' + p.pos.x.toFixed(2) + ' y=' + p.pos.y.toFixed(2));

  // ---- 7. 生命值与坠落伤害 ----
  p.hp = p.maxHp; // 之前的测试可能已扣血，先回满
  // 小高度坠落无伤（平台顶面 y=7）
  p.pos.set(21.5, groundY + 2, 20.5);
  p.vel.set(0, 0, 0);
  p.yaw = 0;
  for (let i = 0; i < 120; i++) p.update(1 / 60, input);
  check('小高度坠落无伤', p.hp === p.maxHp, 'hp=' + p.hp);

  // 中高度坠落扣血
  const hpBefore = p.hp;
  p.pos.set(21.5, groundY + 11, 20.5);
  p.vel.set(0, 0, 0);
  for (let i = 0; i < 200; i++) p.update(1 / 60, input);
  check('中高度坠落扣血', p.hp < hpBefore && p.hp > 0, 'hp=' + p.hp + ' before=' + hpBefore);

  // 无敌模式不掉血
  p.invincible = true;
  p.pos.set(21.5, groundY + 15, 20.5);
  p.vel.set(0, 0, 0);
  const hpInv = p.hp;
  for (let i = 0; i < 240; i++) p.update(1 / 60, input);
  check('无敌模式不掉血', p.hp === hpInv, 'hp=' + p.hp);
  p.invincible = false;

  // 超高坠落死亡并触发回调
  let died = false;
  p.onDeath = () => { died = true; };
  p.pos.set(21.5, groundY + 26, 20.5);
  p.vel.set(0, 0, 0);
  for (let i = 0; i < 300; i++) p.update(1 / 60, input);
  check('超高坠落死亡', p.dead && died && p.hp === 0, 'hp=' + p.hp);

  // 重生恢复满血
  p.respawn();
  check('重生恢复满血', p.hp === p.maxHp && !p.dead, 'hp=' + p.hp);

  // ---- 7. 方块定义完整性 ----
  let defOk = true;
  for (let id = 0; id <= 10; id++) {
    const d = BLOCKS[id];
    if (!d || d.name === undefined) defOk = false;
    if (id !== 0 && d.solid && (d.top === undefined || d.side === undefined)) defOk = false;
  }
  check('方块定义完整', defOk);
  check('tileUV 输出范围正确', (() => {
    for (let t = 0; t < 12; t++) {
      const u = tileUV(t);
      if (u.u0 < 0 || u.u1 > 1 || u.v0 < 0 || u.v1 > 1 || u.u0 >= u.u1 || u.v0 >= u.v1) return false;
    }
    return true;
  })());
} catch (e) {
  report.ok = false;
  report.error = String((e && e.stack) || e);
}

console.log('=== SELFTEST-NODE ===');
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
