// 主入口：初始化渲染、世界、玩家、交互，并驱动主循环
import * as THREE from 'three';
import { BLOCKS, HOTBAR, getAtlasTexture } from './textures.js';
import { World, WX, WY, WZ, CHUNK, loadSave, writeSave, clearSave } from './world.js';
import { buildChunkGeometry, chunkKey, chunkOf } from './mesher.js';
import { raycastVoxel } from './raycast.js';
import { Player } from './player.js';
import { getBreakDuration, targetKey } from './breaking.js';
import { initUI, requestLock, showOverlay, hideOverlay } from './ui.js';

const REACH = 6;                 // 交互距离
const REBUILD_PER_FRAME = 3;     // 每帧重建区块数（防止卡顿）
const BUILD_PER_FRAME = 3;       // 每帧新建区块数

const SELFTEST = new URLSearchParams(location.search).has('selftest');
const REPORT_MODE = new URLSearchParams(location.search).has('report');

// ========================= 自测模式（无 WebGL，供无头测试/排错） =========================
function runSelfTest() {
  const report = { steps: [], ok: true };
  const check = (name, cond, extra) => {
    report.steps.push({ name, pass: !!cond, extra });
    if (!cond) report.ok = false;
  };
  try {
    const seed = 12345;
    const w1 = new World(seed);
    const w2 = new World(seed);
    let count = 0;
    for (let i = 0; i < w1.blocks.length; i++) if (w1.blocks[i] !== 0) count++;
    check('世界生成非空', count > 5000, 'solid=' + count);

    let same = true, diff = false;
    for (let i = 0; i < w1.blocks.length; i++) {
      if (w1.blocks[i] !== w2.blocks[i]) { same = false; break; }
    }
    check('同种子世界一致', same);
    const w3 = new World(seed + 1);
    for (let i = 0; i < w1.blocks.length; i++) {
      if (w1.blocks[i] !== w3.blocks[i]) { diff = true; break; }
    }
    check('不同种子世界不同', diff);

    // set / changes / serialize roundtrip
    const sx = Math.floor(WX / 2), sz = Math.floor(WZ / 2);
    const top = w1.topY(sx, sz);
    const placeY = top + 2;
    w1.set(sx, placeY, sz, 7);
    check('set 生效', w1.get(sx, placeY, sz) === 7);
    check('changes 记录', w1.changes.size >= 1);
    const ser = w1.serialize();
    check('序列化含 seed/changes', typeof ser.seed === 'number' && Array.isArray(ser.changes));
    const w4 = World.restore(ser);
    check('restore 恢复修改', w4.get(sx, placeY, sz) === 7);
    check('restore 保留地形', w4.get(sx, top, sz) === w1.get(sx, top, sz));
    w1.set(sx, placeY, sz, 0);
    check('清除后无记录', w1.get(sx, placeY, sz) === 0 && !w1.changes.has(sx + ',' + placeY + ',' + sz));

    // chunk geometry
    const geo = buildChunkGeometry(w1, 0, 0);
    check('区块几何体生成', !!geo && geo.getAttribute('position').count > 0,
      geo ? 'verts=' + geo.getAttribute('position').count : 'null');
    if (geo) { geo.dispose(); }

    // raycast
    const w5 = new World(seed);
    const rx = Math.floor(WX / 2) + 0.5, rz = Math.floor(WZ / 2) + 0.5;
    const ry = w5.topY(Math.floor(rx), Math.floor(rz)) + 2.5;
    const hit = raycastVoxel((x, y, z) => w5.get(x, y, z), rx, ry, rz, 0, -1, 0, 8);
    check('射线向下命中方块', !!hit && hit.y < ry, hit ? 'hit=' + hit.x + ',' + hit.y + ',' + hit.z : 'null');
    check('命中给出放置位置', !!hit && hit.py === hit.y + 1);

    // player physics
    const p = new Player(w1);
    p.spawnAt(Math.floor(WX / 2), Math.floor(WZ / 2));
    const startY = p.pos.y;
    const input = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
    for (let i = 0; i < 90; i++) p.update(1 / 60, input);
    check('玩家落地', p.onGround && p.pos.y <= startY, 'y=' + p.pos.y.toFixed(2));
    check('落地不再穿透', p.onGround && Math.abs(p.vel.y) < 1e-6);
    input.jump = true;
    p.update(1 / 60, input);
    check('跳跃起跳', p.vel.y > 5, 'vy=' + p.vel.y.toFixed(2));
    input.jump = false;
    for (let i = 0; i < 30; i++) p.update(1 / 60, input);

    // wall collision（用人工平台，避免随机树木干扰）
    const wallX = 20, wallZ = 20, gY = 6;
    for (let x = 16; x <= 24; x++) {
      for (let z = 16; z <= 22; z++) {
        for (let y = gY; y <= 20; y++) w1.set(x, y, z, 0);
      }
    }
    for (let x = 16; x <= 24; x++) {
      for (let z = 16; z <= 22; z++) w1.set(x, gY, z, 3);
    }
    for (let by = gY + 1; by <= gY + 4; by++) w1.set(wallX, by, wallZ, 3);
    p.pos.set(wallX - 2, gY + 1, wallZ + 0.5);
    p.vel.set(5, 0, 0);
    for (let i = 0; i < 30; i++) p.update(1 / 60, input);
    check('墙壁阻挡移动', p.pos.x < wallX - 0.3, 'x=' + p.pos.x.toFixed(2) + ' wall=' + wallX);
    check('原木破坏时间为 360ms', getBreakDuration(4) === 360);
    check('树叶比原木更快破坏', getBreakDuration(5) < getBreakDuration(4));
    check('未知方块使用默认破坏时间', getBreakDuration(999) === 260);
    check('同一坐标生成稳定目标键', targetKey({ x: 1, y: 2, z: 3 }) === '1,2,3');
  } catch (e) {
    report.ok = false;
    report.error = String((e && e.stack) || e);
  }
  document.title = 'SELFTEST:' + JSON.stringify({ ok: report.ok, steps: report.steps });
  const pre = document.createElement('pre');
  pre.id = 'selftest-result';
  pre.textContent = JSON.stringify(report, null, 2);
  document.body.appendChild(pre);
  console.log('[selftest]', report.ok ? 'PASS' : 'FAIL', JSON.stringify(report));
  try {
    fetch('/report', { method: 'POST', body: JSON.stringify({ kind: 'selftest', report }) }).catch(() => {});
  } catch (e) { /* ignore */ }
}

