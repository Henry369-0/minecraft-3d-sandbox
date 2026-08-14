// 第一人称玩家：WASD 移动、重力、跳跃、逐轴 AABB 与方块碰撞、生命值、坠落伤害。
// 尺寸参考《我的世界》：宽 0.6、高 1.8、眼高 1.62。
import * as THREE from 'three';
import { WX, WZ } from './world.js';

const EPS = 0.001;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;        // 绕 Y 轴（弧度）
    this.pitch = 0;      // 俯仰（弧度）
    this.onGround = false;

    this.half = 0.3;
    this.height = 1.8;
    this.eye = 1.62;

    this.speed = 4.3;    // 步行 m/s
    this.sprintSpeed = 6.0;
    this.sneakSpeed = 1.7;
    this.jumpSpeed = 8.6;
    this.gravity = 24;
    this.maxFall = -55;

    // ---- 生命与伤害 ----
    this.maxHp = 20;
    this.hp = 20;
    this.invincible = false; // 无敌模式：不掉血
    this.dead = false;
    this.fallDist = 0;       // 当前下落距离（用于坠落伤害）
    this.fallDamageThreshold = 3.2; // 超过该高度才受伤
    this.onHurt = null;      // 回调(damage)
    this.onDeath = null;     // 回调()
  }

  // 出生在指定列的最高点上方
  spawnAt(x, z) {
    const top = this.world.topY(Math.floor(x), Math.floor(z));
    this.pos.set(x + 0.5, top + 1.01, z + 0.5);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.fallDist = 0;
  }

  clampToWorld() {
    const m = this.half + 0.001;
    this.pos.x = Math.max(m, Math.min(WX - m, this.pos.x));
    this.pos.z = Math.max(m, Math.min(WZ - m, this.pos.z));
    if (this.pos.y < 0.5) this.pos.y = 0.5;
  }

  // ---- 生命相关 ----

  damage(n) {
    if (n <= 0 || this.invincible || this.dead) return;
    this.hp = Math.max(0, this.hp - n);
    if (this.onHurt) this.onHurt(n);
    if (this.hp === 0) {
      this.dead = true;
      this.vel.set(0, 0, 0);
      if (this.onDeath) this.onDeath();
    }
  }

  heal(n) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.onHurt) this.onHurt(0);
  }

  respawn() {
    this.hp = this.maxHp;
    this.dead = false;
    this.fallDist = 0;
    this.vel.set(0, 0, 0);
  }

  // 落地结算：根据下落距离计算坠落伤害
  settle() {
    const dmg = this.fallDist > this.fallDamageThreshold
      ? Math.round(this.fallDist - this.fallDamageThreshold)
      : 0;
    this.fallDist = 0;
    if (dmg > 0) this.damage(dmg);
  }

  update(dt, input) {
    if (this.dead) return; // 死亡时冻结

    const wasOnGround = this.onGround;
    this.onGround = false; // 每帧重新检测

    // ---- 水平方向 ----
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wishX = 0, wishZ = 0;
    if (input.forward) { wishX += -sin; wishZ += -cos; }
    if (input.back)    { wishX += sin;  wishZ += cos; }
    if (input.left)    { wishX += -cos; wishZ += sin; }
    if (input.right)   { wishX += cos;  wishZ += -sin; }
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) { wishX /= len; wishZ /= len; }

    const speed = input.sprint ? this.sprintSpeed
                : input.sneak ? this.sneakSpeed
                : this.speed;
    const accel = wasOnGround ? 14 : 3.5; // 空中操控性降低
    const k = Math.min(1, accel * dt);
    this.vel.x += (wishX * speed - this.vel.x) * k;
    this.vel.z += (wishZ * speed - this.vel.z) * k;

    // ---- 垂直方向 ----
    if (input.jump && wasOnGround) {
      this.vel.y = this.jumpSpeed;
    }
    this.vel.y -= this.gravity * dt;
    if (this.vel.y < this.maxFall) this.vel.y = this.maxFall;

    // ---- 逐轴移动与碰撞 ----
    this.pos.x += this.vel.x * dt;
    this.collide('x');
    this.pos.z += this.vel.z * dt;
    this.collide('z');
    this.pos.y += this.vel.y * dt;
    this.collide('y');

    // 下落距离累计（落地瞬间在 collide 中结算并清零）
    if (!this.onGround && this.vel.y < 0) {
      this.fallDist += -this.vel.y * dt;
    }

    this.clampToWorld();
  }

  // 玩家 AABB 与方块碰撞，按轴分离解决（迭代式，带保护次数防止无限循环）
  collide(axis) {
    for (let guard = 0; guard < 64; guard++) {
      const minX = this.pos.x - this.half, maxX = this.pos.x + this.half;
      const minY = this.pos.y,             maxY = this.pos.y + this.height;
      const minZ = this.pos.z - this.half, maxZ = this.pos.z + this.half;

      const x0 = Math.floor(minX), x1 = Math.floor(maxX - EPS);
      const y0 = Math.floor(minY), y1 = Math.floor(maxY - EPS);
      const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - EPS);

      let resolved = false;
      outer:
      for (let bx = x0; bx <= x1; bx++) {
        for (let by = y0; by <= y1; by++) {
          for (let bz = z0; bz <= z1; bz++) {
            if (!this.world.isSolid(bx, by, bz)) continue;
            if (axis === 'x') {
              if (this.vel.x > 0) {
                this.pos.x = bx - this.half - EPS;
                this.vel.x = 0;
                resolved = true;
              } else if (this.vel.x < 0) {
                this.pos.x = bx + 1 + this.half + EPS;
                this.vel.x = 0;
                resolved = true;
              }
            } else if (axis === 'z') {
              if (this.vel.z > 0) {
                this.pos.z = bz - this.half - EPS;
                this.vel.z = 0;
                resolved = true;
              } else if (this.vel.z < 0) {
                this.pos.z = bz + 1 + this.half + EPS;
                this.vel.z = 0;
                resolved = true;
              }
            } else {
              if (this.vel.y > 0) {
                // 头撞到上方的方块 → 向下压；否则是异常重叠（出生在方块内）→ 向上推出
                if (by >= Math.floor(this.pos.y)) {
                  this.pos.y = by - this.height - EPS;
                } else {
                  this.pos.y = by + 1;
                }
                this.vel.y = 0;
                resolved = true;
              } else if (this.vel.y < 0) {
                this.pos.y = by + 1;
                this.vel.y = 0;
                this.onGround = true;
                this.settle(); // 落地：结算坠落伤害
                resolved = true;
              } else {
                this.pos.y = by + 1; // 静止重叠：向上推出
                resolved = true;
              }
            }
            if (resolved) break outer; // 位置已改变，重新计算包围盒再检查
          }
        }
      }
      if (!resolved) break;
    }
  }

  // 判断一个单位方块 AABB 是否与玩家相交（用于放置方块时防止放进身体里）
  intersectsBlock(bx, by, bz) {
    const minX = this.pos.x - this.half, maxX = this.pos.x + this.half;
    const minY = this.pos.y,             maxY = this.pos.y + this.height;
    const minZ = this.pos.z - this.half, maxZ = this.pos.z + this.half;
    return !(bx + 1 <= minX + EPS || bx >= maxX - EPS ||
             by + 1 <= minY + EPS || by >= maxY - EPS ||
             bz + 1 <= minZ + EPS || bz >= maxZ - EPS);
  }
}
