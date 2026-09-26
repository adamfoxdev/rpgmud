/* ==========================================================================
 * RPG MUD — game engine
 * A single-player, DikuMUD-flavoured engine. It knows nothing about the DOM:
 * it receives command strings, advances on update(dt), and emits events.
 *
 * Text markup used in output:
 *   {r}{g}{y}{b}{m}{c}{w}{D}  normal colours      {x} reset
 *   {R}{G}{Y}{B}{M}{C}{W}     bright colours
 *   [[command|label]]         clickable link that sends `command`
 * ========================================================================== */
(function (root) {
  'use strict';
  const MUD = (root.MUD = root.MUD || {});

  /* ------------------------------------------------------------ constants */
  const PULSE = { aggro: 1000, violence: 2000, mobile: 4000, tick: 15000, walk: 280 };
  const RESET_TICKS = 4;
  const MAX_LEVEL = 20;

  const DIRS = {
    n: { name: 'north', dx: 0, dy: -1, dz: 0, rev: 's', from: 'the south' },
    e: { name: 'east', dx: 1, dy: 0, dz: 0, rev: 'w', from: 'the west' },
    s: { name: 'south', dx: 0, dy: 1, dz: 0, rev: 'n', from: 'the north' },
    w: { name: 'west', dx: -1, dy: 0, dz: 0, rev: 'e', from: 'the east' },
    u: { name: 'up', dx: 0, dy: 0, dz: 1, rev: 'd', from: 'below' },
    d: { name: 'down', dx: 0, dy: 0, dz: -1, rev: 'u', from: 'above' },
  };
  const DIR_ORDER = ['n', 'e', 's', 'w', 'u', 'd'];
  const DIR_BY_NAME = {};
  for (const k of DIR_ORDER) DIR_BY_NAME[DIRS[k].name] = k;

  const SLOTS = ['wield', 'shield', 'head', 'neck', 'body', 'hands', 'legs', 'feet', 'finger'];
  const SLOT_LABEL = {
    wield: 'wielded', shield: 'worn as shield', head: 'worn on head', neck: 'worn around neck',
    body: 'worn on body', hands: 'worn on hands', legs: 'worn on legs', feet: 'worn on feet', finger: 'worn on finger',
  };
  const POS_RANK = { dead: 0, sleeping: 1, resting: 2, fighting: 3, standing: 4 };
  const MOVE_COST = { city: 1, inside: 1, road: 1, field: 2, sewer: 2, cave: 2, crypt: 2, forest: 3, hills: 3, water: 3 };
  const OUTDOORS = { city: 1, road: 1, field: 1, forest: 1, hills: 1, water: 1 };

  /* ------------------------------------------------------------ helpers */
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const dice = (n, s) => { let t = 0; for (let i = 0; i < n; i++) t += rand(1, s); return t; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const bonus = (v) => Math.floor((v - 13) / 2);
  const chance = (pct) => Math.random() * 100 < pct;
  const pad = (s, n) => { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
  const lpad = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
  const clean = (s) => String(s).replace(/[{}]/g, '').replace(/\[\[|\]\]/g, '');
  const TITLES = ['the Adventurer', 'the Wanderer', 'the Blooded', 'the Seasoned', 'the Veteran', 'the Champion', 'the Hero'];
  const xpNext = (lvl) => Math.round(200 * Math.pow(lvl, 1.6));

  // The classic Diku syllable table for garbling spoken spell words.
  const SYLLABLES = [
    ['ar', 'abra'], ['au', 'kada'], ['bless', 'fido'], ['blind', 'nose'], ['bur', 'mosa'], ['cu', 'judi'],
    ['de', 'oculo'], ['en', 'unso'], ['light', 'dies'], ['lo', 'hi'], ['mor', 'zak'], ['move', 'sido'],
    ['ness', 'lacri'], ['ning', 'illa'], ['per', 'duda'], ['ra', 'gru'], ['re', 'candus'], ['son', 'sabru'],
    ['tect', 'infra'], ['tri', 'cula'], ['ven', 'nofo'],
    ['a', 'a'], ['b', 'b'], ['c', 'q'], ['d', 'e'], ['e', 'z'], ['f', 'y'], ['g', 'o'], ['h', 'p'], ['i', 'u'],
    ['j', 'y'], ['k', 't'], ['l', 'r'], ['m', 'w'], ['n', 'i'], ['o', 'a'], ['p', 's'], ['q', 'd'], ['r', 'f'],
    ['s', 'g'], ['t', 'h'], ['u', 'j'], ['v', 'z'], ['w', 'x'], ['x', 'n'], ['y', 'l'], ['z', 'k'],
  ];
  function garble(spell) {
    let out = '', i = 0;
    while (i < spell.length) {
      if (spell[i] === ' ') { out += ' '; i++; continue; }
      const hit = SYLLABLES.find(([from]) => spell.startsWith(from, i));
      if (!hit) { i++; continue; }
      out += hit[1];
      i += hit[0].length;
    }
    return out;
  }

  const DAM_MSG = [
    [0, 'miss', 'misses'], [4, 'scratch', 'scratches'], [8, 'graze', 'grazes'], [12, 'hit', 'hits'],
    [16, 'injure', 'injures'], [20, 'wound', 'wounds'], [25, 'maul', 'mauls'], [30, 'decimate', 'decimates'],
    [35, 'devastate', 'devastates'], [40, 'maim', 'maims'], [50, 'MUTILATE', 'MUTILATES'],
    [60, 'DISEMBOWEL', 'DISEMBOWELS'], [70, 'DISMEMBER', 'DISMEMBERS'], [80, 'MASSACRE', 'MASSACRES'],
    [90, 'MANGLE', 'MANGLES'], [100, '*** DEMOLISH ***', '*** DEMOLISHES ***'],
    [Infinity, '=== OBLITERATE ===', '=== OBLITERATES ==='],
  ];
  function damVerb(dam, maxHp) {
    if (dam <= 0) return DAM_MSG[0];
    const pct = (dam * 100) / Math.max(1, maxHp);
    for (let i = 1; i < DAM_MSG.length; i++) if (pct <= DAM_MSG[i][0]) return DAM_MSG[i];
    return DAM_MSG[DAM_MSG.length - 1];
  }

  function condition(hp, max) {
    const pct = (hp * 100) / Math.max(1, max);
    if (pct >= 100) return 'is in excellent condition.';
    if (pct >= 90) return 'has a few scratches.';
    if (pct >= 75) return 'has some small wounds and bruises.';
    if (pct >= 50) return 'has quite a few wounds.';
    if (pct >= 30) return 'has some big nasty wounds and scratches.';
    if (pct >= 15) return 'looks pretty hurt.';
    return 'is in awful condition.';
  }

  /* ======================================================================
   * Game
   * ==================================================================== */
  class Game {
    constructor() {
      this.D = MUD.DATA;
      this.listeners = {};
      this.uidSeq = 1;
      this.clock = 0;
      this.next = { aggro: PULSE.aggro, violence: PULSE.violence, mobile: PULSE.mobile, tick: PULSE.tick, walk: 0 };
      this.ticks = 0;
      this.time = { hour: 8, day: 1 };
      this.queue = [];
      this.lagUntil = 0;
      this.lastCommand = '';
      this.walkPath = [];
      this.player = null;
      this.buildWorld();
    }

    /* ---------------------------------------------------------- events */
    on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); return this; }
    emit(evt, data) { (this.listeners[evt] || []).forEach((fn) => fn(data)); }
    out(text) { this.emit('output', { text, kind: 'text' }); }
    echo(text) { this.emit('output', { text: clean(text), kind: 'echo' }); }

    /* ---------------------------------------------------------- world */
    buildWorld() {
      const D = this.D;
      this.rooms = {};
      this.doors = {};
      for (const [id, t] of Object.entries(D.rooms)) {
        this.rooms[id] = { id, ...t, flags: t.flags || [], exits: {}, mobs: [], items: [] };
      }
      for (const [id, t] of Object.entries(D.rooms)) {
        for (const [dir, ex] of Object.entries(t.exits)) {
          if (typeof ex === 'string') { this.rooms[id].exits[dir] = { to: ex, door: null }; continue; }
          const key = [id, ex.to].sort().join('|');
          if (!this.doors[key]) {
            this.doors[key] = { name: ex.door, closed: true, locked: !!ex.locked, key: ex.key || null, lockedByDefault: !!ex.locked, rooms: [id, ex.to] };
          }
          this.rooms[id].exits[dir] = { to: ex.to, door: this.doors[key] };
        }
      }
      this.resetSlots = D.resets.map((r) => ({ ...r, inst: null }));
      this.resetWorld();
    }

    resetWorld() {
      for (const slot of this.resetSlots) {
        const room = this.rooms[slot.room];
        if (slot.mob) {
          if (slot.inst && slot.inst.hp > 0) continue;
          const m = this.createMob(slot.mob);
          m.reset = slot;
          m.room = slot.room;
          slot.inst = m;
          room.mobs.push(m);
          if (this.player && this.player.room === slot.room) {
            m.aware = !this.sneakCheck();
            this.out(`{Y}${cap(m.short)} appears.{x}`);
          }
        } else if (slot.item) {
          if (!room.items.some((i) => i.vnum === slot.item)) room.items.push(this.createItem(slot.item));
        }
      }
      const pr = this.player && this.player.room;
      for (const d of Object.values(this.doors)) {
        if (pr && d.rooms.includes(pr)) continue;
        d.closed = true;
        d.locked = d.lockedByDefault;
      }
    }

    createMob(vnum) {
      const t = this.D.mobs[vnum];
      const L = t.level;
      const hp = Math.round((5 + L * 7 + L * L * 0.8) * (t.hpMult || 1));
      const avg = (1.2 + L * 1.15) * (t.dmgMult || 1);
      return {
        uid: this.uidSeq++, vnum, kind: 'mob',
        name: t.name, short: t.short, long: t.long, desc: t.desc, icon: t.icon || '👤',
        level: L, hp, maxHp: hp,
        dmin: Math.max(1, Math.floor(avg * 0.6)), dmax: Math.max(2, Math.ceil(avg * 1.4)),
        hitroll: Math.floor(L / 3), flags: t.flags || [], spells: t.spells || [], talk: t.talk || [],
        hit: t.hit || 'hit', gold: t.gold ? rand(t.gold[0], t.gold[1]) : 0, loot: t.loot || [],
        fighting: false, aware: true, stunUntil: 0, room: null, boss: (t.hpMult || 1) > 1.3,
      };
    }

    createItem(vnum) {
      const t = this.D.items[vnum];
      return { uid: this.uidSeq++, vnum, kind: 'item', ...JSON.parse(JSON.stringify(t)) };
    }

    room(id) { return this.rooms[id || (this.player && this.player.room)]; }
    isFlag(entity, f) { return entity.flags && entity.flags.includes(f); }

    /* ---------------------------------------------------------- player */
    static rollStats(race, cls) {
      const D = MUD.DATA;
      const base = D.classes[cls].base, mods = D.races[race].mods, out = {};
      for (const k of ['str', 'int', 'wis', 'dex', 'con']) out[k] = clamp(base[k] + mods[k] + rand(-1, 2), 3, 20);
      return out;
    }

    newPlayer({ name, race, cls, stats }) {
      const C = this.D.classes[cls];
      const p = {
        name: cap(clean(name).replace(/[^A-Za-z]/g, '').slice(0, 14).toLowerCase()) || 'Wanderer',
        race, cls, title: 'the Adventurer', level: 1, xp: 0, stats: { ...stats },
        baseHp: 10 + C.hpDie + Math.max(0, bonus(stats.con)) * 2,
        baseMana: C.manaDie ? 20 + C.manaDie + Math.max(0, bonus(stats[C.prime])) * 3 : 0,
        baseMv: 100, gold: 30, room: 't_temple', position: 'standing', fighting: null,
        inventory: [], equipment: {}, skills: {}, practices: 3, affects: [], explored: new Set(),
        kills: 0, deaths: 0, wimpy: 0, autoloot: true, autogold: true, born: Date.now(),
      };
      this.player = p;
      p.hp = this.maxHp(); p.mana = this.maxMana(); p.mv = this.maxMv();
      for (const [sk, lvl] of Object.entries(C.skills)) if (lvl <= 1) p.skills[sk] = 40;
      for (const v of C.start) {
        const it = this.createItem(v);
        if (it.wear && !p.equipment[it.wear]) p.equipment[it.wear] = it; else p.inventory.push(it);
      }
      p.hp = this.maxHp(); p.mana = this.maxMana();
      this.enterWorld(true);
      return p;
    }

    enterWorld(isNew) {
      const p = this.player;
      p.explored.add(p.room);
      this.out(isNew
        ? `\n{Y}Welcome to Havenbrook, ${p.name}!{x}\nYou awaken in the Temple of the Dawn, ready for adventure.\nType {c}[[help newbie|help newbie]]{x} for tips, or {c}[[help|help]]{x} for a list of commands.\n`
        : `\n{Y}Welcome back, ${p.name}.{x} The Dawn watches over you.\n`);
      this.doLook('');
      this.prompt();
      this.emit('move', { to: p.room, dir: null });
      this.emit('update');
    }

    mods() {
      const p = this.player, m = { hit: 0, dam: 0, hp: 0, mana: 0, mv: 0, armor: 0, str: 0, int: 0, wis: 0, dex: 0, con: 0 };
      for (const it of Object.values(p.equipment)) {
        if (!it) continue;
        m.armor += it.armor || 0;
        for (const [k, v] of Object.entries(it.mods || {})) m[k] = (m[k] || 0) + v;
      }
      for (const a of p.affects) for (const [k, v] of Object.entries(a.mods || {})) m[k] = (m[k] || 0) + v;
      return m;
    }
    stat(k) { return clamp(this.player.stats[k] + (this.mods()[k] || 0), 3, 25); }
    maxHp() { return this.player.baseHp + this.mods().hp; }
    maxMana() { return this.player.baseMana ? this.player.baseMana + this.mods().mana : 0; }
    maxMv() { return this.player.baseMv + this.mods().mv; }
    armor() { return this.mods().armor + Math.max(0, bonus(this.stat('dex'))) * 2 + this.player.level; }
    hitroll() { return this.mods().hit + bonus(this.stat('str')) + Math.max(0, bonus(this.stat('dex'))); }
    damroll() { return this.mods().dam + bonus(this.stat('str')); }
    hasAffect(name) { return this.player.affects.some((a) => a.name === name); }
    skill(name) { return this.player.skills[name] || 0; }
    target() {
      const p = this.player;
      if (!p.fighting) return null;
      return this.room().mobs.find((m) => m.uid === p.fighting && m.hp > 0) || null;
    }
    xpNext(lvl) { return xpNext(lvl || this.player.level); }

    /* ---------------------------------------------------------- loop */
    update(dt) {
      if (!this.player) return;
      this.clock += Math.min(dt, 1000);
      const c = this.clock;
      if (c >= this.next.aggro) { this.next.aggro = c + PULSE.aggro; this.aggroPulse(); }
      if (c >= this.next.violence) { this.next.violence = c + PULSE.violence; this.violencePulse(); }
      if (c >= this.next.mobile) { this.next.mobile = c + PULSE.mobile; this.mobilePulse(); }
      if (c >= this.next.tick) { this.next.tick = c + PULSE.tick; this.tickPulse(); }
      if (this.walkPath.length && c >= this.next.walk) { this.next.walk = c + PULSE.walk; this.walkStep(); }
      if (this.queue.length && c >= this.lagUntil) this.execute(this.queue.shift());
    }

    lag(ms) { this.lagUntil = this.clock + ms; }
    tickProgress() { return 1 - (this.next.tick - this.clock) / PULSE.tick; }

    /* ---------------------------------------------------------- input */
    command(raw) {
      if (!this.player) return;
      let line = String(raw).trim();
      if (line === '!') line = this.lastCommand;
      else if (line) this.lastCommand = line;
      if (!line) { this.prompt(); return; }
      this.echo(line);
      const parts = line.split(';').map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const sw = this.expandSpeedwalk(part);
        for (const cmd of sw || [part]) {
          if (this.clock < this.lagUntil || this.queue.length) this.queue.push(cmd);
          else this.execute(cmd);
        }
      }
    }

    expandSpeedwalk(s) {
      if (!/^(\d*[nsewud])+$/.test(s)) return null;
      if (!/\d/.test(s) && s.length < 2) return null;
      const out = [];
      s.replace(/(\d*)([nsewud])/g, (_, n, d) => { for (let i = 0; i < Math.min(20, +n || 1); i++) out.push(d); });
      return out;
    }

    execute(line) {
      const p = this.player;
      if (line.startsWith("'") || line.startsWith('"')) line = 'say ' + line.slice(1);
      const sp = line.indexOf(' ');
      const word = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
      const args = sp < 0 ? '' : line.slice(sp + 1).trim();
      const cmd = COMMANDS.find((c) => c.name === word || (c.alias && c.alias.includes(word)))
        || COMMANDS.find((c) => !c.exact && c.name.startsWith(word));
      if (!cmd) { this.out("Huh?!"); this.prompt(); return; }
      if (p.position === 'dead') return;
      const need = POS_RANK[cmd.pos || 'sleeping'];
      if (POS_RANK[p.position] < need) {
        const msg = {
          sleeping: 'In your dreams, or what?',
          resting: 'Nah... You feel too relaxed...',
          fighting: 'No way!  You are fighting for your life!',
        }[p.position];
        this.out(msg || 'You cannot do that right now.');
      } else {
        this[cmd.fn](args, word);
      }
      if (!cmd.noPrompt) this.prompt();
      this.emit('update');
    }

    prompt() {
      const p = this.player;
      if (!p) return;
      const mh = this.maxHp(), mm = this.maxMana(), mv = this.maxMv();
      const hc = p.hp < mh * 0.3 ? '{R}' : p.hp < mh * 0.7 ? '{Y}' : '{G}';
      let s = `{D}<{x}${hc}${p.hp}{D}/${mh}hp{x} {C}${p.mana}{D}/${mm}m{x} {Y}${p.mv}{D}/${mv}mv{D}>{x}`;
      const t = this.target();
      if (t) s += ` {D}[{R}${t.short}{D}: ${Math.round((t.hp * 100) / t.maxHp)}%]{x}`;
      this.emit('output', { text: s, kind: 'prompt' });
    }

    /* ---------------------------------------------------------- matching */
    parseKw(arg) {
      arg = (arg || '').toLowerCase().trim();
      const m = arg.match(/^(\d+)\.(.+)$/);
      return m ? { n: +m[1], kw: m[2] } : { n: 1, kw: arg };
    }
    matches(e, kw) {
      if (!kw) return false;
      const words = kw.split(/\s+/);
      const names = e.name.toLowerCase().split(/\s+/);
      return words.every((w) => names.some((n) => n.startsWith(w)));
    }
    find(list, arg) {
      const { n, kw } = this.parseKw(arg);
      let c = 0;
      for (const e of list) if (this.matches(e, kw) && ++c === n) return e;
      return null;
    }
    findAll(list, arg) {
      arg = (arg || '').toLowerCase();
      if (arg === 'all') return list.slice();
      if (arg.startsWith('all.')) return list.filter((e) => this.matches(e, arg.slice(4)));
      const one = this.find(list, arg);
      return one ? [one] : [];
    }
    findMob(arg) { return this.find(this.room().mobs, arg); }
    equipped() { return SLOTS.map((s) => this.player.equipment[s]).filter(Boolean); }
    splitArgs(args) {
      const a = args.split(/\s+/).filter(Boolean);
      return [a[0] || '', a.slice(1).join(' ')];
    }
    groupList(list, colour) {
      const groups = [];
      for (const it of list) {
        const g = groups.find((x) => x.key === it.vnum && !it.contents);
        if (g) g.n++; else groups.push({ key: it.vnum, it, n: 1 });
      }
      return groups.map((g) => `${g.n > 1 ? `{D}(${lpad(g.n, 2)}){x} ` : '     '}${colour}${g.it.short}{x}`);
    }

    /* ---------------------------------------------------------- looking */
    doLook(args) {
      const p = this.player, room = this.room();
      if (p.position === 'sleeping') { this.out("You can't see anything, you're sleeping!"); return; }
      args = (args || '').trim().toLowerCase();
      if (!args || args === 'auto') {
        const area = this.D.areas[room.area];
        this.out(`{C}${room.name}{x} {D}[${area.name}]{x}`);
        this.out(`   ${room.desc}`);
        this.out(this.exitLine());
        for (const line of this.roomItemLines(room)) this.out(line);
        for (const m of room.mobs) {
          let line = m.long;
          if (m.fighting) line = `${cap(m.short)} is here, fighting {R}YOU{x}!`;
          else if (m.stunUntil > this.clock) line = `${cap(m.short)} is lying here, stunned.`;
          this.out(`{Y}${line}{x}`);
        }
        return;
      }
      const words = args.split(/\s+/);
      if (words[0] === 'in' || words[0] === 'into') return this.lookIn(words.slice(1).join(' '));
      if (DIRS[args] || DIR_BY_NAME[args]) return this.lookDir(this.dirFromArg(args));
      const m = this.findMob(args);
      if (m) {
        this.out(`{Y}${cap(m.short)}{x} {D}(level ${m.level})${m.flags.includes('aggressive') ? ' {r}hostile' : ''}{x}`);
        this.out(`   ${m.desc || 'You see nothing special.'}`);
        this.out(`${cap(m.short)} ${condition(m.hp, m.maxHp)}`);
        this.emit('focus', { uid: m.uid });
        return;
      }
      const it = this.find(room.items, args) || this.find(p.inventory, args) || this.find(this.equipped(), args);
      if (it) return this.describeItem(it);
      const dir = this.dirFromArg(args);
      if (dir) return this.lookDir(dir);
      this.out('You do not see that here.');
    }

    describeItem(it) {
      this.out(`{G}${cap(it.short)}{x}`);
      if (it.desc) this.out(`   ${it.desc}`);
      const bits = [];
      if (it.type === 'weapon') bits.push(`damage ${it.dice[0]}d${it.dice[1]} (avg ${((it.dice[0] * (it.dice[1] + 1)) / 2).toFixed(1)})`);
      if (it.armor) bits.push(`armor +${it.armor}`);
      for (const [k, v] of Object.entries(it.mods || {})) bits.push(`${k} ${v > 0 ? '+' : ''}${v}`);
      if (it.effect) bits.push(Object.entries(it.effect).map(([k, v]) => `restores ${v} ${k}`).join(', '));
      if (it.level) bits.push(`level ${it.level}`);
      if (it.wear) bits.push(SLOT_LABEL[it.wear]);
      if (bits.length) this.out(`   {c}${bits.join('  |  ')}{x}`);
      if (it.contents) this.lookIn(null, it);
      else if (!it.desc && !bits.length) this.out('   You see nothing special.');
    }

    lookIn(arg, cont) {
      const p = this.player;
      cont = cont || this.find(this.room().items, arg) || this.find(p.inventory, arg);
      if (!cont) return this.out('You do not see that here.');
      if (!cont.contents) return this.out('That is not a container.');
      this.out(`${cap(cont.short)} contains:`);
      const lines = this.groupList(cont.contents, '{G}');
      if (cont.gold) lines.push(`     {Y}${cont.gold} gold coins{x}`);
      this.out(lines.length ? lines.join('\n') : '     Nothing.');
    }

    lookDir(dir) {
      const ex = this.room().exits[dir];
      if (!ex) return this.out('Nothing special there.');
      if (ex.door && ex.door.closed) return this.out(`The ${ex.door.name} is closed.`);
      const r = this.rooms[ex.to];
      this.out(`You peer ${DIRS[dir].name} and see {C}${r.name}{x}.`);
      if (r.mobs.length) this.out(r.mobs.map((m) => `  {Y}${cap(m.short)}{x}`).join('\n'));
    }

    roomItemLines(room) {
      const groups = [];
      for (const it of room.items) {
        const g = groups.find((x) => x.it.vnum === it.vnum && !it.contents);
        if (g) g.n++; else groups.push({ it, n: 1 });
      }
      return groups.map((g) => `${g.n > 1 ? `{D}(${g.n}){x} ` : ''}{G}${g.it.long}{x}`);
    }

    exitLine() {
      const room = this.room(), bits = [];
      for (const d of DIR_ORDER) {
        const ex = room.exits[d];
        if (!ex) continue;
        const nm = DIRS[d].name;
        bits.push(ex.door && ex.door.closed ? `{D}([[${nm}|${nm}]]){x}` : `[[${nm}|${nm}]]`);
      }
      return `{c}[Exits: ${bits.length ? bits.join(' ') : 'none'}]{x}`;
    }

    dirFromArg(arg) {
      arg = (arg || '').toLowerCase();
      if (DIRS[arg]) return arg;
      if (DIR_BY_NAME[arg]) return DIR_BY_NAME[arg];
      if (arg.length > 1) for (const d of DIR_ORDER) if (DIRS[d].name.startsWith(arg)) return d;
      return null;
    }

    doExits() {
      const room = this.room(), lines = ['Obvious exits:'];
      for (const d of DIR_ORDER) {
        const ex = room.exits[d];
        if (!ex) continue;
        const r = this.rooms[ex.to];
        const known = this.player.explored.has(r.id);
        lines.push(`  ${pad(cap(DIRS[d].name), 6)} - ${ex.door && ex.door.closed ? `{D}(closed ${ex.door.name}){x}` : known ? `{C}${r.name}{x}` : '{D}Unexplored{x}'}`);
      }
      if (lines.length === 1) lines.push('  None.');
      this.out(lines.join('\n'));
    }

    doScan() {
      const room = this.room(), lines = ['You scan your surroundings...'];
      let seen = 0;
      for (const d of DIR_ORDER) {
        const ex = room.exits[d];
        if (!ex || (ex.door && ex.door.closed)) continue;
        const r = this.rooms[ex.to];
        for (const m of r.mobs) { lines.push(`  {W}${pad(cap(DIRS[d].name), 6)}{x} {Y}${cap(m.short)}{x}`); seen++; }
      }
      if (!seen) lines.push('  You see no one nearby.');
      this.out(lines.join('\n'));
    }

    doWhere() {
      const area = this.room().area, lines = [`Creatures you sense in {C}${this.D.areas[area].name}{x}:`];
      for (const r of Object.values(this.rooms)) {
        if (r.area !== area || !this.player.explored.has(r.id)) continue;
        for (const m of r.mobs) lines.push(`  {Y}${pad(cap(m.short), 34)}{x} ${r.name}`);
      }
      if (lines.length === 1) lines.push('  Nothing.');
      this.out(lines.join('\n'));
    }

    doTime() {
      const h = this.time.hour, hh = h % 12 || 12;
      this.out(`It is ${hh} o'clock ${h < 12 ? 'am' : 'pm'}, on day ${this.time.day} of the Season of Embers.`);
    }

    doMap() {
      const p = this.player, cur = this.room(), R = 3, grid = {};
      for (const r of Object.values(this.rooms)) {
        if (r.z !== cur.z || !p.explored.has(r.id)) continue;
        if (Math.abs(r.x - cur.x) > R || Math.abs(r.y - cur.y) > R) continue;
        grid[`${r.x},${r.y}`] = r;
      }
      const lines = [];
      for (let y = cur.y - R; y <= cur.y + R; y++) {
        let row = '', below = '';
        for (let x = cur.x - R; x <= cur.x + R; x++) {
          const r = grid[`${x},${y}`];
          if (!r) { row += '    '; below += '    '; continue; }
          const ch = r === cur ? '{R}@{x}' : r.exits.u && r.exits.d ? '{M}%{x}' : r.exits.u ? '{M}^{x}' : r.exits.d ? '{M}v{x}' : r.mobs.length ? '{Y}*{x}' : '{w}#{x}';
          row += `[${ch}]` + (r.exits.e ? '-' : ' ');
          below += (r.exits.s ? ' | ' : '   ') + ' ';
        }
        lines.push(' ' + row.replace(/\s+$/, ''));
        if (y < cur.y + R) lines.push(' ' + below.replace(/\s+$/, ''));
      }
      this.out(`{C}${cur.name}{x} {D}(level ${cur.z}){x}\n${lines.filter((l) => l.trim()).join('\n')}\n{D}Legend: {R}@{D} you  {Y}*{D} creatures  {M}^ v{D} stairs{x}`);
    }

    /* ---------------------------------------------------------- movement */
    doMove(args, word) {
      const dir = DIRS[word] ? word : this.dirFromArg(word);
      this.move(dir);
    }

    move(dir, fleeing) {
      const p = this.player, room = this.room(), ex = room.exits[dir];
      if (!ex) { this.out('Alas, you cannot go that way.'); this.walkPath = []; return false; }
      if (ex.door && ex.door.closed) { this.out(`The ${ex.door.name} is closed.`); this.walkPath = []; return false; }
      const to = this.rooms[ex.to];
      const cost = Math.ceil(((MOVE_COST[room.sector] || 1) + (MOVE_COST[to.sector] || 1)) / 2);
      if (p.mv < cost && !fleeing) { this.out('You are too exhausted.'); this.walkPath = []; return false; }
      p.mv = Math.max(0, p.mv - cost);
      const from = p.room;
      for (const m of room.mobs) m.fighting = false;
      p.fighting = null;
      if (p.position === 'fighting') p.position = 'standing';
      p.room = to.id;
      const first = !p.explored.has(to.id);
      p.explored.add(to.id);
      const sneaking = this.hasAffect('sneak');
      for (const m of to.mobs) m.aware = !(sneaking && this.sneakCheck());
      this.emit('move', { from, to: to.id, dir, first });
      if (first && to.area !== room.area) this.out(`{W}~ You enter ${this.D.areas[to.area].name} {D}(levels ${this.D.areas[to.area].levels}){W} ~{x}`);
      this.doLook('');
      return true;
    }

    sneakCheck() { return this.hasAffect('sneak') && chance(this.skill('sneak') + bonus(this.stat('dex')) * 3); }

    walkTo(roomId) {
      const path = this.pathTo(roomId);
      if (!path) { this.out('{D}You do not know the way there.{x}'); this.prompt(); return false; }
      if (!path.length) return false;
      if (this.player.position !== 'standing') { this.out("You can't travel right now."); this.prompt(); return false; }
      this.walkPath = path;
      this.next.walk = this.clock;
      this.out(`{D}You set off toward ${this.rooms[roomId].name}...{x}`);
      return true;
    }

    walkStep() {
      const p = this.player;
      if (p.position !== 'standing') { this.walkPath = []; this.out('{D}You stop travelling.{x}'); this.prompt(); return; }
      const dir = this.walkPath.shift();
      const ex = this.room().exits[dir];
      if (ex && ex.door && ex.door.closed) this.doOpen(DIRS[dir].name);
      if (!this.move(dir)) this.walkPath = [];
      this.prompt();
      this.emit('update');
    }

    pathTo(goal) {
      const p = this.player;
      if (goal === p.room) return [];
      if (!p.explored.has(goal)) return null;
      const prev = { [p.room]: null }, q = [p.room];
      while (q.length) {
        const id = q.shift();
        if (id === goal) break;
        for (const d of DIR_ORDER) {
          const ex = this.rooms[id].exits[d];
          if (!ex || prev[ex.to] !== undefined || !p.explored.has(ex.to)) continue;
          if (ex.door && ex.door.locked && !this.hasKey(ex.door.key)) continue;
          prev[ex.to] = { id, d };
          q.push(ex.to);
        }
      }
      if (prev[goal] === undefined) return null;
      const path = [];
      for (let cur = goal; prev[cur]; cur = prev[cur].id) path.unshift(prev[cur].d);
      return path;
    }

    doRecall() {
      const p = this.player;
      if (p.fighting) return this.out('You cannot pray for transport while fighting!');
      if (this.room().flags.includes('recall')) return this.out('You are already in the temple.');
      if (p.mv < 10) return this.out('You are too exhausted to pray.');
      p.mv = Math.floor(p.mv / 2);
      this.out('{W}You pray to the Dawn for transportation... golden light surrounds you!{x}');
      const from = p.room;
      p.room = 't_temple';
      p.explored.add(p.room);
      this.walkPath = [];
      this.emit('move', { from, to: p.room, dir: null, teleport: true });
      this.doLook('');
    }

    /* ---------------------------------------------------------- doors */
    findDoor(arg) {
      const room = this.room();
      const dir = this.dirFromArg(arg);
      if (dir && room.exits[dir] && room.exits[dir].door) return { dir, door: room.exits[dir].door };
      for (const d of DIR_ORDER) {
        const ex = room.exits[d];
        if (ex && ex.door && ex.door.name.split(' ').some((w) => w.startsWith(arg))) return { dir: d, door: ex.door };
      }
      return null;
    }
    hasKey(vnum) { return this.player.inventory.some((i) => i.vnum === vnum); }
    doOpen(arg) {
      if (!arg) return this.out('Open what?');
      const f = this.findDoor(arg.toLowerCase());
      if (!f) return this.out("You don't see that here.");
      if (!f.door.closed) return this.out("It's already open.");
      if (f.door.locked) {
        if (!this.hasKey(f.door.key)) return this.out(`The ${f.door.name} is locked.`);
        f.door.locked = false;
        this.out(`*Click* You unlock the ${f.door.name}.`);
      }
      f.door.closed = false;
      this.out(`You open the ${f.door.name}.`);
    }
    doClose(arg) {
      if (!arg) return this.out('Close what?');
      const f = this.findDoor(arg.toLowerCase());
      if (!f) return this.out("You don't see that here.");
      if (f.door.closed) return this.out("It's already closed.");
      f.door.closed = true;
      this.out(`You close the ${f.door.name}.`);
    }
    doUnlock(arg) {
      if (!arg) return this.out('Unlock what?');
      const f = this.findDoor(arg.toLowerCase());
      if (!f) return this.out("You don't see that here.");
      if (!f.door.locked) return this.out("It's not locked.");
      if (!this.hasKey(f.door.key)) return this.out('You lack the key.');
      f.door.locked = false;
      this.out(`*Click* You unlock the ${f.door.name}.`);
    }
    doLock(arg) {
      if (!arg) return this.out('Lock what?');
      const f = this.findDoor(arg.toLowerCase());
      if (!f) return this.out("You don't see that here.");
      if (!f.door.closed) return this.out("You'll have to close it first.");
      if (f.door.locked) return this.out("It's already locked.");
      if (!this.hasKey(f.door.key)) return this.out('You lack the key.');
      f.door.locked = true;
      this.out(`*Click* You lock the ${f.door.name}.`);
    }

    /* ---------------------------------------------------------- items */
    doGet(args) {
      const p = this.player, room = this.room();
      const [what, from] = this.splitArgs(args.replace(/\s+from\s+/, ' '));
      if (!what) return this.out('Get what?');
      let cont = null, source = room.items;
      if (from) {
        cont = this.find(room.items, from) || this.find(p.inventory, from);
        if (!cont) return this.out(`You see no ${from} here.`);
        if (!cont.contents) return this.out("That's not a container.");
        source = cont.contents;
      }
      if (cont) return this.getFrom(cont, what);
      const list = this.findAll(source, what);
      if (!list.length) return this.out('You do not see that here.');
      let got = 0;
      for (const it of list) {
        if (it.noTake) continue;
        source.splice(source.indexOf(it), 1);
        p.inventory.push(it);
        got++;
        this.out(`You get ${it.short}.`);
      }
      if (!got) this.out(list.length === 1 ? `You can't take ${list[0].short}.` : 'There is nothing here you can take.');
    }
    getFrom(cont, what) {
      const p = this.player;
      let tookGold = false;
      if ((what === 'all' || /^(gold|coins?)$/.test(what)) && cont.gold) { this.takeGold(cont); tookGold = true; }
      const list = /^(gold|coins?)$/.test(what) ? [] : this.findAll(cont.contents, what);
      if (!list.length) {
        if (tookGold) return;
        return this.out(what === 'all' ? `${cap(cont.short)} is empty.` : `There is nothing like that in ${cont.short}.`);
      }
      for (const it of list) {
        cont.contents.splice(cont.contents.indexOf(it), 1);
        p.inventory.push(it);
        this.out(`You get ${it.short} from ${cont.short}.`);
      }
    }
    takeGold(cont) {
      const g = cont.gold;
      cont.gold = 0;
      this.player.gold += g;
      this.out(`You get {Y}${g} gold coin${g === 1 ? '' : 's'}{x} from ${cont.short}.`);
    }

    doDrop(args) {
      const p = this.player;
      if (!args) return this.out('Drop what?');
      const list = this.findAll(p.inventory, args);
      if (!list.length) return this.out("You don't have that.");
      for (const it of list) {
        p.inventory.splice(p.inventory.indexOf(it), 1);
        this.room().items.push(it);
        this.out(`You drop ${it.short}.`);
      }
    }

    doInventory() {
      const p = this.player;
      const lines = p.inventory.length ? this.groupList(p.inventory, '{G}') : ['     Nothing.'];
      this.out(`You are carrying:\n${lines.join('\n')}\n{D}Gold:{x} {Y}${p.gold}{x}`);
    }

    doEquipment() {
      const p = this.player, lines = ['You are using:'];
      for (const s of SLOTS) {
        const it = p.equipment[s];
        lines.push(`  {D}<${pad(SLOT_LABEL[s] + '>', 18)}{x} ${it ? `{G}${it.short}{x}` : '{D}nothing{x}'}`);
      }
      this.out(lines.join('\n'));
    }

    doWear(args, word) {
      const p = this.player;
      if (!args) return this.out(`${cap(word)} what?`);
      if (args.toLowerCase() === 'all') {
        const cand = p.inventory.filter((i) => i.wear && !p.equipment[i.wear] && (!i.level || i.level <= p.level));
        if (!cand.length) return this.out('You have nothing else you can wear.');
        const seen = new Set();
        for (const it of cand) if (!seen.has(it.wear)) { seen.add(it.wear); this.wearItem(it); }
        return;
      }
      const it = this.find(p.inventory, args);
      if (!it) return this.out("You don't have that.");
      this.wearItem(it);
    }

    wearItem(it) {
      const p = this.player;
      if (!it.wear) return this.out(`You can't wear ${it.short}.`);
      if (it.level && it.level > p.level) return this.out(`You must be level ${it.level} to use ${it.short}.`);
      const old = p.equipment[it.wear];
      if (old) { p.inventory.push(old); this.out(`You stop using ${old.short}.`); }
      p.inventory.splice(p.inventory.indexOf(it), 1);
      p.equipment[it.wear] = it;
      const verb = it.wear === 'wield' ? 'wield' : it.wear === 'shield' ? 'wear as a shield' : `wear on your ${it.wear}`;
      this.out(`You ${verb} ${it.short}.`);
      this.clampVitals();
    }

    doRemove(args) {
      const p = this.player;
      if (!args) return this.out('Remove what?');
      const list = args.toLowerCase() === 'all' ? this.equipped() : [this.find(this.equipped(), args)].filter(Boolean);
      if (!list.length) return this.out("You aren't using that.");
      for (const it of list) {
        delete p.equipment[it.wear];
        p.inventory.push(it);
        this.out(`You stop using ${it.short}.`);
      }
      this.clampVitals();
    }

    clampVitals() {
      const p = this.player;
      p.hp = Math.min(p.hp, this.maxHp());
      p.mana = Math.min(p.mana, this.maxMana());
      p.mv = Math.min(p.mv, this.maxMv());
    }

    doQuaff(args, word) {
      const p = this.player;
      if (!args) return this.out(`${cap(word)} what?`);
      const it = this.find(p.inventory, args);
      if (!it) return this.out("You don't have that.");
      if (it.type !== 'potion') return this.out(`You can't ${word} that.`);
      p.inventory.splice(p.inventory.indexOf(it), 1);
      const verb = it.food ? 'eat' : it.drink ? 'drink' : 'quaff';
      this.out(`You ${verb} ${it.short}.`);
      const e = it.effect, gained = [];
      if (e.hp) { const g = Math.min(e.hp, this.maxHp() - p.hp); p.hp += g; gained.push(`{G}+${g} hp{x}`); }
      if (e.mana) { const g = Math.min(e.mana, this.maxMana() - p.mana); p.mana += g; gained.push(`{C}+${g} mana{x}`); }
      if (e.mv) { const g = Math.min(e.mv, this.maxMv() - p.mv); p.mv += g; gained.push(`{Y}+${g} mv{x}`); }
      this.out(`You feel ${e.hp >= 60 ? 'much ' : ''}better. ${gained.join(' ')}`);
      this.emit('heal', { target: 'player', amount: e.hp || 0 });
      this.lag(500);
    }

    /* ---------------------------------------------------------- shops */
    shop() {
      const room = this.room(), s = this.D.shops[room.id];
      if (!s) return null;
      const keeper = room.mobs.find((m) => m.vnum === s.keeper);
      return keeper ? { ...s, keeper } : null;
    }
    doList() {
      const s = this.shop();
      if (!s) return this.out('You are not in a shop.');
      const lines = [`{Y}${cap(s.keeper.short)}{x} shows you the wares:`, '{D}  [ Lv  Price ] Item{x}'];
      s.sells.forEach((v, i) => {
        const t = this.D.items[v];
        const afford = t.cost <= this.player.gold ? '{G}' : '{r}';
        lines.push(`  {D}[{x}${lpad(t.level || 1, 3)} ${afford}${lpad(t.cost, 6)}{D} ]{x} [[buy ${i + 1}|${t.short}]] {D}${this.shortStats(t)}{x}`);
      });
      lines.push('{D}Click an item or type BUY <item>.{x}');
      this.out(lines.join('\n'));
    }
    shortStats(t) {
      if (t.type === 'weapon') return `${t.dice[0]}d${t.dice[1]}${t.mods ? ' +' + Object.keys(t.mods).join('/') : ''}`;
      if (t.type === 'armor') return `${t.wear}, ac ${t.armor}`;
      if (t.effect) return Object.entries(t.effect).map(([k, v]) => `+${v} ${k}`).join(' ');
      return '';
    }
    doBuy(args) {
      const p = this.player, s = this.shop();
      if (!s) return this.out('You are not in a shop.');
      if (!args) return this.out('Buy what?');
      let qty = 1;
      const m = args.match(/^(\d+)\s+(.+)$/);
      if (m) { qty = clamp(+m[1], 1, 20); args = m[2]; }
      let vnum = null;
      if (/^\d+$/.test(args)) vnum = s.sells[+args - 1];
      else {
        const temps = s.sells.map((v) => ({ vnum: v, name: this.D.items[v].name }));
        const f = this.find(temps, args);
        vnum = f && f.vnum;
      }
      if (!vnum) return this.out(`${cap(s.keeper.short)} tells you, 'I don't sell that. Try LIST.'`);
      const t = this.D.items[vnum];
      for (let i = 0; i < qty; i++) {
        if (p.gold < t.cost) { this.out(`${cap(s.keeper.short)} tells you, 'You can't afford ${i ? 'any more of those' : t.short}.'`); break; }
        p.gold -= t.cost;
        p.inventory.push(this.createItem(vnum));
        this.out(`You buy ${t.short} for {Y}${t.cost}{x} gold.`);
      }
      this.emit('coins', {});
    }
    sellPrice(it) { return Math.max(1, Math.floor(it.cost / 2)); }
    doSell(args) {
      const p = this.player, s = this.shop();
      if (!s) return this.out('You are not in a shop.');
      if (!args) return this.out('Sell what?');
      const list = this.findAll(p.inventory, args);
      if (!list.length) return this.out("You don't have that.");
      for (const it of list) {
        if (!s.buys.includes(it.type) || it.type === 'key') { this.out(`${cap(s.keeper.short)} tells you, 'I have no use for ${it.short}.'`); continue; }
        const price = this.sellPrice(it);
        p.inventory.splice(p.inventory.indexOf(it), 1);
        p.gold += price;
        this.out(`${cap(s.keeper.short)} gives you {Y}${price}{x} gold for ${it.short}.`);
      }
    }
    doValue(args) {
      const s = this.shop();
      if (!s) return this.out('You are not in a shop.');
      const it = this.find(this.player.inventory, args);
      if (!it) return this.out("You don't have that.");
      if (!s.buys.includes(it.type)) return this.out(`${cap(s.keeper.short)} tells you, 'I have no use for ${it.short}.'`);
      this.out(`${cap(s.keeper.short)} tells you, 'I'll give you ${this.sellPrice(it)} gold for ${it.short}.'`);
    }

    /* ---------------------------------------------------------- positions */
    doRest() {
      const p = this.player;
      if (p.position === 'resting') return this.out('You are already resting.');
      p.position = 'resting';
      this.out('You sit down and rest your tired bones.');
    }
    doSleep() {
      const p = this.player;
      if (p.position === 'sleeping') return this.out('You are already sound asleep.');
      p.position = 'sleeping';
      this.out('You lie down and go to sleep.');
    }
    doStand() {
      const p = this.player;
      if (p.position === 'standing' || p.position === 'fighting') return this.out('You are already standing.');
      this.out(p.position === 'sleeping' ? 'You wake and stand up.' : 'You stand up.');
      p.position = 'standing';
    }

    /* ---------------------------------------------------------- social */
    doSay(args) {
      if (!args) return this.out('Say what?');
      this.out(`{c}You say '${clean(args)}'{x}`);
      const m = this.room().mobs.find((x) => x.talk.length);
      if (m && /\b(hi|hello|greetings|hail|help|quest)\b/i.test(args)) this.mobTalk(m);
    }
    doEmote(args) {
      if (!args) return this.out('Emote what?');
      this.out(`{c}${this.player.name} ${clean(args)}{x}`);
    }
    doTalk(args) {
      if (!args) return this.out('Talk to whom?');
      const m = this.findMob(args.replace(/^to\s+/, ''));
      if (!m) return this.out("They aren't here.");
      this.mobTalk(m);
    }
    mobTalk(m) {
      if (!m.talk.length) return this.out(`${cap(m.short)} doesn't seem to have much to say.`);
      const line = m.talk[(m.talkIdx = ((m.talkIdx ?? -1) + 1) % m.talk.length)];
      this.out(`{Y}${cap(m.short)}{x} says, {c}${line}{x}`);
    }
    doWho() {
      const p = this.player, R = this.D.races[p.race], C = this.D.classes[p.cls];
      this.out(`{W}Adventurers in the realm{x}\n{D}------------------------{x}\n[{Y}${lpad(p.level, 2)}{x} ${R.abbr} ${C.abbr}] ${p.name} ${p.title}\n{D}Players found: 1{x}`);
    }
    doTitle(args) {
      if (!args) return this.out('Change your title to what?');
      this.player.title = clean(args).slice(0, 40);
      this.out('Ok.');
    }

    /* ---------------------------------------------------------- info */
    doScore() {
      const p = this.player, R = this.D.races[p.race], C = this.D.classes[p.cls];
      const st = (k) => `${cap(k)}: {W}${lpad(p.stats[k], 2)}{x}${this.stat(k) !== p.stats[k] ? `{D}(${this.stat(k)}){x}` : '    '}`;
      const L = [
        `{W}${p.name} ${p.title}{x}`,
        `{D}Level{x} ${p.level} ${R.name} ${C.name}   {D}Day{x} ${this.time.day}`,
        `{D}----------------------------------------------------{x}`,
        `Hit Points: {G}${p.hp}/${this.maxHp()}{x}  Mana: {C}${p.mana}/${this.maxMana()}{x}  Moves: {Y}${p.mv}/${this.maxMv()}{x}`,
        `${st('str')}  ${st('int')}  ${st('wis')}  ${st('dex')}  ${st('con')}`,
        `Armor: {W}${this.armor()}{x}   Hitroll: {W}${this.hitroll()}{x}   Damroll: {W}${this.damroll()}{x}`,
        `Experience: {W}${p.xp}{x}/${this.xpNext()} to next level   Gold: {Y}${p.gold}{x}`,
        `Practices: {W}${p.practices}{x}   Kills: {W}${p.kills}{x}   Deaths: {W}${p.deaths}{x}   Wimpy: {W}${p.wimpy}{x}`,
        `You are ${p.position}.${p.affects.length ? ` Affected by: {c}${p.affects.map((a) => a.name).join(', ')}{x}` : ''}`,
      ];
      this.out(L.join('\n'));
    }
    doAffects() {
      const a = this.player.affects;
      if (!a.length) return this.out('You are not affected by any spells.');
      this.out('You are affected by:\n' + a.map((x) => `  {c}${pad(x.name, 12)}{x} for ${x.dur} hour${x.dur === 1 ? '' : 's'}`).join('\n'));
    }
    doSkills() {
      const p = this.player, C = this.D.classes[p.cls];
      const lines = [`{W}${C.name} skills & spells{x}`];
      for (const [sk, lvl] of Object.entries(C.skills).sort((a, b) => a[1] - b[1])) {
        const known = p.skills[sk];
        const S = this.D.spells[sk];
        const cost = S.mana ? `${S.mana} mana` : S.mv ? `${S.mv} mv` : 'passive';
        lines.push(`  {D}Lv ${lpad(lvl, 2)}{x}  ${known ? '{W}' : '{D}'}${pad(sk, 16)}{x} ${known ? `{G}${lpad(known, 3)}%{x}` : '{D}  --{x}'}  {D}${cost}{x}`);
      }
      lines.push(`Practice sessions left: {W}${p.practices}{x}`);
      this.out(lines.join('\n'));
    }
    doPractice(args) {
      const p = this.player, room = this.room();
      if (!args) return this.doSkills();
      const gm = room.mobs.find((m) => m.flags.includes('guildmaster'));
      if (!gm) return this.out('You can only practice at the Adventurers\' Guildhall.');
      if (p.practices <= 0) return this.out('You have no practice sessions left.');
      const sk = Object.keys(p.skills).find((s) => s.startsWith(args.toLowerCase()));
      if (!sk) return this.out("You don't know any skill by that name.");
      if (p.skills[sk] >= 75) return this.out(`You are already learned at ${sk}. Improve it through use.`);
      const C = this.D.classes[p.cls];
      p.practices--;
      p.skills[sk] = Math.min(75, p.skills[sk] + Math.max(5, 10 + bonus(this.stat(C.prime)) * 2));
      this.out(`You practice ${sk} with ${gm.short}. {G}(${p.skills[sk]}%){x}${p.skills[sk] >= 75 ? ' You are now learned at it.' : ''}`);
    }
    doLevels() {
      const p = this.player, lines = ['{W}Level  Experience needed{x}'];
      for (let l = p.level; l < Math.min(MAX_LEVEL, p.level + 6); l++) lines.push(`  ${lpad(l, 2)} -> ${lpad(l + 1, 2)}   ${lpad(xpNext(l), 6)}`);
      this.out(lines.join('\n'));
    }
    doWimpy(args) {
      const p = this.player;
      if (!args) return this.out(`Your wimpy is set to ${p.wimpy} hit points.`);
      const n = clamp(parseInt(args, 10) || 0, 0, Math.floor(this.maxHp() / 2));
      p.wimpy = n;
      this.out(`Wimpy set to ${n} hit points.`);
    }
    doAutoloot() { const p = this.player; p.autoloot = !p.autoloot; this.out(`Autoloot is now ${p.autoloot ? '{G}ON' : '{R}OFF'}{x}.`); }
    doAutogold() { const p = this.player; p.autogold = !p.autogold; this.out(`Autogold is now ${p.autogold ? '{G}ON' : '{R}OFF'}{x}.`); }
    doHelp(args) {
      const topic = (args || 'commands').toLowerCase();
      const key = Object.keys(this.D.help).find((k) => k.startsWith(topic));
      this.out(key ? this.D.help[key] : `No help on '${clean(args)}'. Try {c}help{x}.`);
    }
    doSave() { this.emit('save'); this.out('{G}Your progress has been saved.{x}'); }
    doRestart() { this.emit('restart'); }

    /* ---------------------------------------------------------- combat */
    canAttack(m) {
      if (!m) { this.out("They aren't here."); return false; }
      if (m.flags.includes('peaceful')) { this.out(`${cap(m.short)} is protected by the Dawn. You cannot attack them.`); return false; }
      if (this.room().flags.includes('safe')) { this.out('A holy peace fills this place. You cannot fight here.'); return false; }
      return true;
    }
    engage(m) {
      const p = this.player;
      if (!p.fighting) p.fighting = m.uid;
      p.position = 'fighting';
      m.fighting = true;
      m.aware = true;
    }

    doKill(args) {
      const p = this.player;
      if (!args) {
        const t = this.target();
        return this.out(t ? 'You do the best you can!' : 'Kill whom?');
      }
      const m = this.findMob(args);
      if (!this.canAttack(m)) return;
      if (p.fighting === m.uid) return this.out('You do the best you can!');
      if (p.fighting) { p.fighting = m.uid; this.out(`You turn to fight ${m.short}!`); this.engage(m); return; }
      this.engage(m);
      this.playerRound(m);
    }

    doConsider(args) {
      const m = this.findMob(args);
      if (!m) return this.out(args ? "They aren't here." : 'Consider killing whom?');
      const d = m.level - this.player.level;
      const msg = d <= -10 ? 'You can kill $N naked and weaponless.'
        : d <= -5 ? '$N is no match for you.'
          : d <= -2 ? '$N looks like an easy kill.'
            : d <= 1 ? 'The perfect match!'
              : d <= 4 ? "$N says 'Do you feel lucky, punk?'."
                : d <= 9 ? '$N laughs at you mercilessly.'
                  : 'Death will thank you for your gift.';
      const col = d <= -2 ? '{G}' : d <= 1 ? '{Y}' : d <= 4 ? '{y}' : '{R}';
      this.out(col + msg.replace('$N', cap(m.short)).replace(/^\w/, (c) => c.toUpperCase()) + '{x}' + (m.boss ? ' {M}(This foe is exceptionally tough.){x}' : ''));
    }

    doFlee() {
      const p = this.player;
      if (!p.fighting && !this.room().mobs.some((m) => m.fighting)) return this.out("You aren't fighting anyone.");
      const exits = DIR_ORDER.filter((d) => { const ex = this.room().exits[d]; return ex && !(ex.door && ex.door.closed); });
      if (!exits.length || !chance(55 + bonus(this.stat('dex')) * 5 + (p.cls === 'thief' ? 15 : 0))) {
        this.out('{R}PANIC! You couldn\'t escape!{x}');
        this.lag(1000);
        return;
      }
      const dir = exits[rand(0, exits.length - 1)];
      const loss = Math.min(p.xp, 5 * p.level);
      p.xp -= loss;
      this.out(`{Y}You flee head over heels ${DIRS[dir].name}!{x}${loss ? ` {D}You lose ${loss} experience.{x}` : ''}`);
      this.move(dir, true);
    }

    playerRound(t) {
      const p = this.player;
      this.oneHit(t);
      if (t.hp <= 0) return;
      const sa = this.skill('second attack');
      if (sa && chance(sa * 0.8)) { this.oneHit(t); this.improve('second attack'); }
      if (t.hp <= 0) return;
      const ta = this.skill('third attack');
      if (ta && chance(ta * 0.55)) { this.oneHit(t); this.improve('third attack'); }
      if (p.level >= 10 && p.cls === 'warrior' && t.hp > 0 && chance(20)) this.oneHit(t);
    }

    weaponDamage() {
      const p = this.player, w = p.equipment.wield;
      let d = w ? dice(w.dice[0], w.dice[1]) : rand(1, p.cls === 'warrior' ? 4 : 3);
      d += this.damroll() + Math.floor(p.level / 2);
      const ed = this.skill('enhanced damage');
      if (ed && chance(ed)) { d += Math.floor((d * ed) / 150); this.improve('enhanced damage'); }
      return Math.max(1, d);
    }

    oneHit(t) {
      const p = this.player, w = p.equipment.wield;
      const noun = w ? w.noun || 'hit' : 'punch';
      const hitChance = clamp(76 + (p.level - t.level) * 4 + this.hitroll() * 3, 10, 97);
      if (!chance(hitChance)) {
        this.out(`{D}Your ${noun} misses ${t.short}.{x}`);
        this.emit('combat', { src: 'player', dst: t.uid, dam: 0 });
        return;
      }
      const dam = this.weaponDamage();
      this.damageMob(t, dam, noun);
    }

    damageMob(t, dam, noun) {
      const [, , verb3] = damVerb(dam, t.maxHp);
      const col = dam >= t.maxHp * 0.4 ? '{Y}' : '{G}';
      this.out(`Your ${noun} ${col}${verb3}{x} ${t.short}! {D}(${dam}){x}`);
      t.hp -= dam;
      this.emit('combat', { src: 'player', dst: t.uid, dam });
      if (t.hp <= 0) this.mobDies(t);
    }

    mobRound(m) {
      const p = this.player;
      if (m.stunUntil > this.clock) { this.out(`{D}${cap(m.short)} is still dazed.{x}`); return; }
      if (m.flags.includes('caster') && m.spells.length && chance(30) && this.mobCast(m)) return;
      const attacks = 1 + (m.level >= 10 && chance(40) ? 1 : 0) + (m.boss && m.level >= 14 && chance(35) ? 1 : 0);
      for (let i = 0; i < attacks && p.hp > 0 && p.room === m.room && p.position !== 'dead'; i++) this.mobHit(m);
    }

    mobHit(m) {
      const p = this.player;
      if (p.room !== m.room || !m.fighting) return;
      const hc = clamp(62 + (m.level - p.level) * 4 + m.hitroll - this.armor() * 0.8, 8, 95);
      if (!chance(hc)) {
        this.out(`{D}${cap(m.short)}'s ${m.hit} misses you.{x}`);
        this.emit('combat', { src: m.uid, dst: 'player', dam: 0 });
        return;
      }
      if (p.equipment.wield && this.skill('parry') && chance(this.skill('parry') / 3)) {
        this.out(`{c}You parry ${m.short}'s attack.{x}`);
        this.improve('parry');
        this.emit('combat', { src: m.uid, dst: 'player', dam: 0, parry: true });
        return;
      }
      if (this.skill('dodge') && chance(this.skill('dodge') / 3 + bonus(this.stat('dex')) * 2)) {
        this.out(`{c}You dodge ${m.short}'s attack.{x}`);
        this.improve('dodge');
        this.emit('combat', { src: m.uid, dst: 'player', dam: 0, dodge: true });
        return;
      }
      this.damagePlayer(rand(m.dmin, m.dmax), m, m.hit);
    }

    damagePlayer(dam, m, noun) {
      const p = this.player;
      if (this.hasAffect('sanctuary')) dam = Math.floor(dam / 2);
      dam = Math.max(1, dam);
      const [, , verb3] = damVerb(dam, this.maxHp());
      const col = dam >= this.maxHp() * 0.25 ? '{R}' : '{r}';
      this.out(`${cap(m.short)}'s ${noun} ${col}${verb3}{x} you! {D}(${dam}){x}`);
      p.hp -= dam;
      if (p.position === 'sleeping' || p.position === 'resting') { p.position = 'fighting'; this.out('You scramble to your feet!'); }
      this.emit('combat', { src: m.uid, dst: 'player', dam });
      if (p.hp <= 0) this.playerDies(m);
    }

    mobCast(m) {
      const p = this.player;
      const heal = m.spells.includes('cure light') && m.hp < m.maxHp * 0.5;
      const pool = m.spells.filter((s) => this.D.spells[s].kind === 'attack');
      const sp = heal ? 'cure light' : pool[rand(0, pool.length - 1)];
      if (!sp) return false;
      this.out(`{M}${cap(m.short)} utters the words, '${garble(sp)}'.{x}`);
      if (heal) {
        const g = dice(2, 8) + m.level;
        m.hp = Math.min(m.maxHp, m.hp + g);
        this.out(`${cap(m.short)} looks better.`);
        this.emit('heal', { target: m.uid, amount: g });
        return true;
      }
      const dam = Math.floor(this.spellDamage(sp, m.level) * 0.75);
      this.emit('spell', { src: m.uid, dst: 'player', name: sp });
      this.damagePlayer(dam, m, this.D.spells[sp].noun);
      return true;
    }

    violencePulse() {
      const p = this.player;
      if (!p || p.position === 'dead') return;
      const room = this.room();
      const attackers = room.mobs.filter((m) => m.fighting && m.hp > 0);
      let t = this.target();
      if (!t && attackers.length) { t = attackers[0]; p.fighting = t.uid; p.position = 'fighting'; }
      if (!t && !attackers.length) {
        if (p.position === 'fighting') p.position = 'standing';
        p.fighting = null;
        return;
      }
      if (p.position === 'fighting' && t) this.playerRound(t);
      for (const m of room.mobs.slice()) {
        if (!m.fighting || m.hp <= 0 || p.position === 'dead' || p.room !== room.id) continue;
        this.mobRound(m);
      }
      if (p.position !== 'dead' && p.fighting && p.wimpy && p.hp > 0 && p.hp < p.wimpy) {
        this.out('{Y}You wimp out and attempt to flee!{x}');
        this.doFlee();
      }
      if (p.position !== 'dead') this.prompt();
      this.emit('update');
    }

    mobDies(m) {
      const p = this.player, room = this.rooms[m.room];
      this.out(`{R}${cap(m.short)} is DEAD!!{x}`);
      this.emit('mobdeath', { uid: m.uid });
      room.mobs.splice(room.mobs.indexOf(m), 1);
      if (m.reset) m.reset.inst = null;
      m.fighting = false;
      if (p.fighting === m.uid) p.fighting = null;
      p.kills++;
      // experience
      const L = m.level;
      let xp = (20 * L + 10 * L * L) * clamp(1 + (L - p.level) * 0.15, 0.05, 2) * (m.boss ? 1.5 : 1);
      xp = Math.round(xp * (this.D.races[p.race].xpBonus || 1));
      if (p.level < MAX_LEVEL) {
        this.out(`You receive {W}${xp}{x} experience points.`);
        this.gainXp(xp);
      }
      // corpse
      const corpse = {
        uid: this.uidSeq++, vnum: 'corpse', kind: 'item', type: 'container', noTake: true, icon: '⚰️',
        name: `corpse ${m.name}`, short: `the corpse of ${m.short}`, long: `The corpse of ${m.short} is lying here.`,
        contents: [], gold: m.gold, timer: 5,
      };
      for (const [v, c] of m.loot) if (Math.random() < c) corpse.contents.push(this.createItem(v));
      room.items.push(corpse);
      if (p.autogold && corpse.gold) this.takeGold(corpse);
      if (p.autoloot && corpse.contents.length) this.getFrom(corpse, 'all');
      if (!room.mobs.some((x) => x.fighting)) { p.position = 'standing'; p.fighting = null; }
      else { const nt = room.mobs.find((x) => x.fighting); p.fighting = nt.uid; }
      if (m.vnum === 'm_lich') this.out('\n{M}As Malthazar crumbles to dust, a terrible weight lifts from the land.\nThe people of Havenbrook will sing of this day. You are a true hero!{x}\n');
    }

    gainXp(xp) {
      const p = this.player;
      p.xp += xp;
      while (p.level < MAX_LEVEL && p.xp >= xpNext(p.level)) {
        p.xp -= xpNext(p.level);
        this.levelUp();
      }
      if (p.level >= MAX_LEVEL) p.xp = 0;
    }

    levelUp() {
      const p = this.player, C = this.D.classes[p.cls];
      p.level++;
      const hp = Math.max(2, rand(Math.ceil(C.hpDie / 2), C.hpDie) + bonus(this.stat('con')));
      const mana = C.manaDie ? Math.max(1, rand(Math.ceil(C.manaDie / 2), C.manaDie) + bonus(this.stat(C.prime))) : 0;
      const mv = rand(2, 5) + Math.max(0, bonus(this.stat('dex')));
      const prac = 2 + (bonus(this.stat('wis')) > 0 ? 1 : 0);
      p.baseHp += hp; p.baseMana += mana; p.baseMv += mv; p.practices += prac;
      p.hp = this.maxHp(); p.mana = this.maxMana(); p.mv = this.maxMv();
      if (TITLES.includes(p.title)) p.title = TITLES[Math.min(TITLES.length - 1, Math.floor(p.level / 3))];
      this.out(`{Y}*** You raise a level!! You are now level ${p.level}! ***{x}\nYour gain is: {G}${hp}{x}/${this.maxHp()} hp, {C}${mana}{x}/${this.maxMana()} m, {Y}${mv}{x}/${this.maxMv()} mv, {W}${prac}{x}/${p.practices} prac.`);
      for (const [sk, lvl] of Object.entries(C.skills)) {
        if (lvl <= p.level && !p.skills[sk]) {
          p.skills[sk] = 40;
          this.out(`{W}You have learned ${sk}!{x}`);
        }
      }
      this.emit('levelup', { level: p.level });
    }

    playerDies(killer) {
      const p = this.player;
      this.out(`\n{R}You have been KILLED by ${killer.short}!!{x}\n`);
      p.position = 'dead';
      p.deaths++;
      this.emit('playerdeath', {});
      const loss = Math.min(p.xp, Math.floor(xpNext(p.level) * 0.1));
      const gold = Math.floor(p.gold / 2);
      p.xp -= loss;
      p.gold -= gold;
      for (const m of this.room().mobs) { m.fighting = false; m.aware = false; }
      p.fighting = null;
      p.affects = [];
      this.walkPath = [];
      this.queue = [];
      const from = p.room;
      p.room = 't_temple';
      p.hp = Math.max(1, Math.floor(this.maxHp() / 3));
      p.mana = Math.floor(this.maxMana() / 3);
      p.mv = Math.floor(this.maxMv() / 3);
      p.position = 'resting';
      this.out(`{W}Darkness... then warmth. You awaken on the temple floor, weak but alive.{x}\n{D}You lost ${loss} experience and ${gold} gold.{x}`);
      this.emit('move', { from, to: p.room, dir: null, teleport: true });
      this.doLook('');
      this.prompt();
    }

    /* ---------------------------------------------------------- skills */
    improve(sk) {
      const p = this.player;
      if (!p.skills[sk] || p.skills[sk] >= 95) return;
      if (chance(Math.max(3, 12 - p.skills[sk] / 10))) {
        p.skills[sk]++;
        this.out(`{W}You have become better at ${sk}!{x} {D}(${p.skills[sk]}%){x}`);
      }
    }

    skillTarget(args, verb) {
      const p = this.player;
      const t = args ? this.findMob(args) : this.target();
      if (!t) { this.out(args ? "They aren't here." : `${cap(verb)} whom?`); return null; }
      if (!this.canAttack(t)) return null;
      return t;
    }
    payMv(sk) {
      const cost = this.D.spells[sk].mv || 0;
      if (this.player.mv < cost) { this.out('You are too tired.'); return false; }
      this.player.mv -= cost;
      return true;
    }

    doKick(args) {
      if (!this.skill('kick')) return this.out("You'd better leave the martial arts to fighters.");
      const t = this.skillTarget(args, 'kick');
      if (!t || !this.payMv('kick')) return;
      this.engage(t);
      this.lag(2000);
      if (chance(this.skill('kick') + (this.player.level - t.level) * 2)) {
        this.damageMob(t, rand(2, 4 + this.player.level * 2) + Math.max(0, bonus(this.stat('str'))), 'kick');
        this.improve('kick');
      } else {
        this.out(`{D}Your kick misses ${t.short}.{x}`);
        this.emit('combat', { src: 'player', dst: t.uid, dam: 0 });
      }
    }

    doBash(args) {
      if (!this.skill('bash')) return this.out("You'd better leave the martial arts to fighters.");
      const t = this.skillTarget(args, 'bash');
      if (!t || !this.payMv('bash')) return;
      this.engage(t);
      const pct = this.skill('bash') * 0.85 + (this.player.level - t.level) * 3 + (this.player.equipment.shield ? 10 : 0);
      if (chance(pct)) {
        this.out(`{G}You slam into ${t.short}, sending them sprawling!{x}`);
        t.stunUntil = this.clock + 4000;
        this.damageMob(t, rand(3, 6 + Math.floor(this.player.level * 1.5)), 'bash');
        this.improve('bash');
        this.lag(3000);
      } else {
        this.out('{r}You fall flat on your face!{x}');
        this.lag(4000);
      }
    }

    doBackstab(args) {
      const p = this.player;
      if (!this.skill('backstab')) return this.out("You don't know how to backstab.");
      if (!args) return this.out('Backstab whom?');
      const t = this.findMob(args);
      if (!this.canAttack(t)) return;
      if (!p.equipment.wield) return this.out('You need to wield a weapon to backstab.');
      if (t.fighting || p.fighting) return this.out("You can't backstab someone who is fighting — they're watching you!");
      if (!this.payMv('backstab')) return;
      this.engage(t);
      this.lag(2500);
      if (chance(this.skill('backstab') + (p.level - t.level) * 3 + (t.aware ? 0 : 15))) {
        const mult = 2 + Math.floor(p.level / 5);
        this.out('{Y}You slip into the shadows and strike!{x}');
        this.damageMob(t, this.weaponDamage() * mult, 'backstab');
        this.improve('backstab');
      } else {
        this.out(`{D}${cap(t.short)} notices you at the last moment!{x}`);
        this.emit('combat', { src: 'player', dst: t.uid, dam: 0 });
      }
    }

    doSneak() {
      if (!this.skill('sneak')) return this.out("You don't know how to sneak.");
      const p = this.player;
      if (!this.payMv('sneak')) return;
      p.affects = p.affects.filter((a) => a.name !== 'sneak');
      this.out('You attempt to move silently.');
      p.affects.push({ name: 'sneak', dur: 8 + Math.floor(p.level / 2), mods: {} });
      this.improve('sneak');
    }

    /* ---------------------------------------------------------- magic */
    spellDamage(sp, lvl) {
      switch (sp) {
        case 'magic missile': { let d = 0; for (let i = 0; i < Math.min(5, 1 + Math.floor(lvl / 3)); i++) d += dice(1, 4) + 1; return d; }
        case 'chill touch': return dice(1, 8) + lvl + 3;
        case 'burning hands': return dice(2, 6) + lvl + 5;
        case 'shocking grasp': return dice(3, 6) + lvl + 8;
        case 'lightning bolt': return dice(4, 6) + Math.floor(lvl * 1.3) + 10;
        case 'fireball': return dice(6, 8) + Math.floor(lvl * 1.5) + 12;
        case 'cause light': return dice(1, 8) + Math.floor(lvl / 2) + 3;
        case 'cause serious': return dice(2, 8) + lvl + 3;
        case 'harm': return dice(5, 8) + Math.floor(lvl * 1.5) + 10;
        default: return dice(1, 6);
      }
    }

    doCast(args) {
      const p = this.player;
      if (!args) return this.out('Cast which what where?');
      let spell = null, rest = '';
      const q = args.match(/^['"]([^'"]+)['"]?\s*(.*)$/);
      const known = Object.keys(p.skills).filter((s) => this.D.spells[s].mana);
      if (q) {
        spell = known.find((s) => s.startsWith(q[1].toLowerCase()));
        rest = q[2];
      } else {
        const words = args.toLowerCase().split(/\s+/);
        for (let k = words.length; k >= 1 && !spell; k--) {
          const cand = words.slice(0, k).join(' ');
          spell = known.find((s) => s.startsWith(cand));
          if (spell) rest = words.slice(k).join(' ');
        }
      }
      if (!spell) return this.out("You don't know any spells of that name.");
      const S = this.D.spells[spell];
      if (p.mana < S.mana) return this.out("You don't have enough mana.");
      let t = null;
      if (S.kind === 'attack') {
        t = rest ? this.findMob(rest) : this.target();
        if (!t) return this.out(rest ? "They aren't here." : 'Cast the spell on whom?');
        if (!this.canAttack(t)) return;
      }
      this.lag(1500);
      this.out(`{M}You utter the words, '${garble(spell)}'.{x}`);
      if (!chance(this.skill(spell) + 25)) {
        p.mana -= Math.floor(S.mana / 2);
        this.out('{D}You lost your concentration.{x}');
        return;
      }
      p.mana -= S.mana;
      this.improve(spell);
      const lvl = p.level + (p.cls === 'mage' ? bonus(this.stat('int')) : bonus(this.stat('wis')));
      if (S.kind === 'attack') {
        this.engage(t);
        this.emit('spell', { src: 'player', dst: t.uid, name: spell });
        return this.damageMob(t, this.spellDamage(spell, lvl), S.noun === 'spell' ? spell : S.noun);
      }
      this.emit('spell', { src: 'player', dst: 'player', name: spell });
      const heal = (n) => {
        const g = Math.min(n, this.maxHp() - p.hp);
        p.hp += g;
        this.emit('heal', { target: 'player', amount: g });
        return g;
      };
      switch (spell) {
        case 'cure light': this.out(`{G}You feel better! (+${heal(dice(1, 8) + Math.floor(lvl / 3) + 5)}){x}`); break;
        case 'cure serious': this.out(`{G}You feel much better! (+${heal(dice(2, 8) + Math.floor(lvl / 2) + 8)}){x}`); break;
        case 'cure critical': this.out(`{G}You feel a lot better! (+${heal(dice(3, 8) + lvl + 12)}){x}`); break;
        case 'heal': this.out(`{G}A warm feeling fills your body. (+${heal(100)}){x}`); break;
        case 'refresh': { const g = Math.min(dice(3, 8) + lvl * 2, this.maxMv() - p.mv); p.mv += g; this.out(`{Y}You feel less tired. (+${g} mv){x}`); break; }
        case 'armor': this.addAffect('armor', 12, { armor: 15 }, 'You feel someone protecting you.'); break;
        case 'bless': this.addAffect('bless', 10, { hit: 2 + Math.floor(lvl / 6) }, 'You feel righteous.'); break;
        case 'sanctuary': this.addAffect('sanctuary', 6, {}, '{W}You are surrounded by a white aura.{x}'); break;
      }
    }

    addAffect(name, dur, mods, msg) {
      const p = this.player;
      p.affects = p.affects.filter((a) => a.name !== name);
      p.affects.push({ name, dur, mods });
      this.out(msg);
    }

    /* ---------------------------------------------------------- pulses */
    aggroPulse() {
      const p = this.player, room = this.room();
      if (p.position === 'dead' || room.flags.includes('safe')) return;
      for (const m of room.mobs) {
        if (!m.flags.includes('aggressive') || m.fighting || m.hp <= 0 || !m.aware) continue;
        if (m.stunUntil > this.clock) continue;
        if (p.level > m.level + 8 && chance(80)) { m.aware = false; continue; }
        this.out(`{R}${cap(m.short)} attacks you!{x}`);
        m.fighting = true;
        this.walkPath = [];
        if (!p.fighting) p.fighting = m.uid;
        if (p.position !== 'fighting') {
          if (p.position !== 'standing') this.out('You scramble to your feet!');
          p.position = 'fighting';
        }
        this.emit('aggro', { uid: m.uid });
        this.prompt();
        this.emit('update');
      }
    }

    mobilePulse() {
      const p = this.player;
      let changed = false;
      for (const room of Object.values(this.rooms)) {
        for (const m of room.mobs.slice()) {
          if (m.fighting || m.flags.includes('sentinel') || !chance(25)) continue;
          const dirs = DIR_ORDER.filter((d) => {
            const ex = room.exits[d];
            if (!ex || (ex.door && ex.door.closed)) return false;
            const to = this.rooms[ex.to];
            return to.area === room.area && !to.flags.includes('safe');
          });
          if (!dirs.length) continue;
          const d = dirs[rand(0, dirs.length - 1)];
          const to = this.rooms[room.exits[d].to];
          room.mobs.splice(room.mobs.indexOf(m), 1);
          to.mobs.push(m);
          m.room = to.id;
          if (room.id === p.room) { this.out(`{D}${cap(m.short)} leaves ${DIRS[d].name}.{x}`); this.emit('leave', { uid: m.uid, dir: d }); changed = true; }
          if (to.id === p.room) {
            m.aware = !this.sneakCheck();
            this.out(`{Y}${cap(m.short)} arrives from ${DIRS[DIRS[d].rev].from}.{x}`);
            this.emit('arrive', { uid: m.uid, dir: DIRS[d].rev });
            changed = true;
          }
        }
      }
      if (changed) { this.prompt(); this.emit('update'); }
    }

    tickPulse() {
      const p = this.player, room = this.room();
      this.ticks++;
      // time of day
      this.time.hour = (this.time.hour + 1) % 24;
      if (this.time.hour === 0) this.time.day++;
      if (OUTDOORS[room.sector]) {
        const msg = { 5: 'The day has begun.', 6: '{Y}The sun rises in the east.{x}', 19: '{y}The sun slowly disappears in the west.{x}', 20: '{b}The night has begun.{x}' }[this.time.hour];
        if (msg) this.out(msg);
      }
      // regeneration
      if (p.position !== 'fighting' && p.position !== 'dead') {
        const mult = ({ sleeping: 3, resting: 2 }[p.position] || 1) * (room.flags.includes('restful') ? 2 : 1);
        const C = this.D.classes[p.cls];
        p.hp = Math.min(this.maxHp(), p.hp + Math.max(1, Math.floor((this.maxHp() * 0.08 + p.level * 0.5 + bonus(this.stat('con'))) * mult)));
        if (this.maxMana()) p.mana = Math.min(this.maxMana(), p.mana + Math.max(1, Math.floor((this.maxMana() * 0.08 + p.level * 0.5 + bonus(this.stat(C.prime))) * mult)));
        p.mv = Math.min(this.maxMv(), p.mv + Math.max(1, Math.floor(this.maxMv() * 0.1 * mult)));
      }
      // affects
      for (const a of p.affects) a.dur--;
      for (const a of p.affects.filter((x) => x.dur <= 0)) {
        this.out({ armor: 'You feel less protected.', bless: 'You feel less righteous.', sanctuary: '{W}The white aura around your body fades.{x}', sneak: 'You no longer feel stealthy.' }[a.name] || `${a.name} wears off.`);
      }
      p.affects = p.affects.filter((x) => x.dur > 0);
      // mobs heal, corpses decay
      for (const r of Object.values(this.rooms)) {
        for (const m of r.mobs) if (!m.fighting) m.hp = Math.min(m.maxHp, m.hp + Math.ceil(m.maxHp * 0.1));
        for (const it of r.items.slice()) {
          if (it.timer === undefined) continue;
          if (--it.timer <= 0) {
            r.items.splice(r.items.indexOf(it), 1);
            if (r.id === p.room) this.out(`{D}${cap(it.short)} decays into dust.{x}`);
          }
        }
      }
      if (this.ticks % RESET_TICKS === 0) this.resetWorld();
      this.emit('tick');
      this.emit('save');
      this.emit('update');
    }

    /* ---------------------------------------------------------- persistence */
    serialize() {
      const p = this.player;
      const it = (i) => i.vnum;
      const eq = {};
      for (const [s, i] of Object.entries(p.equipment)) if (i) eq[s] = i.vnum;
      const { inventory, equipment, explored, fighting, ...rest } = p;
      return JSON.stringify({
        v: 1, time: this.time,
        p: { ...rest, position: p.position === 'fighting' || p.position === 'dead' ? 'standing' : p.position, inventory: inventory.filter((i) => this.D.items[i.vnum]).map(it), equipment: eq, explored: [...explored] },
      });
    }

    load(json) {
      const s = typeof json === 'string' ? JSON.parse(json) : json;
      if (!s || s.v !== 1) throw new Error('Unknown save version');
      const d = s.p;
      const p = { ...d, fighting: null, inventory: [], equipment: {}, explored: new Set(d.explored || []) };
      if (!this.rooms[p.room]) p.room = 't_temple';
      for (const v of d.inventory || []) if (this.D.items[v]) p.inventory.push(this.createItem(v));
      for (const [slot, v] of Object.entries(d.equipment || {})) if (this.D.items[v]) p.equipment[slot] = this.createItem(v);
      this.player = p;
      this.time = s.time || this.time;
      this.clampVitals();
      this.enterWorld(false);
      return p;
    }
  }

  /* ======================================================================
   * Command table — order matters for abbreviations (first match wins).
   * pos: minimum position required.
   * ==================================================================== */
  const COMMANDS = [
    { name: 'north', alias: ['n'], fn: 'doMove', pos: 'standing' },
    { name: 'east', alias: ['e'], fn: 'doMove', pos: 'standing' },
    { name: 'south', alias: ['s'], fn: 'doMove', pos: 'standing' },
    { name: 'west', alias: ['w'], fn: 'doMove', pos: 'standing' },
    { name: 'up', alias: ['u'], fn: 'doMove', pos: 'standing' },
    { name: 'down', alias: ['d'], fn: 'doMove', pos: 'standing' },
    { name: 'look', alias: ['l'], fn: 'doLook', pos: 'resting' },
    { name: 'kill', alias: ['k', 'attack', 'hit', 'murder'], fn: 'doKill', pos: 'fighting' },
    { name: 'cast', alias: ['c'], fn: 'doCast', pos: 'fighting' },
    { name: 'get', alias: ['take', 'loot'], fn: 'doGet', pos: 'resting' },
    { name: 'inventory', alias: ['i', 'inv'], fn: 'doInventory', pos: 'dead' },
    { name: 'equipment', alias: ['eq'], fn: 'doEquipment', pos: 'dead' },
    { name: 'exits', alias: ['ex'], fn: 'doExits', pos: 'resting' },
    { name: 'examine', alias: ['exa'], fn: 'doLook', pos: 'resting' },
    { name: 'score', alias: ['sc'], fn: 'doScore', pos: 'dead' },
    { name: 'consider', alias: ['con'], fn: 'doConsider', pos: 'resting' },
    { name: 'flee', fn: 'doFlee', pos: 'fighting' },
    { name: 'kick', fn: 'doKick', pos: 'fighting' },
    { name: 'bash', fn: 'doBash', pos: 'fighting' },
    { name: 'backstab', alias: ['bs'], fn: 'doBackstab', pos: 'standing' },
    { name: 'sneak', fn: 'doSneak', pos: 'standing' },
    { name: 'rest', alias: ['sit'], fn: 'doRest', pos: 'sleeping' },
    { name: 'sleep', fn: 'doSleep', pos: 'sleeping' },
    { name: 'stand', alias: ['wake'], fn: 'doStand', pos: 'sleeping' },
    { name: 'drop', fn: 'doDrop', pos: 'resting' },
    { name: 'wear', fn: 'doWear', pos: 'resting' },
    { name: 'wield', alias: ['hold'], fn: 'doWear', pos: 'resting' },
    { name: 'remove', alias: ['rem'], fn: 'doRemove', pos: 'resting' },
    { name: 'quaff', alias: ['drink', 'eat'], fn: 'doQuaff', pos: 'resting' },
    { name: 'recall', alias: ['/'], fn: 'doRecall', pos: 'fighting' },
    { name: 'list', fn: 'doList', pos: 'resting' },
    { name: 'buy', fn: 'doBuy', pos: 'resting' },
    { name: 'sell', fn: 'doSell', pos: 'resting' },
    { name: 'value', fn: 'doValue', pos: 'resting' },
    { name: 'open', fn: 'doOpen', pos: 'resting' },
    { name: 'close', fn: 'doClose', pos: 'resting' },
    { name: 'unlock', fn: 'doUnlock', pos: 'resting' },
    { name: 'lock', fn: 'doLock', pos: 'resting' },
    { name: 'say', fn: 'doSay', pos: 'resting' },
    { name: 'emote', alias: ['me', ':'], fn: 'doEmote', pos: 'resting' },
    { name: 'talk', alias: ['ask', 'greet'], fn: 'doTalk', pos: 'resting' },
    { name: 'scan', fn: 'doScan', pos: 'resting' },
    { name: 'where', fn: 'doWhere', pos: 'resting' },
    { name: 'map', fn: 'doMap', pos: 'resting' },
    { name: 'time', fn: 'doTime', pos: 'dead' },
    { name: 'who', fn: 'doWho', pos: 'dead' },
    { name: 'title', fn: 'doTitle', pos: 'dead' },
    { name: 'affects', alias: ['aff'], fn: 'doAffects', pos: 'dead' },
    { name: 'skills', alias: ['spells', 'abilities'], fn: 'doSkills', pos: 'dead' },
    { name: 'practice', alias: ['prac'], fn: 'doPractice', pos: 'resting' },
    { name: 'levels', fn: 'doLevels', pos: 'dead' },
    { name: 'wimpy', fn: 'doWimpy', pos: 'dead' },
    { name: 'autoloot', fn: 'doAutoloot', pos: 'dead' },
    { name: 'autogold', fn: 'doAutogold', pos: 'dead' },
    { name: 'help', alias: ['?', 'commands'], fn: 'doHelp', pos: 'dead' },
    { name: 'save', fn: 'doSave', pos: 'dead' },
    { name: 'restart', fn: 'doRestart', pos: 'dead', exact: true, noPrompt: true },
  ];

  MUD.Game = Game;
  MUD.util = { DIRS, DIR_ORDER, SLOTS, SLOT_LABEL, condition, garble, xpNext, clean, bonus, PULSE, COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