// ========================= 主游戏 =========================

let renderer, scene, camera, material;
let world, player, ui;
let chunkMeshes = new Map();   // "cx,cz" -> THREE.Mesh
let buildQueue = [];           // 待生成区块
let dirtyQueue = [];           // 待重建区块
let dirtySet = new Set();
let highlightBox, sunSprite, sunLight, clouds = [], sunDir = new THREE.Vector3(0.62, 0.78, 0.3).normalize();
let selectedSlot = 0;
let sensitivity = 1.8;       // 视角灵敏度倍数（×0.001 = 弧度/像素）
let deathTimer = 0;          // 死亡重生倒计时
let saveTimer = 0, statsTimer = 0, saveFlashTimer = 0;
let placeTimer = 0;
const breaking = { active: false, key: '', startedAt: 0, duration: 0 };
let debugVisible = false;
let lastWTime = 0;
let clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0, fpsValue = 60;
let rafId = 0;

const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, sprint: false, sneak: false,
};

// 拖动视角模式状态（指针锁定不可用时的兜底）
let dragMode = false;
let mouseDragging = false;
let dragMoved = 0;
let leftMouseDown = false;

function boot() {
  ui = initUI();
  ui.setOnRegen(regenerate);
  ui.setOnEnterDragMode(() => {
    dragMode = true;
    ui.hideOverlay();
    ui.showHintsTemporarily(8000);
    ui.setSaveStatus('拖动视角模式：按住左键拖动看四周，按住左键破坏，右键放置');
  });
  ui.setOnSensChange((v) => {
    sensitivity = v;
    scheduleSave();
  });
  ui.setOnRespawn(respawnPlayer);
  ui.showLoading();

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas'; // requestLock 等需要精确定位主画布
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: REPORT_MODE });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  document.body.appendChild(canvas);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.rotation.order = 'YXZ';

  setupSky();
  setupLights();
  setupHighlight();

  // 世界：优先恢复存档
  const saveData = loadSave();
  if (saveData) {
    world = World.restore(saveData);
    if (typeof saveData.slot === 'number') selectedSlot = saveData.slot;
  } else {
    world = new World((Math.random() * 0x7fffffff) >>> 0);
  }
  wireWorldEvents();

  player = new Player(world);
  if (saveData && saveData.player) {
    const p = saveData.player;
    player.pos.set(THREE.MathUtils.clamp(p.x, 0.5, WX - 0.5), THREE.MathUtils.clamp(p.y, 0.5, WY - 2), THREE.MathUtils.clamp(p.z, 0.5, WZ - 0.5));
    player.yaw = p.yaw || 0;
    player.pitch = THREE.MathUtils.clamp(p.pitch || 0, -1.5, 1.5);
  } else {
    const s = findSpawnColumn();
    player.spawnAt(s.x, s.z);
  }
  // 恢复灵敏度 / 无敌 / 血量
  if (saveData && typeof saveData.sens === 'number') sensitivity = saveData.sens;
  if (saveData && typeof saveData.invincible === 'boolean') player.invincible = saveData.invincible;
  if (saveData && typeof saveData.hp === 'number') {
    player.hp = THREE.MathUtils.clamp(saveData.hp, 1, player.maxHp);
  }
  wirePlayerEvents();

  material = new THREE.MeshLambertMaterial({
    map: getAtlasTexture(),
    vertexColors: true,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });

  enqueueAllChunks();
  wireInput();
  ui.setSeedText(world.seed);
  ui.setSelected(selectedSlot);
  ui.setSaveStatus(saveData ? '已读取存档' : '新世界');
  ui.updateHearts(player.hp, player.maxHp);
  ui.setInvincible(player.invincible);
  ui.setSensitivity(sensitivity);

  window.addEventListener('resize', onResize);
  window.addEventListener('beforeunload', () => saveNow('unload'));
  document.addEventListener('pointerlockchange', onPointerLockChange);

  // 首次渲染一帧后隐藏加载遮罩
  setTimeout(() => { ui.hideLoading(); }, 120);
  ui.showOverlay();

  if (REPORT_MODE) {
    postReport({ kind: 'boot', ok: true, seed: world.seed, chunks: WX / CHUNK * (WZ / CHUNK), webgl: true });
    // 定时截取游戏画面并上报（供无头自动测试用）
    setTimeout(() => postSnapshot('early'), 2500);
    setTimeout(() => postSnapshot('mid'), 6000);
  }

  clock.start();
  rafId = requestAnimationFrame(loop);
}

