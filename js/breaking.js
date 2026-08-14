// 方块破坏的节奏参数与纯辅助函数，方便游戏和无头自测共用。
export const BREAK_DURATION_MS = Object.freeze({
  1: 220,
  2: 200,
  3: 420,
  4: 360,
  5: 140,
  6: 180,
  7: 320,
  8: 140,
  9: 460,
});

export function getBreakDuration(blockId) {
  return BREAK_DURATION_MS[blockId] || 260;
}

export function targetKey(hit) {
  return hit ? `${hit.x},${hit.y},${hit.z}` : '';
}
