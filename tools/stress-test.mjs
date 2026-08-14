// 压力测试：大量随机编辑 + 长时间物理模拟
import { World, WX, WY, WZ } from '../js/world.js';
import { Player } from '../js/player.js';
import { mulberry32 } from '../js/noise.js';

const rng = mulberry32(777);
const w = new World(12345);
const edits = 2000;
for (let i = 0; i < edits; i++) {
  const x = Math.floor(rng() * WX), y = 1 + Math.floor(rng() * (WY - 2)), z = Math.floor(rng() * WZ);
  const id = 1 + Math.floor(rng() * 9);
  w.set(x, y, z, id);
}
const ser = JSON.stringify(w.serialize());
console.log('edits=' + edits, 'changes=' + w.changes.size, 'serializedBytes=' + ser.length);
// 校验：changes 中每一项的当前值都确实与原始地形不同
let validChanges = true;
for (const [key, id] of w.changes) {
  const [x, y, z] = key.split(',').map(Number);
  const i = w.index(x, y, z);
  if (w.blocks[i] !== id || w.base[i] === id) { validChanges = false; break; }
}
console.log('changes-valid=' + validChanges);
if (!validChanges) process.exit(1);

const w2 = World.restore(w.serialize());
let consistent = true;
for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] !== w2.blocks[i]) { consistent = false; break; }
console.log('restore-consistent=' + consistent);
if (!consistent) process.exit(1);

// 长时间物理：乱跑乱跳，检查不穿透地面
const p = new Player(w);
p.spawnAt(Math.floor(WX / 2), Math.floor(WZ / 2));
const input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
let minY = Infinity, stuckInside = 0;
const dirs = ['forward', 'back', 'left', 'right'];
for (let frame = 0; frame < 60 * 30; frame++) { // 30 秒模拟
  if (frame % 40 === 0) {
    for (const k in input) input[k] = false;
    input[dirs[Math.floor(rng() * 4)]] = true;
    input.jump = rng() < 0.4;
  }
  p.update(1 / 60, input);
  minY = Math.min(minY, p.pos.y);
  const top = w.topY(Math.floor(p.pos.x), Math.floor(p.pos.z));
  if (p.pos.y < top + 0.98 || p.pos.y > top + 2.5) stuckInside++;
}
console.log('after 30s sim: minY=' + minY.toFixed(2), 'onGround=' + p.onGround, 'suspiciousFrames=' + stuckInside);
if (p.pos.y < 0.5) { console.log('FAIL: player fell through world'); process.exit(1); }
console.log('STRESS PASS');
process.exit(0);