function postReport(data) {
  try {
    fetch('/report', { method: 'POST', body: JSON.stringify(data) }).catch(() => {});
  } catch (e) { /* ignore */ }
}

// 在世界中心附近寻找最近的草地列作为出生点（避免落在树冠上）
function findSpawnColumn() {
  const cx = Math.floor(WX / 2), cz = Math.floor(WZ / 2);
  for (let r = 0; r < 32; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) continue;
        const t = world.topY(x, z);
        if (world.get(x, t, z) === 1) return { x: x + 0.5, z: z + 0.5 };
      }
    }
  }
  return { x: WX / 2, z: WZ / 2 };
}

function postSnapshot(label) {
  try {
    if (!renderer) return;
    const url = renderer.domElement.toDataURL('image/jpeg', 0.72);
    postReport({ kind: 'snapshot', label, image: url });
  } catch (e) {
    postReport({ kind: 'snapshot', label, error: String((e && e.message) || e) });
  }
}

function wireWorldEvents() {
  world.onChange = (x, y, z, id) => {
    const [cx, cz] = chunkOf(x, z);
    markDirty(cx, cz);
    if ((x & 15) === 0) markDirty(cx - 1, cz);
    if ((x & 15) === 15) markDirty(cx + 1, cz);
    if ((z & 15) === 0) markDirty(cx, cz - 1);
    if ((z & 15) === 15) markDirty(cx, cz + 1);
    scheduleSave();
  };
}

