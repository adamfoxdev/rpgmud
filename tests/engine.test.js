'use strict';
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
require('../js/data.js');
require('../js/engine.js');

const { DATA, Game, util } = globalThis.MUD;

function newGame(cls = 'warrior', race = 'human') {
  const g = new Game();
  const lines = [];
  g.on('output', (o) => lines.push(o.text));
  g.newPlayer({ name: 'Tester', race, cls, stats: Game.rollStats(race, cls) });
  g.lines = lines;
  g.text = () => lines.join('\n');
  g.clear = () => { lines.length = 0; };
  return g;
}

function teleport(g, id) {
  g.player.room = id;
  g.player.explored.add(id);
}

test('every exit leads to a real room, matches coordinates and has a reverse exit', () => {
  for (const [id, r] of Object.entries(DATA.rooms)) {
    for (const [d, ex] of Object.entries(r.exits)) {
      const to = typeof ex === 'string' ? ex : ex.to;
      const t = DATA.rooms[to];
      assert.ok(t, `${id} ${d} -> missing ${to}`);
      const D = util.DIRS[d];
      assert.deepStrictEqual([t.x - r.x, t.y - r.y, t.z - r.z], [D.dx, D.dy, D.dz], `${id} ${d} -> ${to} coordinate mismatch`);
      const back = t.exits[D.rev];
      assert.ok(back && (typeof back === 'string' ? back : back.to) === id, `${to} has no reverse exit to ${id}`);
    }
  }
});

test('no two rooms share a map cell', () => {
  const seen = {};
  for (const [id, r] of Object.entries(DATA.rooms)) {
    const k = `${r.x},${r.y},${r.z}`;
    assert.ok(!seen[k], `${id} overlaps ${seen[k]}`);
    seen[k] = id;
  }
});

test('all rooms are reachable from the temple', () => {
  const seen = new Set(['t_temple']), q = ['t_temple'];
  while (q.length) {
    for (const ex of Object.values(DATA.rooms[q.shift()].exits)) {
      const to = typeof ex === 'string' ? ex : ex.to;
      if (!seen.has(to)) { seen.add(to); q.push(to); }
    }
  }
  assert.deepStrictEqual(Object.keys(DATA.rooms).filter((r) => !seen.has(r)), []);
});

test('resets, loot, shops and class kits reference real things', () => {
  for (const r of DATA.resets) {
    assert.ok(DATA.rooms[r.room], `reset room ${r.room}`);
    if (r.mob) assert.ok(DATA.mobs[r.mob], `reset mob ${r.mob}`);
    if (r.item) assert.ok(DATA.items[r.item], `reset item ${r.item}`);
  }
  for (const [v, m] of Object.entries(DATA.mobs)) for (const [i] of m.loot || []) assert.ok(DATA.items[i], `${v} loot ${i}`);
  for (const [room, s] of Object.entries(DATA.shops)) {
    assert.ok(DATA.rooms[room]);
    assert.ok(DATA.mobs[s.keeper]);
    assert.ok(DATA.resets.some((r) => r.mob === s.keeper && r.room === room), `keeper for ${room} is reset there`);
    for (const i of s.sells) assert.ok(DATA.items[i], `${room} sells ${i}`);
  }
  for (const [c, C] of Object.entries(DATA.classes)) {
    for (const i of C.start) assert.ok(DATA.items[i], `${c} start ${i}`);
    for (const sk of Object.keys(C.skills)) assert.ok(DATA.spells[sk], `${c} skill ${sk}`);
  }
});

test('new characters start equipped in the temple with level-1 skills', () => {
  for (const cls of Object.keys(DATA.classes)) {
    const g = newGame(cls);
    const p = g.player;
    assert.strictEqual(p.room, 't_temple');
    assert.ok(p.equipment.wield, `${cls} wields a weapon`);
    assert.ok(p.hp > 0 && p.hp === g.maxHp());
    assert.ok(Object.keys(p.skills).length >= 1);
    assert.match(g.text(), /Temple of the Dawn/);
  }
});

