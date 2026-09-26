/* ==========================================================================
 * RPG MUD — user interface
 * Wires the engine to the DOM: terminal, command line, action bar, side
 * panels, context menus, character creation and persistence.
 * ========================================================================== */
(function () {
  'use strict';
  const { Game, DATA, util } = window.MUD;
  const $ = (s) => document.querySelector(s);
  const SAVE_KEY = 'havenbrook.save.v1';
  const HIST_KEY = 'havenbrook.history.v1';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  const game = new Game();
  window.game = game; // handy for tinkering from the console
  const scene = new window.MUD.Scene($('#scene'), game);
  const minimap = new window.MUD.Minimap($('#minimap'), game);

  const ui = { selected: null, dirty: true, lastPanel: 0, tab: 'pack', history: [], histIdx: -1, tabState: null };
  try { ui.history = JSON.parse(store.get(HIST_KEY) || '[]'); } catch (e) { ui.history = []; }

  /* ================================================================ text */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function markup(text) {
    let s = esc(text);
    s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_, cmd, label) => `<a class="cmd" data-cmd="${cmd}">${label}</a>`);
    let open = false;
    s = s.replace(/\{([rgybmcwDRGYBMCWx])\}/g, (_, c) => {
      const close = open ? '</span>' : '';
      if (c === 'x') { open = false; return close; }
      open = true;
      return `${close}<span class="c-${c}">`;
    });
    return open ? s + '</span>' : s;
  }

  /* ================================================================ terminal */
  const term = $('#terminal');
  const newMsgs = $('#new-msgs');
  function atBottom() { return term.scrollHeight - term.scrollTop - term.clientHeight < 48; }
  function print(text, kind) {
    const stick = atBottom();
    const last = term.lastElementChild;
    if (kind === 'prompt' && last && last.classList.contains('prompt')) {
      last.innerHTML = markup(text);
    } else {
      for (const line of String(text).split('\n')) {
        const div = document.createElement('div');
        div.className = `ln ${kind || ''}`;
        div.innerHTML = markup(line) || '&nbsp;';
        term.appendChild(div);
      }
      while (term.childElementCount > 900) term.removeChild(term.firstElementChild);
    }
    if (stick) term.scrollTop = term.scrollHeight;
    else if (kind !== 'prompt') newMsgs.hidden = false;
  }
  term.addEventListener('scroll', () => { if (atBottom()) newMsgs.hidden = true; });
  newMsgs.addEventListener('click', () => { term.scrollTop = term.scrollHeight; newMsgs.hidden = true; });
  term.addEventListener('click', (e) => {
    const a = e.target.closest('a.cmd');
    if (a) { send(a.dataset.cmd); return; }
    if (!window.getSelection().toString()) $('#cmd').focus({ preventScroll: true });
  });

  game.on('output', (o) => print(o.text, o.kind));
  game.on('update', () => { ui.dirty = true; });
  game.on('save', () => save());
  game.on('focus', (e) => { ui.selected = e.uid; });
  game.on('levelup', (e) => toast(`Level ${e.level}!`));
  game.on('playerdeath', () => toast('You have died'));
  game.on('move', () => { ui.dirty = true; hideMenu(); });
  game.on('mobdeath', (e) => { if (ui.selected === e.uid) ui.selected = null; });
  game.on('restart', () => {
    if (confirm('Abandon this character and create a new one? Your saved progress will be deleted.')) {
      store.del(SAVE_KEY);
      window.removeEventListener('beforeunload', save);
      location.reload();
    }
  });

  function save() { if (game.player) store.set(SAVE_KEY, game.serialize()); }
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  function send(cmd) {
    if (!game.player) return;
    hideMenu();
    game.command(cmd);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  /* ================================================================ command line */
  const input = $('#cmd');
  $('#cmdform').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    ui.histIdx = -1;
    ui.tabState = null;
    if (v.trim() && ui.history[ui.history.length - 1] !== v) {
      ui.history.push(v);
      if (ui.history.length > 100) ui.history.shift();
      store.set(HIST_KEY, JSON.stringify(ui.history));
    }
    send(v);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!ui.history.length) return;
      if (e.key === 'ArrowUp') ui.histIdx = ui.histIdx < 0 ? ui.history.length - 1 : Math.max(0, ui.histIdx - 1);
      else ui.histIdx = ui.histIdx < 0 ? -1 : ui.histIdx + 1;
      if (ui.histIdx >= ui.history.length) ui.histIdx = -1;
      input.value = ui.histIdx < 0 ? '' : ui.history[ui.histIdx];
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'Escape') {
      input.value = '';
      ui.tabState = null;
      hideMenu();
    } else {
      ui.tabState = null;
    }
  });

  function completionWords(first) {
    const p = game.player, room = game.room();
    if (/^c(a|as|ast)?$/.test(first)) return Object.keys(p.skills).filter((s) => DATA.spells[s].mana).map((s) => `'${s}'`);
    const words = new Set();
    const add = (e) => e.name.split(' ').forEach((w) => words.add(w));
    room.mobs.forEach(add);
    room.items.forEach(add);
    p.inventory.forEach(add);
    Object.values(p.equipment).forEach((i) => i && add(i));
    Object.values(util.DIRS).forEach((d) => words.add(d.name));
    ['all', 'corpse'].forEach((w) => words.add(w));
    return [...words];
  }

  function complete() {
    if (!game.player) return;
    if (!ui.tabState) {
      const v = input.value;
      const parts = v.split(' ');
      const partial = parts.pop().toLowerCase();
      const first = parts.length ? parts[0].toLowerCase() : null;
      const pool = first === null
        ? util.COMMANDS.map((c) => c.name)
        : completionWords(first);
      const matches = pool.filter((w) => w.toLowerCase().startsWith(partial)).sort();
      if (!matches.length) return;
      ui.tabState = { prefix: parts.length ? parts.join(' ') + ' ' : '', matches, idx: -1 };
    }
    const st = ui.tabState;
    st.idx = (st.idx + 1) % st.matches.length;
    input.value = st.prefix + st.matches[st.idx] + (st.matches.length === 1 ? ' ' : '');
  }

  /* ================================================================ keyboard */
  const NUMPAD = { Numpad8: 'n', Numpad2: 's', Numpad4: 'w', Numpad6: 'e', Numpad9: 'u', Numpad3: 'd', Numpad5: 'look' };
  document.addEventListener('keydown', (e) => {
    if (!game.player || !$('#creator').hidden) return;
    if (NUMPAD[e.code] && (document.activeElement !== input || !input.value)) {
      e.preventDefault();
      send(NUMPAD[e.code]);
      return;
    }
    if (e.key === 'F1') { e.preventDefault(); send('help'); return; }
    if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      const btn = $('#hotbar').children[+e.code.slice(5) - 1];
      if (btn) btn.click();
      return;
    }
    if (e.key === 'Escape') hideMenu();
    const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) input.focus();
  });

  /* ================================================================ targeting helpers */
  function mobRef(m) {
    const room = game.room();
    const kw = m.name.split(' ')[0];
    let n = 0;
    for (const x of room.mobs) {
      if (x.name.split(' ').some((w) => w.startsWith(kw))) n++;
      if (x === m) break;
    }
    return n > 1 ? `${n}.${kw}` : kw;
  }
  function itemRef(list, it) {
    const kw = it.name.split(' ')[0];
    let n = 0;
    for (const x of list) {
      if (x.name.split(' ').some((w) => w.startsWith(kw))) n++;
      if (x === it) break;
    }
    return n > 1 ? `${n}.${kw}` : kw;
  }
  function selectedMob() {
    const room = game.room();
    return game.target() || room.mobs.find((m) => m.uid === ui.selected) || null;
  }
  function autoTarget() {
    const room = game.room();
    return selectedMob()
      || room.mobs.find((m) => m.flags.includes('aggressive'))
      || room.mobs.find((m) => !m.flags.includes('peaceful'))
      || null;
  }

  function useSkill(sk) {
    const S = DATA.spells[sk];
    const p = game.player;
    if (S.kind === 'attack') {
      const t = game.target() || autoTarget();
      if (!t) return send(`cast '${sk}'`);
      return send(game.target() ? `cast '${sk}'` : `cast '${sk}' ${mobRef(t)}`);
    }
    if (S.kind === 'heal' || S.kind === 'buff') return send(`cast '${sk}'`);
    if (sk === 'sneak') return send('sneak');
    if (sk === 'backstab') {
      const t = autoTarget();
      return send(t ? `backstab ${mobRef(t)}` : 'backstab');
    }
    const t = game.target() || autoTarget();
    send(t && !p.fighting ? `${sk} ${mobRef(t)}` : sk);
  }

  /* ================================================================ context menu */
  const menu = $('#ctxmenu');
  function showMenu(x, y, title, actions) {
    menu.innerHTML = `<div class="hd">${markup(title)}</div>` + actions.map((a, i) => `<button data-i="${i}">${esc(a.label)}${a.hint ? `<small>${esc(a.hint)}</small>` : ''}</button>`).join('');
    menu.hidden = false;
    menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const a = actions[+b.dataset.i]; hideMenu(); a.fn ? a.fn() : send(a.cmd); }));
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  }
  function hideMenu() { menu.hidden = true; }
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-menu]') && e.target !== $('#scene')) hideMenu(); });

  function mobActions(m) {
    const ref = mobRef(m), p = game.player, room = game.room();
    const acts = [{ label: 'Look', cmd: `look ${ref}` }, { label: 'Consider', cmd: `consider ${ref}` }];
    if (m.talk.length) acts.push({ label: 'Talk', cmd: `talk ${ref}` });
    if (DATA.shops[room.id] && DATA.shops[room.id].keeper === m.vnum) acts.push({ label: 'List wares', cmd: 'list' });
    if (m.flags.includes('guildmaster')) acts.push({ label: 'Practice', cmd: 'practice' });
    if (!m.flags.includes('peaceful') && !room.flags.includes('safe')) {
      acts.push({ label: p.fighting === m.uid ? 'Keep fighting' : 'Attack', cmd: `kill ${ref}`, hint: 'k' });
      if (p.skills.backstab && !p.fighting && !m.fighting) acts.push({ label: 'Backstab', cmd: `backstab ${ref}`, hint: 'bs' });
      for (const sk of ['kick', 'bash']) if (p.skills[sk]) acts.push({ label: sk[0].toUpperCase() + sk.slice(1), cmd: `${sk} ${ref}` });
      const spells = Object.keys(p.skills).filter((s) => DATA.spells[s].kind === 'attack');
      for (const s of spells.slice(-2).reverse()) acts.push({ label: `Cast ${s}`, cmd: `cast '${s}' ${ref}`, hint: `${DATA.spells[s].mana}m` });
    }
    return acts;
  }
  function roomItemActions(it) {
    const room = game.room(), ref = itemRef(room.items, it);
    if (it.contents) return [{ label: 'Loot all', cmd: `get all ${ref}` }, { label: 'Look inside', cmd: `look in ${ref}` }];
    const acts = [{ label: 'Look', cmd: `look ${ref}` }];
    if (!it.noTake) acts.unshift({ label: 'Get', cmd: `get ${ref}` });
    return acts;
  }
  function invActions(it) {
    const p = game.player, ref = itemRef(p.inventory, it), acts = [];
    if (it.wear) acts.push({ label: it.wear === 'wield' ? 'Wield' : 'Wear', cmd: `wear ${ref}` });
    if (it.type === 'potion') acts.push({ label: it.food ? 'Eat' : it.drink ? 'Drink' : 'Quaff', cmd: `quaff ${ref}` });
    acts.push({ label: 'Look', cmd: `look ${ref}` });
    const shop = game.shop();
    if (shop && shop.buys.includes(it.type)) {
      acts.push({ label: 'Sell', cmd: `sell ${ref}`, hint: `${game.sellPrice(it)}g` });
    }
    acts.push({ label: 'Drop', cmd: `drop ${ref}` });
    return acts;
  }

  /* ================================================================ scene & map input */
  const sceneEl = $('#scene');
  const tip = $('#tooltip');
  function showTip(html, e) {
    tip.innerHTML = html;
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  }
  sceneEl.addEventListener('mousemove', (e) => {
    const b = scene.pick(e.clientX, e.clientY);
    scene.hover = b;
    sceneEl.style.cursor = b ? 'pointer' : 'default';
    if (b && b.ref) showTip(esc(b.ref.short || b.label) + (b.ref.level && b.type === 'mob' ? ` <small>lv ${b.ref.level}</small>` : ''), e);
    else tip.hidden = true;
  });
  sceneEl.addEventListener('mouseleave', () => { scene.hover = null; tip.hidden = true; });
  sceneEl.addEventListener('click', (e) => {
    if (!game.player) return;
    const b = scene.pick(e.clientX, e.clientY);
    tip.hidden = true;
    if (!b) { hideMenu(); return; }
    if (b.type === 'mob') { ui.selected = b.ref.uid; ui.dirty = true; showMenu(e.clientX, e.clientY, `{Y}${b.ref.short}{x}`, mobActions(b.ref)); }
    else if (b.type === 'item') showMenu(e.clientX, e.clientY, `{G}${b.ref.short}{x}`, roomItemActions(b.ref));
    else if (b.type === 'player') {
      const p = game.player;
      showMenu(e.clientX, e.clientY, `{Y}${p.name}{x}`, [
        { label: 'Score', cmd: 'score' },
        { label: 'Inventory', cmd: 'inventory' },
        p.position === 'standing' ? { label: 'Rest', cmd: 'rest' } : { label: 'Stand', cmd: 'stand' },
      ]);
    }
  });

  minimap.onHover = (r, e) => {
    if (!r) { tip.hidden = true; return; }
    const known = game.player.explored.has(r.id);
    showTip(known ? `${esc(r.name)}<br><small>${esc(DATA.areas[r.area].name)} · click to travel</small>` : '<small>Unexplored</small>', e);
  };
  minimap.onClick = (r) => {
    if (r.id === game.player.room) return;
    if (game.player.fighting) { print('{R}You cannot travel while fighting!{x}'); return; }
    if (game.player.position !== 'standing') send('stand');
    game.walkTo(r.id);
  };
  $('#zoom-in').addEventListener('click', () => minimap.zoom(1));
  $('#zoom-out').addEventListener('click', () => minimap.zoom(-1));

  /* ================================================================ action bar */
  $('#compass').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    send(b.dataset.cmd || b.dataset.dir);
  });
  $('#btn-help').addEventListener('click', () => send('help'));
  $('#btn-save').addEventListener('click', () => send('save'));

  function renderCompass() {
    const room = game.room();
    document.querySelectorAll('#compass [data-dir]').forEach((b) => {
      const ex = room.exits[b.dataset.dir];
      b.disabled = !ex;
      b.classList.toggle('closed', !!(ex && ex.door && ex.door.closed));
      b.title = ex ? `${util.DIRS[b.dataset.dir].name}${game.player.explored.has(ex.to) ? ' — ' + game.rooms[ex.to].name : ''}` : '';
    });
  }

  function chip(label, cmd, cls = '', extra = '') {
    return `<button class="chip ${cls}" data-cmd="${esc(cmd)}">${label}${extra}</button>`;
  }
  function renderQuick() {
    const p = game.player, room = game.room(), q = [];
    if (p.fighting || room.mobs.some((m) => m.fighting)) {
      q.push(chip('🏃 Flee', 'flee', 'danger'));
      const t = game.target();
      if (t) q.push(chip(`🎯 ${esc(t.short)}`, `consider ${mobRef(t)}`));
    } else {
      if (p.position === 'standing') { q.push(chip('🪑 Rest', 'rest')); q.push(chip('💤 Sleep', 'sleep')); }
      else q.push(chip('🧍 Stand', 'stand', 'accent'));
      const corpse = room.items.find((i) => i.contents && (i.contents.length || i.gold));
      if (corpse) q.push(chip('💰 Loot', `get all ${itemRef(room.items, corpse)}`, 'accent'));
      if (room.items.some((i) => !i.noTake)) q.push(chip('✋ Get all', 'get all'));
      const hostile = room.mobs.find((m) => !m.flags.includes('peaceful'));
      if (hostile && !room.flags.includes('safe')) q.push(chip(`⚔️ Attack ${esc(hostile.short.replace(/^(a|an|the) /i, ''))}`, `kill ${mobRef(hostile)}`, 'danger'));
      const talker = room.mobs.find((m) => m.talk.length);
      if (talker) q.push(chip(`💬 Talk`, `talk ${mobRef(talker)}`));
      if (game.shop()) q.push(chip('🪙 Wares', 'list', 'accent'));
      if (room.mobs.some((m) => m.flags.includes('guildmaster'))) q.push(chip('📜 Practice', 'practice', 'accent'));
      q.push(chip('🔭 Scan', 'scan'));
      if (!room.flags.includes('recall')) q.push(chip('✨ Recall', 'recall'));
    }
    $('#quick').innerHTML = q.join('');
  }
  $('#quick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.dataset.cmd); });

  function renderHotbar() {
    const p = game.player;
    const active = Object.keys(p.skills).filter((s) => DATA.spells[s].kind !== 'passive');
    const order = { skill: 0, attack: 1, heal: 2, buff: 3 };
    active.sort((a, b) => order[DATA.spells[a].kind] - order[DATA.spells[b].kind] || (DATA.spells[a].mana || 0) - (DATA.spells[b].mana || 0));
    const html = active.slice(0, 9).map((sk, i) => {
      const S = DATA.spells[sk];
      const cost = S.mana ? `<span class="cost">${S.mana}m</span>` : S.mv ? `<span class="cost mv">${S.mv}mv</span>` : '';
      const afford = S.mana ? p.mana >= S.mana : S.mv ? p.mv >= S.mv : true;
      const icon = { attack: '🔥', heal: '💚', buff: '🛡️', skill: '🥾' }[S.kind];
      const nice = { 'magic missile': '✴️', 'chill touch': '❄️', 'burning hands': '🔥', 'shocking grasp': '⚡', 'lightning bolt': '🌩️', fireball: '☄️', harm: '💀', 'cause light': '🩸', 'cause serious': '🩸', kick: '🦶', bash: '🛡️', backstab: '🗡️', sneak: '👣', sanctuary: '🕊️', bless: '🌟', armor: '🛡️', refresh: '🍃' }[sk] || icon;
      return `<button class="chip${S.kind === 'attack' || S.kind === 'skill' ? '' : ' accent'}" data-skill="${esc(sk)}" ${afford ? '' : 'disabled'} title="${esc(sk)} (Alt+${i + 1})"><span>${nice}</span>${esc(sk)}${cost}<span class="key">${i + 1}</span><i class="cd"></i></button>`;
    }).join('');
    $('#hotbar').innerHTML = html;
  }
  $('#hotbar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) useSkill(b.dataset.skill); });

  /* ================================================================ side panels */
  document.querySelectorAll('.tab-h button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tab-h button').forEach((x) => x.classList.toggle('active', x === b));
    ui.tab = b.dataset.tab;
    ui.dirty = true;
    renderPanels(true);
  }));

  function groupItems(list) {
    const groups = [];
    for (const it of list) {
      const g = groups.find((x) => x.it.vnum === it.vnum);
      if (g) g.n++; else groups.push({ it, n: 1 });
    }
    return groups;
  }
  function itemMeta(it) {
    if (it.type === 'weapon') return `${it.dice[0]}d${it.dice[1]}`;
    if (it.type === 'armor') return `ac ${it.armor}`;
    if (it.effect) return Object.entries(it.effect).map(([k, v]) => `+${v}${k}`).join(' ');
    if (it.type === 'treasure') return `${it.cost}g`;
    return it.type;
  }

  function renderPack() {
    const p = game.player;
    const groups = groupItems(p.inventory);
    const rows = groups.map((g, i) => `<button class="row" data-inv="${i}" data-menu><span class="ico">${g.it.icon || '📦'}</span><span class="nm">${esc(g.it.short)}</span>${g.n > 1 ? `<span class="qty">×${g.n}</span>` : ''}<span class="meta">${esc(itemMeta(g.it))}</span></button>`);
    return `<div class="gold-line"><span>Carrying ${p.inventory.length} item${p.inventory.length === 1 ? '' : 's'}</span><span>🪙 <b>${p.gold}</b> gold</span></div>
      <div class="list">${rows.join('') || '<div class="row empty">Your pack is empty.</div>'}</div>`;
  }
  function renderGear() {
    const p = game.player;
    const rows = util.SLOTS.map((s) => {
      const it = p.equipment[s];
      return it
        ? `<button class="row" data-slot="${s}" data-menu><span class="slot">${s}</span><span class="ico">${it.icon || '▫️'}</span><span class="nm">${esc(it.short)}</span><span class="meta">${esc(itemMeta(it))}</span></button>`
        : `<div class="row empty"><span class="slot">${s}</span><span class="ico">·</span><span class="nm">empty</span></div>`;
    });
    return `<div class="kv"><span>Armor</span><b>${game.armor()}</b><span>Hitroll</span><b>${game.hitroll()}</b><span>Damroll</span><b>${game.damroll()}</b></div><div class="list">${rows.join('')}</div>`;
  }
  function renderSkills() {
    const p = game.player, C = DATA.classes[p.cls];
    const inGuild = game.room().mobs.some((m) => m.flags.includes('guildmaster'));
    const rows = Object.entries(C.skills).sort((a, b) => a[1] - b[1]).map(([sk, lvl]) => {
      const pct = p.skills[sk], S = DATA.spells[sk];
      const cost = S.mana ? `${S.mana}m` : S.mv ? `${S.mv}mv` : 'passive';
      if (!pct) return `<div class="row empty"><span class="ico">🔒</span><span class="nm">${esc(sk)}</span><span class="meta">lv ${lvl}</span></div>`;
      return `<button class="row" data-skill="${esc(sk)}"><span class="ico">${S.kind === 'passive' ? '◈' : '✦'}</span><span class="nm">${esc(sk)}</span><span class="meta">${cost}</span><span class="skillbar"><i style="width:${pct}%"></i></span><span class="meta">${pct}%</span></button>`;
    });
    return `<div class="gold-line"><span>${inGuild ? 'Click a skill to practice it' : 'Practice at the Guildhall'}</span><span>Practices <b>${p.practices}</b></span></div><div class="list">${rows.join('')}</div>`;
  }
  function renderHero() {
    const p = game.player, R = DATA.races[p.race], C = DATA.classes[p.cls];
    const stat = (k) => { const v = game.stat(k), d = v - p.stats[k]; return `<div class="stat"><span>${k}</span><b>${v}</b>${d ? `<em>${d > 0 ? '+' : ''}${d}</em>` : ''}</div>`; };
    const aff = p.affects.map((a) => `<div class="row empty"><span class="ico">✨</span><span class="nm">${esc(a.name)}</span><span class="meta">${a.dur}h</span></div>`).join('');
    return `<div class="section-title">${esc(p.name)} ${esc(p.title)} — ${R.name} ${C.name}</div>
      <div class="statgrid">${['str', 'int', 'wis', 'dex', 'con'].map(stat).join('')}</div>
      <div class="kv">
        <span>Level</span><b>${p.level}</b>
        <span>Experience</span><b>${p.xp} / ${game.xpNext()}</b>
        <span>Gold</span><b>${p.gold}</b>
        <span>Kills / Deaths</span><b>${p.kills} / ${p.deaths}</b>
        <span>Position</span><b>${p.position}</b>
      </div>
      ${aff ? `<div class="section-title">Affects</div><div class="list">${aff}</div>` : ''}
      <div class="section-title">Settings</div>
      <div class="toggles">
        <label class="toggle">Autoloot corpses <input type="checkbox" data-toggle="autoloot" ${p.autoloot ? 'checked' : ''}></label>
        <label class="toggle">Autogold <input type="checkbox" data-toggle="autogold" ${p.autogold ? 'checked' : ''}></label>
        <label class="toggle"><span>Wimpy at <b id="wimpy-v">${p.wimpy}</b> hp</span><input type="range" min="0" max="${Math.floor(game.maxHp() / 2)}" value="${p.wimpy}" data-wimpy></label>
      </div>
      <div class="hero-actions"><button class="btn small" data-cmd="score">Score</button><button class="btn small" data-cmd="save">Save</button><button class="btn small danger" data-cmd="restart">New character</button></div>`;
  }

  const tabBody = $('#tab-body');
  function renderPanels(force) {
    if (!game.player) return;
    const active = document.activeElement;
    if (!force && active && active.closest && active.closest('#tab-body') && active.matches('input[type=range]')) return;
    const html = { pack: renderPack, gear: renderGear, skills: renderSkills, hero: renderHero }[ui.tab]();
    if (html !== ui.lastTabHtml) { tabBody.innerHTML = html; ui.lastTabHtml = html; }
    renderQuick();
    renderHotbar();
    renderCompass();
    const p = game.player, R = DATA.races[p.race], C = DATA.classes[p.cls];
    $('#whoami').innerHTML = `<b>${esc(p.name)}</b> ${esc(p.title)} · Level ${p.level} ${R.name} ${C.name}`;
  }

  tabBody.addEventListener('click', (e) => {
    const p = game.player;
    const row = e.target.closest('[data-inv],[data-slot],[data-skill],[data-cmd]');
    if (!row) return;
    if (row.dataset.cmd) return send(row.dataset.cmd);
    if (row.dataset.inv !== undefined) {
      const g = groupItems(p.inventory)[+row.dataset.inv];
      if (g) showMenu(e.clientX, e.clientY, `{G}${g.it.short}{x}`, invActions(g.it));
    } else if (row.dataset.slot) {
      const it = p.equipment[row.dataset.slot];
      if (it) showMenu(e.clientX, e.clientY, `{G}${it.short}{x}`, [{ label: 'Remove', cmd: `remove ${itemRef(game.equipped(), it)}` }, { label: 'Look', cmd: `look ${itemRef(game.equipped(), it)}` }]);
    } else if (row.dataset.skill) {
      const sk = row.dataset.skill;
      const acts = [];
      if (game.room().mobs.some((m) => m.flags.includes('guildmaster'))) acts.push({ label: 'Practice', cmd: `practice ${sk}` });
      if (DATA.spells[sk].kind !== 'passive') acts.push({ label: 'Use', fn: () => useSkill(sk) });
      acts.push({ label: 'Show all skills', cmd: 'skills' });
      showMenu(e.clientX, e.clientY, `{W}${sk}{x}`, acts);
    }
  });
  tabBody.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.toggle) send(t.dataset.toggle);
    if (t.dataset.wimpy !== undefined) send(`wimpy ${t.value}`);
  });
  tabBody.addEventListener('input', (e) => { if (e.target.dataset.wimpy !== undefined) $('#wimpy-v').textContent = e.target.value; });

  /* ================================================================ vitals (per frame) */
  const V = {};
  function setText(id, v) { if (V[id] !== v) { V[id] = v; $(id).textContent = v; } }
  function setWidth(id, pct) { const v = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`; if (V[id + 'w'] !== v) { V[id + 'w'] = v; $(id).style.width = v; } }
  function updateVitals() {
    const p = game.player;
    if (!p) return;
    const mh = game.maxHp(), mm = game.maxMana(), mv = game.maxMv();
    setWidth('#hp-fill', (p.hp / mh) * 100); setText('#hp-val', `${p.hp}/${mh}`);
    setWidth('#mana-fill', mm ? (p.mana / mm) * 100 : 0); setText('#mana-val', mm ? `${p.mana}/${mm}` : '—');
    setWidth('#mv-fill', (p.mv / mv) * 100); setText('#mv-val', `${p.mv}/${mv}`);
    const need = game.xpNext();
    setWidth('#xp-fill', p.level >= 20 ? 100 : (p.xp / need) * 100); setText('#xp-val', p.level >= 20 ? 'MAX' : `${Math.floor((p.xp / need) * 100)}%`);
    $('#tick-fill').style.width = `${(game.tickProgress() * 100).toFixed(1)}%`;
    document.querySelector('.bar.hp').classList.toggle('low', p.hp < mh * 0.3);
    // target frame
    const t = selectedMob();
    const tf = $('#target');
    if (t) {
      tf.hidden = false;
      tf.classList.toggle('peaceful', t.flags.includes('peaceful'));
      setText('#t-icon', t.icon);
      setText('#t-name', t.short.charAt(0).toUpperCase() + t.short.slice(1));
      setText('#t-lvl', `lv ${t.level}${t.boss ? ' ★' : ''}`);
      setWidth('#t-fill', (t.hp / t.maxHp) * 100);
      setText('#t-cond', `${game.target() === t ? '⚔ Fighting — ' : ''}${util.condition(t.hp, t.maxHp).replace(/\.$/, '')}`);
    } else tf.hidden = true;
    // scene hud
    const room = game.room();
    setText('#room-name', room.name);
    setText('#room-area', DATA.areas[room.area].name);
    const h = game.time.hour, hh = h % 12 || 12;
    const icon = h >= 6 && h < 19 ? '☀️' : '🌙';
    setText('#clock', `${icon} ${hh}${h < 12 ? 'am' : 'pm'} · Day ${game.time.day}`);
    setText('#map-meta', `${DATA.areas[room.area].name} · ${DATA.areas[room.area].levels}`);
    // hotbar cooldown
    const lag = Math.max(0, game.lagUntil - game.clock);
    document.querySelectorAll('#hotbar .cd').forEach((cd) => { cd.style.transform = `scaleX(${Math.min(1, lag / 3000)})`; });
  }

  /* ================================================================ creator */
  const cc = { race: 'human', cls: 'warrior', stats: null };
  function modStr(mods) {
    return Object.entries(mods).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}`).join('  ') || 'balanced';
  }
  function renderCreator() {
    $('#cc-races').innerHTML = Object.entries(DATA.races).map(([k, r]) => `<button type="button" class="pick ${cc.race === k ? 'sel' : ''}" data-race="${k}"><span class="t">${r.name}</span><span class="d">${esc(r.desc)}</span><span class="m">${modStr(r.mods)}</span></button>`).join('');
    $('#cc-classes').innerHTML = Object.entries(DATA.classes).map(([k, c]) => `<button type="button" class="pick ${cc.cls === k ? 'sel' : ''}" data-cls="${k}"><span class="t">${c.icon} ${c.name}</span><span class="d">${esc(c.desc)}</span><span class="m">HP d${c.hpDie} · ${c.manaDie ? 'Mana d' + c.manaDie : 'no mana'} · ${c.prime.toUpperCase()}</span></button>`).join('');
    const stats = cc.stats;
    $('#cc-stats').innerHTML = ['str', 'int', 'wis', 'dex', 'con'].map((k) => `<div class="stat"><span>${k}</span><b style="color:${stats[k] >= 16 ? '#7ee787' : stats[k] <= 9 ? '#ff8a80' : 'inherit'}">${stats[k]}</b></div>`).join('');
    $('#cc-begin').disabled = $('#cc-name').value.replace(/[^A-Za-z]/g, '').length < 2;
  }
  function reroll() { cc.stats = Game.rollStats(cc.race, cc.cls); renderCreator(); }
  $('#cc-races').addEventListener('click', (e) => { const b = e.target.closest('[data-race]'); if (b) { cc.race = b.dataset.race; reroll(); } });
  $('#cc-classes').addEventListener('click', (e) => { const b = e.target.closest('[data-cls]'); if (b) { cc.cls = b.dataset.cls; reroll(); } });
  $('#cc-reroll').addEventListener('click', reroll);
  $('#cc-name').addEventListener('input', renderCreator);
  $('#cc-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#cc-begin').disabled) begin(); });
  $('#cc-begin').addEventListener('click', begin);

  function begin() {
    game.newPlayer({ name: $('#cc-name').value, race: cc.race, cls: cc.cls, stats: cc.stats });
    startPlaying();
    save();
  }
  function startPlaying() {
    $('#creator').hidden = true;
    ui.dirty = true;
    renderPanels(true);
    input.focus();
  }

  function openCreator() {
    $('#creator').hidden = false;
    const raw = store.get(SAVE_KEY);
    const cont = $('#continue');
    if (raw) {
      try {
        const s = JSON.parse(raw).p;
        cont.innerHTML = `<div class="who">Continue as <b>${esc(s.name)}</b><small>Level ${s.level} ${DATA.races[s.race].name} ${DATA.classes[s.cls].name} · ${s.kills} kills</small></div><button class="btn primary" type="button" id="cc-continue">Continue</button>`;
        cont.hidden = false;
        $('#cc-continue').addEventListener('click', () => {
          try { game.load(raw); startPlaying(); } catch (e) { cont.innerHTML = '<div class="who">That save could not be loaded. Create a new hero below.</div>'; }
        });
      } catch (e) { cont.hidden = true; }
    }
    reroll();
    setTimeout(() => (raw ? $('#cc-continue') : $('#cc-name'))?.focus(), 50);
  }

  /* ================================================================ loop */
  let last = performance.now();
  function frame(now) {
    const dt = now - last;
    last = now;
    game.update(dt);
    if (game.player) {
      scene.render(now);
      minimap.render(now);
      updateVitals();
      if (ui.dirty && now - ui.lastPanel > 120) { ui.dirty = false; ui.lastPanel = now; renderPanels(); }
    }
    requestAnimationFrame(frame);
  }

  openCreator();
  requestAnimationFrame(frame);
})();