function wirePlayerEvents() {
  player.onHurt = (dmg) => {
    ui.updateHearts(player.hp, player.maxHp);
    if (dmg > 0) ui.flashDamage();
  };
  player.onDeath = () => {
    deathTimer = 3;
    stopRepeating();
    ui.showDeath('从高处坠落');
    ui.updateHearts(0, player.maxHp);
  };
}

// 玩家重生（死亡后回到世界出生点）
function respawnPlayer() {
  player.respawn();
  const s = findSpawnColumn();
  player.spawnAt(s.x, s.z);
  ui.hideDeath();
  ui.updateHearts(player.hp, player.maxHp);
  saveNow('respawn');
}

function markDirty(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= WX / CHUNK || cz >= WZ / CHUNK) return;
  const key = chunkKey(cx, cz);
  if (dirtySet.has(key)) return;
  dirtySet.add(key);
  dirtyQueue.push(key);
}

function enqueueAllChunks() {
  buildQueue = [];
  for (let cx = 0; cx < WX / CHUNK; cx++) {
    for (let cz = 0; cz < WZ / CHUNK; cz++) {
      buildQueue.push(chunkKey(cx, cz));
    }
  }
}

// 处理区块生成队列（分帧执行，避免生成世界时卡死）
function processBuildQueue() {
  let n = 0;
  while (buildQueue.length && n < BUILD_PER_FRAME) {
    const key = buildQueue.shift();
    const [cx, cz] = key.split(',').map(Number);
    const geo = buildChunkGeometry(world, cx, cz);
    if (geo) {
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      chunkMeshes.set(key, mesh);
    } else {
      chunkMeshes.set(key, null);
    }
    n++;
  }
}

// 处理区块重建队列
function processDirtyQueue() {
  let n = 0;
  while (dirtyQueue.length && n < REBUILD_PER_FRAME) {
    const key = dirtyQueue.shift();
    dirtySet.delete(key);
    const [cx, cz] = key.split(',').map(Number);
    const geo = buildChunkGeometry(world, cx, cz);
    const old = chunkMeshes.get(key);
    if (geo) {
      if (old) {
        old.geometry.dispose();
        old.geometry = geo;
      } else {
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        chunkMeshes.set(key, mesh);
      }
    } else {
      if (old) { scene.remove(old); old.geometry.dispose(); }
      chunkMeshes.set(key, null);
    }
    n++;
  }
}

function setupSky() {
  // 渐变天空
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#2f6fd8');
  g.addColorStop(0.45, '#7db4f0');
  g.addColorStop(0.75, '#b7d8f7');
  g.addColorStop(1.0, '#d3e7fb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 512);
  const skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xd3e7fb, 55, 118);
  renderer.setClearColor(0xd3e7fb);

  // 太阳
  const sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  const sctx = sc.getContext('2d');
  const rg = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,235,1)');
  rg.addColorStop(0.3, 'rgba(255,240,190,0.9)');
  rg.addColorStop(1, 'rgba(255,240,190,0)');
  sctx.fillStyle = rg;
  sctx.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sc);
  const sunMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false });
  sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(34, 34, 1);
  scene.add(sunSprite);

  // 云
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256; cloudCanvas.height = 64;
  const cctx = cloudCanvas.getContext('2d');
  cctx.fillStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i < 14; i++) {
    const x = (i * 37 + 13) % 256, y = 20 + ((i * 53) % 28);
    cctx.beginPath();
    cctx.ellipse(x, y, 16 + (i % 4) * 7, 7 + (i % 3) * 3, 0, 0, Math.PI * 2);
    cctx.fill();
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  for (let i = 0; i < 5; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(120, 26), cloudMat);
    plane.rotation.x = Math.PI / 2; // 法线朝下，从地面能看到云
    plane.position.set(-50 + i * 45 + (i % 2) * 12, 58, -35 + (i % 3) * 33);
    plane.renderOrder = 1;
    scene.add(plane);
    clouds.push({ mesh: plane, speed: 0.6 + i * 0.15 });
  }
}

