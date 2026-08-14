// 界面：快捷栏（数字键切换）、准星、提示、统计、遮罩层、血条、死亡/确认弹窗、灵敏度
import { BLOCKS, HOTBAR, getAtlasCanvas, TILE, ATLAS_COLS } from './textures.js';

const $ = (id) => document.getElementById(id);

let selectedIndex = 0;
let onRegen = null;
let onEnterDragMode = null;
let onSensChange = null;
let confirmCallback = null;

function drawSlotIcon(canvas, blockId) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const def = BLOCKS[blockId];
  const tile = def.top;
  const col = tile % ATLAS_COLS, row = Math.floor(tile / ATLAS_COLS);
  const atlas = getAtlasCanvas();
  ctx.drawImage(atlas, col * TILE, row * TILE, TILE, TILE, 0, 0, canvas.width, canvas.height);
}

export function initUI() {
  const hotbar = $('hotbar');
  hotbar.innerHTML = '';
  HOTBAR.forEach((blockId, i) => {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (i === 0 ? ' selected' : '');
    slot.title = BLOCKS[blockId].name;

    const icon = document.createElement('canvas');
    icon.width = 40; icon.height = 40;
    drawSlotIcon(icon, blockId);
    slot.appendChild(icon);

    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = String(i + 1);
    slot.appendChild(key);

    slot.addEventListener('click', () => {
      if (document.pointerLockElement) return; // 游戏内用数字键切换
      setSelected(i);
    });
    hotbar.appendChild(slot);
  });

  $('btn-regen').addEventListener('click', () => { if (onRegen) onRegen(); });
  $('btn-regen-overlay').addEventListener('click', () => { if (onRegen) onRegen(); });
  $('btn-start').addEventListener('click', requestLock);
  $('btn-dragmode').addEventListener('click', () => { if (onEnterDragMode) onEnterDragMode(); });

  // 点击遮罩空白处也可锁定
  $('overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay') requestLock();
  });

  // 灵敏度滑块
  const slider = $('sens-slider');
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    $('sens-value').textContent = v.toFixed(1);
    if (onSensChange) onSensChange(v);
  });

  // 死亡界面
  $('btn-respawn').addEventListener('click', () => { if (onRespawn) onRespawn(); });

  // 自定义确认框
  $('btn-confirm-ok').addEventListener('click', () => {
    hideConfirm();
    if (confirmCallback) { const cb = confirmCallback; confirmCallback = null; cb(); }
  });
  $('btn-confirm-cancel').addEventListener('click', () => {
    hideConfirm();
    confirmCallback = null;
  });

  return {
    setSelected,
    getSelected: () => HOTBAR[selectedIndex],
    getSelectedIndex: () => selectedIndex,
    setOnRegen: (fn) => { onRegen = fn; },
    setOnEnterDragMode: (fn) => { onEnterDragMode = fn; },
    setOnRespawn: (fn) => { onRespawn = fn; },
    setOnSensChange: (fn) => { onSensChange = fn; },
    requestLock,
    showOverlay,
    hideOverlay,
    setSeedText,
    setStats,
    setSaveStatus,
    showError,
    hideError,
    showLockError,
    updateHearts,
    flashDamage,
    setInvincible,
    setSensitivity,
    showDeath,
    hideDeath,
    setDeathCountdown,
    showConfirm,
    hideConfirm,
    showLoading,
    hideLoading,
  };
}

let onRespawn = null;

export function requestLock() {
  // 必须锁定游戏主画布（#game-canvas），不能用 querySelector('canvas')——会命中快捷栏图标
  const canvas = document.getElementById('game-canvas') || document.querySelector('canvas');
  if (!canvas) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* 某些浏览器需要用户手势 */ }
}

export function showOverlay() {
  $('overlay').classList.remove('hidden');
  $('hud').classList.add('hidden');
}

export function hideOverlay() {
  $('overlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
}

export function setSeedText(seed) {
  $('seed-text').textContent = String(seed);
}

export function setStats(text) {
  const el = $('stats');
  if (el.textContent !== text) el.textContent = text;
}

export function setSaveStatus(text) {
  $('save-status').textContent = text;
}

export function showError(msg) {
  const el = $('error');
  el.textContent = String(msg);
  el.classList.remove('hidden');
}

export function hideError() {
  $('error').classList.add('hidden');
}

// 指针锁定失败提示（显示在遮罩层内）
export function showLockError(msg) {
  const el = $('lock-error');
  if (el) {
    el.textContent = msg || '无法锁定鼠标指针。可点击下方按钮以「拖动视角」模式进入。';
    el.classList.remove('hidden');
  }
}

// ---- 血条 ----
const HEART_COUNT = 10; // 20 点血 = 10 颗心

export function updateHearts(hp, maxHp) {
  const el = $('hearts');
  if (!el) return;
  const hearts = Math.max(0, Math.min(HEART_COUNT, Math.round((hp / maxHp) * HEART_COUNT * 2) / 2)); // 半颗心粒度
  let html = '';
  for (let i = 0; i < HEART_COUNT; i++) {
    const h = hearts - i;
    if (h >= 1) html += '<span class="heart on">♥</span>';
    else if (h >= 0.5) html += '<span class="heart half">♥</span>';
    else html += '<span class="heart">♥</span>';
  }
  el.innerHTML = html;
}

export function flashDamage() {
  const el = $('damage-flash');
  if (!el) return;
  el.classList.remove('flash');
  // 强制重启动画
  void el.offsetWidth;
  el.classList.add('flash');
}

// ---- 无敌模式 ----
export function setInvincible(on) {
  const el = $('invincible-badge');
  if (!el) return;
  el.classList.toggle('hidden', !on);
}

// ---- 灵敏度 ----
export function setSensitivity(mult) {
  const slider = $('sens-slider');
  if (!slider) return;
  const v = Math.round(mult * 10) / 10;
  slider.value = String(v);
  $('sens-value').textContent = v.toFixed(1);
}

// ---- 死亡界面 ----
export function showDeath(reason) {
  const el = $('death-overlay');
  if (!el) return;
  const r = $('death-reason');
  if (r && reason) r.textContent = reason;
  el.classList.remove('hidden');
}

export function hideDeath() {
  const el = $('death-overlay');
  if (el) el.classList.add('hidden');
}

export function setDeathCountdown(sec) {
  const el = $('death-count');
  if (el) el.textContent = Math.ceil(sec) + ' 秒后自动重生…';
}

// ---- 自定义确认框 ----
export function showConfirm(text, onOk) {
  const el = $('confirm-overlay');
  if (!el) return;
  confirmCallback = onOk;
  $('confirm-text').textContent = text;
  el.classList.remove('hidden');
}

export function hideConfirm() {
  const el = $('confirm-overlay');
  if (el) el.classList.add('hidden');
}

export function showLoading() { $('loading').classList.remove('hidden'); }
export function hideLoading() { $('loading').classList.add('hidden'); }

function setSelected(i) {
  selectedIndex = (i + HOTBAR.length) % HOTBAR.length;
  const slots = document.querySelectorAll('.hotbar-slot');
  slots.forEach((s, idx) => s.classList.toggle('selected', idx === selectedIndex));
  const name = BLOCKS[HOTBAR[selectedIndex]].name;
  const el = $('selected-name');
  el.textContent = '手持：' + name;
}