test('movement, abbreviations, speedwalk and command chaining', () => {
  const g = newGame();
  g.command('s');
  assert.strictEqual(g.player.room, 't_square');
  g.command('2s');
  assert.strictEqual(g.player.room, 't_main_s');
  g.command('north;north');
  assert.strictEqual(g.player.room, 't_square');
  g.clear();
  g.command('w;w');
  assert.strictEqual(g.player.room, 't_weapons');
  g.command('e');
  g.clear();
  g.command('xyzzy');
  assert.match(g.text(), /Huh\?!/);
  g.clear();
  g.command('n');
  g.command('n');
  g.command('n');
  assert.match(g.text(), /Alas, you cannot go that way/);
});

test('shops: list, buy and sell', () => {
  const g = newGame();
  teleport(g, 't_alchemist');
  g.player.gold = 200;
  const gold = g.player.gold;
  g.command('list');
  assert.match(g.text(), /red potion/);
  g.command('buy red');
  assert.strictEqual(g.player.gold, gold - DATA.items.i_potion_red.cost);
  g.command('sell 1.red');
  assert.ok(g.player.gold > gold - DATA.items.i_potion_red.cost);
  g.clear();
  g.command('buy 1');
  assert.match(g.text(), /You buy a red potion/);
});

test('wear, remove and quaff', () => {
  const g = newGame('warrior');
  const p = g.player;
  const before = g.armor();
  g.command('remove all');
  assert.ok(g.armor() < before);
  assert.strictEqual(Object.keys(p.equipment).length, 0);
  g.command('wear all');
  assert.strictEqual(g.armor(), before);
  p.hp = 1;
  g.command('quaff potion');
  assert.ok(p.hp > 1);
});

test('combat to the death awards experience, gold and a corpse', () => {
  const g = newGame('warrior');
  teleport(g, 's_entry');
  const p = g.player;
  const rat = g.room().mobs.find((m) => m.vnum === 'm_rat');
  assert.ok(rat, 'a rat is in the sewer entry');
  rat.hp = 1;
  p.stats.dex = 18;
  let guard = 0;
  g.command('kill rat');
  while (g.room().mobs.includes(rat) && guard++ < 50) g.violencePulse();
  assert.ok(!g.room().mobs.includes(rat), 'rat died');
  assert.match(g.text(), /is DEAD!!/);
  assert.ok(p.xp > 0 || p.level > 1);
  assert.strictEqual(p.kills, 1);
  assert.ok(g.room().items.some((i) => i.vnum === 'corpse'));
  assert.notStrictEqual(p.position, 'fighting');
});

test('safe rooms and peaceful mobs cannot be attacked', () => {
  const g = newGame();
  g.clear();
  g.command('kill aldous');
  assert.match(g.text(), /protected by the Dawn/);
  assert.strictEqual(g.player.position, 'standing');
});

test('aggressive mobs attack and death returns you to the temple', () => {
  const g = newGame('mage');
  teleport(g, 'c_sanctum');
  g.room().mobs.forEach((m) => { m.aware = true; });
  g.aggroPulse();
  assert.strictEqual(g.player.position, 'fighting');
  let guard = 0;
  while (g.player.room !== 't_temple' && guard++ < 200) g.violencePulse();
  assert.strictEqual(g.player.room, 't_temple');
  assert.strictEqual(g.player.deaths, 1);
  assert.ok(g.player.hp > 0);
});

test('a mob with several attacks stops hitting once you die and respawn', () => {
  for (let n = 0; n < 40; n++) {
    const g = newGame('mage');
    teleport(g, 'c_sanctum');
    const lich = g.room().mobs.find((m) => m.vnum === 'm_lich');
    g.engage(lich);
    g.player.hp = 1;
    g.mobRound(lich);
    if (g.player.deaths) {
      assert.strictEqual(g.player.deaths, 1);
      assert.strictEqual(g.player.room, 't_temple');
      assert.strictEqual(g.player.hp, Math.max(1, Math.floor(g.maxHp() / 3)));
    }
  }
});

test('spells: cast by abbreviation, mana is spent', () => {
  const g = newGame('mage');
  teleport(g, 's_entry');
  const p = g.player;
  p.skills['magic missile'] = 100;
  const mana = p.mana;
  g.command('c magic rat');
  assert.ok(p.mana < mana);
  assert.match(g.text(), /You utter the words/);
});