function setupLights() {
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x7a8a5a, 0.75);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.55);
  sun.position.copy(sunDir).multiplyScalar(90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 280;
  const d = 52;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  sunLight = sun;
}

function setupHighlight() {
  const boxGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  highlightBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeo),
    new THREE.LineBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.95 })
  );
  highlightBox.visible = false;
  scene.add(highlightBox);
}

// ========================= 输入 =========================

function wireInput() {
  const keyMap = {
    KeyW: 'forward', ArrowUp: 'forward',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'jump',
    ShiftLeft: 'sneak', ShiftRight: 'sneak',
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3' && !e.repeat) {
      e.preventDefault();
      debugVisible = !debugVisible;
      ui.setDebugVisible(debugVisible);
      return;
    }
    if (e.code === 'KeyH' && !e.repeat) {
      e.preventDefault();
      ui.toggleHints();
      return;
    }
    // 死亡时按空格/回车立即重生
    if (player && player.dead && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR')) {
      e.preventDefault();
      respawnPlayer();
      return;
    }
    if (e.code === 'KeyR' && !e.repeat) { regenerate(); return; }
    if (keyMap[e.code]) {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      const was = input[keyMap[e.code]];
      input[keyMap[e.code]] = true;
      // 双击 W 冲刺
      if (e.code === 'KeyW' && was) {
        const now = performance.now();
        if (now - lastWTime < 320) input.sprint = true;
        lastWTime = now;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
    }
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= HOTBAR.length) {
        selectedSlot = n - 1;
        ui.setSelected(selectedSlot);
      }
    }
    // 灵敏度调整：- 降低 / = 提高（按住 Shift 更细粒度）
    if (e.code === 'Minus' || e.code === 'Equal') {
      const delta = e.shiftKey ? 0.05 : 0.2;
      sensitivity = THREE.MathUtils.clamp(
        sensitivity + (e.code === 'Equal' ? delta : -delta),
        0.4, 6
      );
      ui.setSensitivity(sensitivity);
      ui.setSaveStatus('视角灵敏度：' + sensitivity.toFixed(1));
      scheduleSave();
    }
    // I：无敌模式开关
    if (e.code === 'KeyI' && !e.repeat) {
      player.invincible = !player.invincible;
      ui.setInvincible(player.invincible);
      ui.setSaveStatus('无敌模式：' + (player.invincible ? '开（不掉血）' : '关'));
      scheduleSave();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code]) {
      input[keyMap[e.code]] = false;
      if (e.code === 'KeyW') input.sprint = false;
    }
  });
  window.addEventListener('blur', () => {
    for (const k in input) input[k] = false;
    stopRepeating();
    leftMouseDown = false;
    cancelBreaking();
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === renderer.domElement) {
      look(e.movementX, e.movementY);
    } else if (dragMode && mouseDragging) {
      dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      look(e.movementX, e.movementY);
    }
  });

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement === renderer.domElement) {
      e.preventDefault();
      if (e.button === 0) {
        leftMouseDown = true;
        startBreaking();
      } else if (e.button === 2) {
        placeBlock();
        stopRepeating();
        placeTimer = setInterval(placeBlock, 250);
      }
    } else if (dragMode) {
      e.preventDefault();
      if (e.button === 0) {
        // 左键：按住时尝试破坏，位移超过阈值则只视为转动视角
        mouseDragging = true;
        dragMoved = 0;
        leftMouseDown = true;
        startBreaking();
      } else if (e.button === 2) {
        placeBlock();
        stopRepeating();
        placeTimer = setInterval(placeBlock, 250);
      }
    }
  });
  window.addEventListener('mouseup', (e) => {
    stopRepeating();
    if (dragMode && e.button === 0 && mouseDragging) {
      mouseDragging = false;
      leftMouseDown = false;
      cancelBreaking();
    } else if (e.button === 0) {
      leftMouseDown = false;
      cancelBreaking();
    }
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockerror', () => {
    ui.showLockError('浏览器拒绝了鼠标锁定请求（可能是浏览器限制或未允许全屏）。请点击下方「拖动视角模式进入」。');
  });
}

