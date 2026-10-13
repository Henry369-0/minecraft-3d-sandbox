import test from 'node:test';
import assert from 'node:assert/strict';
import { World, WX, WY, WZ, loadSave } from '../js/world.js';
import { buildChunkGeometry } from '../js/mesher.js';

test('seeded trees grow at distributed coordinates on their own ground', () => {
  for (const seed of [12345, 42, 777]) {
    const world = new World(seed);
    let offDiagonal = 0;
    let trees = 0;
    for (let x = 0; x < WX; x++) {
      for (let z = 0; z < WZ; z++) {
        for (let y = 1; y < WY; y++) {
          if (world.get(x, y, z) !== 4) continue;
          if (x !== z) offDiagonal++;
          if (world.get(x, y - 1, z) === 4) continue;
          trees++;
          assert.equal(world.get(x, y - 1, z), 1, `tree at ${x},${y},${z} must grow from grass (seed ${seed})`);
        }
      }
    }
    assert.ok(trees > 10, `seed ${seed} has a forest`);
    assert.ok(offDiagonal > 10, `seed ${seed} must not place every tree on x=z`);
    assert.deepEqual(new World(seed).blocks, world.blocks);
  }
});

test('set rejects malformed block ids and fractional or nonnumeric coordinates', () => {
  const world = new World(12345);
  const original = world.blocks.slice();
  const invalid = [[20,40,20,255], [20,40,20,-1], [20,40,20,'7'], [20,40,20,2.5],
    [20.5,40,20,7], ['20',40,20,7], [20,NaN,20,7], [20,40,WZ,7], [20,40,-1,7]];
  for (const edit of invalid) assert.equal(world.set(...edit), false, `invalid edit ${JSON.stringify(edit)}`);
  assert.deepEqual(world.blocks, original);
  assert.equal(world.changes.size, 0);
});

test('restore skips bad changes while preserving valid edits and renderable chunks', () => {
  const world = World.restore({v:1,seed:12345,changes:[[20,40,20,7],[21,40,21,255],[22.5,40,22,7],null,[20,40,20,'8']]});
  assert.equal(world.get(20,40,20), 7);
  assert.equal(world.changes.size, 1);
  const geometry = buildChunkGeometry(world, 1, 1);
  assert.ok(geometry);
  geometry.dispose();
  assert.deepEqual(World.restore(world.serialize()).blocks, world.blocks);
});

test('invalid save roots are rejected before world creation', () => {
  for (const invalid of [null,[],{seed:'123'},{seed:NaN},{seed:-1},{seed:3.5},{seed:1,v:2},{seed:1,changes:'bad'}]) {
    assert.throws(() => World.restore(invalid));
  }
});

test('loadSave ignores invalid metadata and retains the original stored data', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) };
  const raw = JSON.stringify({seed:'bad',changes:[]});
  values.set('mc3d_save_v1',raw);
  assert.equal(loadSave(),null);
  assert.equal(values.get('mc3d_save_v1'),raw);
  values.set('mc3d_save_v1',JSON.stringify({seed:12345,changes:[]}));
  assert.equal(loadSave().seed,12345);
});

test('bad optional player and hotbar metadata falls back without losing valid edits', () => {
  const raw = JSON.stringify({v:1,seed:12345,changes:[[20,40,20,7]],player:{},slot:0.5,sens:1e308,hp:null});
  globalThis.localStorage = { getItem: () => raw };
  const loaded = loadSave();
  assert.equal(loaded.seed,12345);
  assert.equal(loaded.player,undefined,'incomplete player data must use the normal spawn');
  assert.equal(loaded.slot,undefined,'fractional slot must use default hotbar selection');
  assert.equal(loaded.sens,undefined,'out-of-range sensitivity must use its default');
  assert.equal(loaded.hp,undefined,'invalid health must use full health');
  assert.equal(World.restore(loaded).get(20,40,20),7);
});

test('every player transform component must be finite and all slots must be integer indices', () => {
  const player = {x:48,y:32,z:48,yaw:0,pitch:0};
  for (const field of ['x','y','z','yaw','pitch']) {
    for (const bad of [null,'0',undefined]) {
      globalThis.localStorage = { getItem: () => JSON.stringify({seed:12345,changes:[],player:{...player,[field]:bad}}) };
      assert.equal(loadSave().player,undefined,`${field}=${bad} must not become a camera transform`);
    }
  }
  for (const slot of [-1,9,0.5,'0',null]) {
    globalThis.localStorage = { getItem: () => JSON.stringify({seed:12345,changes:[],slot}) };
    assert.equal(loadSave().slot,undefined);
  }
});

test('valid optional metadata and older saves without it remain compatible', () => {
  const data = {v:1,seed:12345,changes:[],player:{x:48,y:32,z:48,yaw:0,pitch:0},slot:8,sens:1.8,hp:12,invincible:false};
  globalThis.localStorage = { getItem: () => JSON.stringify(data) };
  assert.deepEqual(loadSave(),data);
  globalThis.localStorage = { getItem: () => JSON.stringify({seed:12345,changes:[]}) };
  assert.deepEqual(loadSave(),{seed:12345,changes:[]});
});