test('skills are lagged and queued', () => {
  const g = newGame('warrior');
  teleport(g, 's_entry');
  g.command('kick rat');
  assert.ok(g.lagUntil > g.clock);
  const room = g.player.room;
  g.command('look');
  assert.strictEqual(g.queue.length, 1);
  g.update(1000); g.update(1000); g.update(100);
  assert.strictEqual(g.queue.length, 0);
  assert.strictEqual(g.player.room, room);
});

test('levelling up grants hp, practices and new skills', () => {
  const g = newGame('warrior');
  const p = g.player;
  const hp = g.maxHp();
  g.gainXp(g.xpNext(1) + g.xpNext(2) + 1);
  assert.strictEqual(p.level, 3);
  assert.ok(g.maxHp() > hp);
  assert.ok(p.skills.bash, 'warrior learns bash at 3');
});

test('locked iron gate needs Grukk\'s key', () => {
  const g = newGame();
  teleport(g, 'h_barrow');
  g.clear();
  g.command('d');
  assert.strictEqual(g.player.room, 'h_barrow');
  g.command('open gate');
  assert.match(g.text(), /locked/);
  g.player.inventory.push(g.createItem('i_crypt_key'));
  g.command('open gate');
  g.command('d');
  assert.strictEqual(g.player.room, 'c_stair');
});

test('pathfinding walks through explored rooms', () => {
  const g = newGame();
  ['t_square', 't_main', 't_main_s', 't_gate'].forEach((r) => g.player.explored.add(r));
  assert.deepStrictEqual(g.pathTo('t_gate'), ['s', 's', 's', 's']);
  assert.strictEqual(g.pathTo('c_sanctum'), null);
  g.walkTo('t_gate');
  for (let i = 0; i < 20; i++) g.update(300);
  assert.strictEqual(g.player.room, 't_gate');
});

test('save and load round-trip', () => {
  const g = newGame('thief', 'halfling');
  g.command('s');
  g.player.gold = 1234;
  const json = g.serialize();
  const g2 = new Game();
  g2.load(json);
  assert.strictEqual(g2.player.name, 'Tester');
  assert.strictEqual(g2.player.gold, 1234);
  assert.strictEqual(g2.player.room, 't_square');
  assert.ok(g2.player.explored.has('t_temple'));
  assert.ok(g2.player.equipment.wield);
});

test('mobs respawn after world resets', () => {
  const g = newGame();
  const slot = g.resetSlots.find((s) => s.mob === 'm_ratking');
  const room = g.rooms[slot.room];
  room.mobs.splice(room.mobs.indexOf(slot.inst), 1);
  slot.inst.hp = 0;
  g.resetWorld();
  assert.ok(room.mobs.some((m) => m.vnum === 'm_ratking'));
});

test('garbled spell words follow the Diku syllable table', () => {
  assert.strictEqual(util.garble('cure light'), 'judicandus dies');
});

test('balance: an even-level fight is winnable but not free', () => {
  // A geared warrior vs a same-level non-boss mob should usually win.
  const results = [];
  for (const L of [1, 5, 10, 15]) {
    let wins = 0;
    for (let n = 0; n < 60; n++) {
      const g = newGame('warrior');
      g.gainXp([...Array(L - 1)].reduce((a, _, i) => a + g.xpNext(i + 1), 0));
      const tmpl = { ...DATA.mobs.m_goblin, level: L };
      DATA.mobs.__sim = tmpl;
      const m = g.createMob('__sim');
      delete DATA.mobs.__sim;
      m.room = g.player.room = 'f_deep';
      g.rooms.f_deep.mobs = [m];
      g.player.equipment.body = g.createItem(L >= 5 ? 'i_chainshirt' : 'i_leather_jerkin');
      g.player.equipment.head = g.createItem('i_ironhelm');
      if (L >= 10) g.player.equipment.wield = g.createItem('i_warhammer');
      g.engage(m);
      let rounds = 0;
      while (m.hp > 0 && g.player.room === 'f_deep' && rounds++ < 100) g.violencePulse();
      if (m.hp <= 0) wins++;
    }
    results.push([L, wins / 60]);
  }
  for (const [L, rate] of results) assert.ok(rate >= 0.6, `level ${L} win rate ${rate}`);
});