function look(dx, dy) {
  const s = sensitivity * 0.001;
  player.yaw -= dx * s;
  player.pitch -= dy * s;
  const lim = Math.PI / 2 - 0.01;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -lim, lim);
}

function stopRepeating() {
  if (placeTimer) { clearInterval(placeTimer); placeTimer = 0; }
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) {
    hideOverlay();
    ui.hideError();
    ui.showHintsTemporarily(8000);
  } else {
    showOverlay();
    stopRepeating();
    leftMouseDown = false;
    cancelBreaking();
  }
}

// ========================= 方块交互 =========================

const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

function currentRay() {
  camera.getWorldPosition(_rayOrigin);
  camera.getWorldDirection(_rayDir);
  return raycastVoxel((x, y, z) => world.get(x, y, z), _rayOrigin.x, _rayOrigin.y, _rayOrigin.z, _rayDir.x, _rayDir.y, _rayDir.z, REACH);
}

function breakBlock(hit = currentRay()) {
  if (!hit) return;
  const id = world.get(hit.x, hit.y, hit.z);
  if (id === 10) return; // 基岩不可破坏
  world.set(hit.x, hit.y, hit.z, 0);
}

function startBreaking(now = performance.now()) {
  const hit = currentRay();
  const id = hit ? world.get(hit.x, hit.y, hit.z) : 0;
  if (!hit || id === 10 || !BLOCKS[id]) return;
  breaking.active = true;
  breaking.key = targetKey(hit);
  breaking.startedAt = now;
  breaking.duration = getBreakDuration(id);
  ui.setBreakProgress(0, true);
}

function cancelBreaking() {
  breaking.active = false;
  breaking.key = '';
  breaking.startedAt = 0;
  breaking.duration = 0;
  if (ui) ui.setBreakProgress(0, false);
}

function updateBreaking(now = performance.now()) {
  if (!breaking.active) {
    if (leftMouseDown && !(dragMode && dragMoved >= 10)) startBreaking(now);
    return;
  }
  if (dragMode && dragMoved >= 10) {
    cancelBreaking();
    return;
  }
  const hit = currentRay();
  const id = hit ? world.get(hit.x, hit.y, hit.z) : 0;
  if (!hit || id === 10 || targetKey(hit) !== breaking.key) {
    cancelBreaking();
    return;
  }
  const progress = (now - breaking.startedAt) / breaking.duration;
  ui.setBreakProgress(progress, true);
  if (progress >= 1) {
    breakBlock(hit);
    cancelBreaking();
    if (leftMouseDown) startBreaking(now);
  }
}

function placeBlock() {
  const hit = currentRay();
  if (!hit || (hit.nx === 0 && hit.ny === 0 && hit.nz === 0)) return;
  const tx = hit.px, ty = hit.py, tz = hit.pz;
  if (!world.inBounds(tx, ty, tz)) return;
  if (world.get(tx, ty, tz) !== 0) return;
  const blockId = HOTBAR[selectedSlot];
  if (!BLOCKS[blockId] || !BLOCKS[blockId].solid) return;
  if (player.intersectsBlock(tx, ty, tz)) return;
  world.set(tx, ty, tz, blockId);
}

// ========================= 存档 =========================

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow('change'), 700);
}

function saveNow(reason) {
  const data = world.serialize();
  data.player = {
    x: player.pos.x, y: player.pos.y, z: player.pos.z,
    yaw: player.yaw, pitch: player.pitch,
  };
  data.slot = selectedSlot;
  data.sens = sensitivity;
  data.invincible = player.invincible;
  data.hp = player.hp;
  if (writeSave(data)) {
    ui.setSaveStatus('已自动保存 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }));
  }
}

// ========================= 世界重建 =========================

function regenerate() {
  ui.showConfirm(
    '确定要重新生成一个全新世界吗？\n这会清除你对世界的所有手动修改，并重置出生点。\n（当前世界与修改已保存在存档中，但会被覆盖）',
    () => {
      const seed = (Math.random() * 0x7fffffff) >>> 0;
      clearSave();
      rebuildWorld(seed);
    }
  );
}

function rebuildWorld(seed) {
  // 释放旧区块
  for (const [key, mesh] of chunkMeshes) {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  }
  chunkMeshes.clear();
  dirtyQueue = [];
  dirtySet.clear();

  world = new World(seed);
  wireWorldEvents();
  player = new Player(world);
  player.invincible = false;
  wirePlayerEvents();
  const s = findSpawnColumn();
  player.spawnAt(s.x, s.z);
  ui.hideDeath();
  ui.setSeedText(world.seed);
  ui.setSelected(selectedSlot);
  ui.updateHearts(player.hp, player.maxHp);
  ui.setInvincible(false);
  enqueueAllChunks();
  saveNow('regen');
}

// ========================= 主循环 =========================

function loop() {
  rafId = requestAnimationFrame(loop);

  const dt = Math.min(clock.getDelta(), 0.05);

  // 死亡重生倒计时
  if (player.dead) {
    deathTimer -= dt;
    ui.setDeathCountdown(Math.max(0, deathTimer));
    if (deathTimer <= 0) respawnPlayer();
  }

  // 玩家与镜头
  player.update(dt, input);
  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // 冲刺时 FOV 轻微变化
  const targetFov = input.sprint && input.forward ? 79 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // 区块队列
  processBuildQueue();
  processDirtyQueue();

  // 太阳与阴影跟随玩家
  if (sunLight) {
    sunLight.position.set(player.pos.x + sunDir.x * 90, player.pos.y + sunDir.y * 90, player.pos.z + sunDir.z * 90);
    sunLight.target.position.copy(player.pos);
    sunLight.target.updateMatrixWorld();
  }
  if (sunSprite) {
    sunSprite.position.set(player.pos.x + sunDir.x * 420, player.pos.y + 60 + sunDir.y * 380, player.pos.z + sunDir.z * 420);
  }

  // 云漂移
  for (const c of clouds) {
    c.mesh.position.x += c.speed * dt;
    if (c.mesh.position.x > 135) c.mesh.position.x = -55;
  }

  // 准星高亮
  updateHighlight();
  updateBreaking(performance.now());

  // 统计
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsValue = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
  }
  statsTimer += dt;
  if (statsTimer >= 0.25) {
    statsTimer = 0;
    ui.setStats(
      'FPS ' + fpsValue +
      '\n坐标 ' + player.pos.x.toFixed(1) + ', ' + player.pos.y.toFixed(1) + ', ' + player.pos.z.toFixed(1) +
      '\n血量 ' + player.hp + '/' + player.maxHp + (player.invincible ? '（无敌）' : '') +
      '\n灵敏度 ' + sensitivity.toFixed(1) +
      '\n区块 ' + chunkMeshes.size + ' · 修改 ' + world.changes.size +
      '\n种子 ' + world.seed
    );
  }

  // 定期保存玩家位置
  saveFlashTimer += dt;
  if (saveFlashTimer >= 5) {
    saveFlashTimer = 0;
    saveNow('periodic');
    if (REPORT_MODE) {
      postReport({ kind: 'heartbeat', fps: fpsValue, changes: world.changes.size,
        pos: [player.pos.x, player.pos.y, player.pos.z].map((v) => +v.toFixed(1)),
        pageError: document.body.dataset.error || null });
    }
  }

  renderer.render(scene, camera);
}

function updateHighlight() {
  const hit = currentRay();
  if (hit) {
    highlightBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    highlightBox.visible = true;
  } else {
    highlightBox.visible = false;
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========================= 启动 =========================

if (SELFTEST) {
  runSelfTest();
} else {
  try {
    boot();
  } catch (e) {
    console.error(e);
    const el = document.getElementById('error');
    el.textContent = '启动失败：' + (e && e.message ? e.message : e);
    el.classList.remove('hidden');
    document.getElementById('loading').classList.add('hidden');
    if (REPORT_MODE) {
      try { fetch('/report', { method: 'POST', body: JSON.stringify({ kind: 'boot', ok: false, error: String((e && e.message) || e) }) }).catch(() => {}); } catch (e2) {}
    }
  }
}

// 供调试/测试访问
window.__mc3d = { get world() { return world; }, get player() { return player; } };
