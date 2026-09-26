/* ==========================================================================
 * RPG MUD — scene renderer
 * Paints a procedural backdrop for the current room (seeded by room id, lit
 * by the in-game clock) and animates creatures, items and combat effects.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MUD = root.MUD;

  /* ------------------------------------------------------------ helpers */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const A = hex(a), B = hex(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }
  function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; }
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  // Sky keyframes: [hour, top colour, horizon colour]
  const SKY = [
    [0, '#060a18', '#141b36'], [4.5, '#0b1026', '#27264a'], [6, '#3b3a6b', '#f09a62'],
    [7.5, '#5f95d6', '#f5c99a'], [10, '#5ea2e8', '#cfe6fb'], [16, '#5a9de4', '#d6eafc'],
    [18, '#4b5f9e', '#f29a61'], [19.5, '#241f4a', '#b0506a'], [21, '#0b1026', '#231f44'], [24, '#060a18', '#141b36'],
  ];
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
      if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0); return [mix(t0, t1, t), mix(b0, b1, t)]; }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  function daylight(h) {
    if (h < 5 || h > 20.5) return 0;
    if (h < 7.5) return (h - 5) / 2.5;
    if (h > 18) return 1 - (h - 18) / 2.5;
    return 1;
  }

  const CLASS_ICON = { warrior: '🤺', cleric: '😇', mage: '🧙', thief: '🥷' };
  const SPELL_COLOR = {
    'magic missile': '#c49bff', 'chill touch': '#9ff3ff', 'burning hands': '#ff9a3d', 'shocking grasp': '#9fd3ff',
    'lightning bolt': '#cfe8ff', fireball: '#ff7a2d', 'cause light': '#b6ff7a', 'cause serious': '#9dff5c', harm: '#7dff3a',
  };

  /* ======================================================================
   * Scene
   * ==================================================================== */
  class Scene {
    constructor(canvas, game) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.g = game;
      this.vis = new Map();
      this.floaters = [];
      this.particles = [];
      this.projectiles = [];
      this.hitboxes = [];
      this.lights = [];
      this.shake = 0;
      this.fadeT = -1e9;
      this.deathT = -1e9;
      this.levelT = -1e9;
      this.now = 0;
      this.bgKey = '';
      this.bg = document.createElement('canvas');
      this.hover = null;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      if (root.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);

      game.on('move', (e) => { this.fadeT = this.now; this.vis.clear(); this.particles = []; this.projectiles = []; this.floaters = []; if (e.teleport) this.burst(this.w * 0.2, this.baseY - 30, '#fff3c4', 30); });
      game.on('combat', (e) => this.onCombat(e));
      game.on('spell', (e) => this.onSpell(e));
      game.on('heal', (e) => { if (e.amount > 0) { const p = this.pos(e.target); this.floater(p.x, p.y - 60, `+${e.amount}`, '#7ee787'); this.sparkle(p.x, p.y - 30, '#7ee787'); } });
      game.on('mobdeath', (e) => { const v = this.vis.get(e.uid); if (v) v.dying = this.now; });
      game.on('levelup', () => { this.levelT = this.now; const p = this.pos('player'); this.burst(p.x, p.y - 30, '#ffd866', 60); this.floater(p.x, p.y - 80, 'LEVEL UP!', '#ffd866', 1800, 20); });
      game.on('playerdeath', () => { this.deathT = this.now; });
      game.on('arrive', (e) => {
        const from = e.dir === 'e' ? this.w + 60 : e.dir === 'w' ? -60 : null;
        this.vis.set(e.uid, { x: from ?? null, born: this.now, lunge: -1e9, flash: -1e9, fromSide: from !== null });
      });
      game.on('leave', (e) => {
        const v = this.vis.get(e.uid);
        if (v) v.leaving = { t0: this.now, dir: e.dir };
      });
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      this.dpr = dpr;
      this.w = Math.max(200, r.width);
      this.h = Math.max(120, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.bg.width = this.c.width;
      this.bg.height = this.c.height;
      this.bgKey = '';
    }

    get baseY() { return this.h * 0.8; }
    hourF() { return (this.g.time.hour + this.g.tickProgress()) % 24; }

    /* ---------------------------------------------------------- events */
    pos(id) {
      if (id === 'player') { const v = this.vis.get('player'); return { x: v ? v.x : this.w * 0.2, y: this.baseY }; }
      const v = this.vis.get(id);
      return { x: v && v.x != null ? v.x : this.w * 0.65, y: this.baseY };
    }
    onCombat(e) {
      const sv = this.vis.get(e.src);
      if (sv) sv.lunge = this.now;
      const p = this.pos(e.dst);
      const tv = this.vis.get(e.dst);
      if (e.dam > 0) {
        if (tv) tv.flash = this.now;
        const toPlayer = e.dst === 'player';
        this.floater(p.x + (Math.random() - 0.5) * 20, p.y - 62, String(e.dam), toPlayer ? '#ff6b6b' : '#ffe08a', 1100, e.dam > 20 ? 20 : 16);
        this.sparkle(p.x, p.y - 26, toPlayer ? '#ff5a5a' : '#ffd27a', 10);
        if (toPlayer && this.g.player && e.dam > this.g.maxHp() * 0.08) this.shake = Math.min(10, 3 + e.dam / 4);
      } else {
        this.floater(p.x, p.y - 62, e.parry ? 'parry' : e.dodge ? 'dodge' : 'miss', e.parry || e.dodge ? '#74e3ec' : '#9aa3b5', 900, 13);
      }
    }
    onSpell(e) {
      const col = SPELL_COLOR[e.name];
      const a = this.pos(e.src), b = this.pos(e.dst);
      if (e.dst === e.src || !col) {
        const aura = e.name === 'sanctuary' ? '#ffffff' : e.name === 'armor' ? '#9fc4ff' : e.name === 'bless' ? '#ffd866' : '#7ee787';
        this.burst(a.x, a.y - 30, aura, 26);
        return;
      }
      const n = e.name === 'magic missile' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        this.projectiles.push({ x0: a.x, y0: a.y - 34, x1: b.x, y1: b.y - 30, t0: this.now + i * 90, dur: e.name === 'lightning bolt' ? 180 : 420, color: col, kind: e.name, wob: Math.random() * 6 });
      }
    }
    floater(x, y, text, color, dur = 1100, size = 16) { this.floaters.push({ x, y, text, color, t0: this.now, dur, size }); }
    sparkle(x, y, color, n = 12) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 80;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.5 + Math.random() * 0.3, t: 0, color, size: 1.5 + Math.random() * 2, g: 120 });
      }
    }
    burst(x, y, color, n = 30) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = 60 + Math.random() * 90;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9 + Math.random() * 0.5, t: 0, color, size: 2 + Math.random() * 2, g: -10, glow: true });
      }
    }

    /* ---------------------------------------------------------- render */
    render(now) {
      const dt = Math.min(0.05, (now - (this.now || now)) / 1000);
      this.now = now;
      const g = this.g, ctx = this.ctx;
      if (!g.player) return;
      const room = g.room();
      const hour = this.hourF();
      const key = `${room.id}|${Math.floor(hour * 2)}|${this.w}x${this.h}`;
      if (key !== this.bgKey) { this.bgKey = key; this.paintBackground(room, hour); }

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      if (this.shake > 0.2) { ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= 0.86; } else this.shake = 0;
      this.hitboxes = [];
      ctx.drawImage(this.bg, 0, 0, this.w, this.h);
      this.drawAmbient(room, hour, dt);
      this.drawProps(room);
      this.drawEntities(room, dt);
      this.drawItems(room);
      this.drawProjectiles();
      this.drawParticles(dt);
      this.drawFloaters();
      ctx.restore();

      // overlays
      const vign = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.3, this.w / 2, this.h / 2, this.w * 0.75);
      vign.addColorStop(0, 'rgba(0,0,0,0)');
      vign.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, this.w, this.h);
      const p = g.player;
      if (p.hp < g.maxHp() * 0.25 && p.position !== 'dead') {
        ctx.fillStyle = `rgba(160,0,0,${0.12 + 0.08 * Math.sin(now / 250)})`;
        ctx.fillRect(0, 0, this.w, this.h);
      }
      const d = (now - this.deathT) / 2500;
      if (d < 1) { ctx.fillStyle = `rgba(90,0,0,${0.7 * (1 - d)})`; ctx.fillRect(0, 0, this.w, this.h); }
      const f = (now - this.fadeT) / 380;
      if (f < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - ease(f)})`; ctx.fillRect(0, 0, this.w, this.h); }
    }

    /* ---------------------------------------------------------- background */
    paintBackground(room, hour) {
      const ctx = this.bg.getContext('2d');
      const w = this.w, h = this.h, R = rng(hash(room.id));
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      this.lights = [];
      this.water = null;
      this.arcane = null;
      this.embers = false;
      this.style = room.sector;
      const day = daylight(hour);
      const painter = {
        city: () => this.paintCity(ctx, w, h, R, hour, day),
        inside: () => this.paintInside(ctx, w, h, R, room, hour, day),
        sewer: () => this.paintSewer(ctx, w, h, R, room),
        road: () => this.paintRoad(ctx, w, h, R, hour, day),
        field: () => this.paintField(ctx, w, h, R, hour, day, room),
        forest: () => this.paintForest(ctx, w, h, R, hour, day),
        hills: () => this.paintHills(ctx, w, h, R, hour, day, room),
        water: () => this.paintWater(ctx, w, h, R, hour, day, room),
        cave: () => this.paintCave(ctx, w, h, R, room),
        crypt: () => this.paintCrypt(ctx, w, h, R, room),
      }[room.sector] || (() => this.paintCave(ctx, w, h, R, room));
      painter();
    }

    paintSky(ctx, w, h, R, hour, horizon) {
      const [top, bot] = skyAt(hour);
      const gr = ctx.createLinearGradient(0, 0, 0, horizon);
      gr.addColorStop(0, top);
      gr.addColorStop(1, bot);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, horizon + 2);
      const day = daylight(hour);
      if (day < 0.6) {
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = `rgba(255,255,255,${(0.6 - day) * (0.3 + R() * 0.7)})`;
          const s = R() < 0.1 ? 1.6 : 1;
          ctx.fillRect(R() * w, R() * horizon * 0.9, s, s);
        }
      }
      // sun or moon on an arc
      const isDay = hour >= 5.5 && hour <= 19.5;
      const t = isDay ? (hour - 5.5) / 14 : ((hour + 24 - 19.5) % 24) / 10;
      const x = lerp(w * 0.08, w * 0.92, t), y = horizon - Math.sin(t * Math.PI) * horizon * 0.8 + 10;
      if (isDay) {
        const glow = ctx.createRadialGradient(x, y, 2, x, y, 70);
        glow.addColorStop(0, 'rgba(255,240,200,0.9)');
        glow.addColorStop(0.2, 'rgba(255,220,150,0.35)');
        glow.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 70, y - 70, 140, 140);
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(220,230,255,0.12)';
        ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8ecff';
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = skyAt(hour)[0];
        ctx.beginPath(); ctx.arc(x + 4, y - 2, 8, 0, Math.PI * 2); ctx.fill();
      }
      // clouds
      for (let i = 0; i < 5; i++) {
        const cx = R() * w, cy = R() * horizon * 0.6 + 10, cw = 40 + R() * 80;
        ctx.fillStyle = `rgba(255,255,255,${0.05 + day * 0.18})`;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx + k * cw * 0.25, cy + (k % 2) * 4, cw * 0.3, 8 + R() * 6, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    ridge(ctx, w, h, R, baseY, amp, color, freq = 3) {
      const ph = R() * 10, ph2 = R() * 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const y = baseY - Math.sin((x / w) * Math.PI * freq + ph) * amp - Math.sin((x / w) * Math.PI * freq * 2.7 + ph2) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    shade(day, dayCol, nightCol) { return mix(nightCol, dayCol, 0.25 + day * 0.75); }

    paintCity(ctx, w, h, R, hour, day) {
      const hor = h * 0.58;
      this.paintSky(ctx, w, h, R, hour, hor);
      // skyline
      for (let layer = 0; layer < 2; layer++) {
        let x = -10;
        while (x < w) {
          const bw = 28 + R() * 46, bh = (layer ? 40 : 60) + R() * (layer ? 50 : 70);
          const col = this.shade(day, layer ? '#7d8596' : '#a2a9b8', layer ? '#151826' : '#1d2133');
          ctx.fillStyle = col;
          const top = hor + (layer ? 14 : 0) - bh;
          ctx.fillRect(x, top, bw, bh + 40);
          if (R() < 0.5) { ctx.beginPath(); ctx.moveTo(x - 3, top); ctx.lineTo(x + bw / 2, top - 14 - R() * 14); ctx.lineTo(x + bw + 3, top); ctx.fill(); }
          for (let wy = top + 8; wy < hor + 10; wy += 12) {
            for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
              if (R() < 0.45) continue;
              const lit = day < 0.5 && R() < 0.55;
              ctx.fillStyle = lit ? `rgba(255,205,120,${0.6 + R() * 0.4})` : `rgba(20,25,40,${0.25 + day * 0.2})`;
              ctx.fillRect(wx, wy, 4, 6);
            }
          }
          x += bw + 2 + R() * 6;
        }
      }
      // cobbles
      const gy = h * 0.66;
      ctx.fillStyle = this.shade(day, '#6b6760', '#23232a');
      ctx.fillRect(0, gy, w, h - gy);
      ctx.strokeStyle = this.shade(day, '#4c4944', '#17171c');
      ctx.lineWidth = 1;
      let rowH = 5;
      for (let y = gy; y < h; y += rowH) {
        rowH *= 1.18;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        const cw = rowH * 2.2, off = R() * cw;
        for (let x = -off; x < w; x += cw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rowH); ctx.stroke(); }
      }
      // lanterns
      for (const lx of [w * 0.08, w * 0.92]) {
        ctx.fillStyle = '#15161b';
        ctx.fillRect(lx - 2, h * 0.42, 4, h * 0.42);
        ctx.fillRect(lx - 6, h * 0.4, 12, 10);
        this.lights.push({ x: lx, y: h * 0.43, r: day < 0.5 ? 90 : 25, color: '#ffc46b', flicker: 0.15 });
      }
    }

    paintInside(ctx, w, h, R, room, hour, day) {
      const temple = /temple|altar/.test(room.id);
      const wallTop = temple ? '#5b5650' : '#4a3222', wallBot = temple ? '#3a3632' : '#2a1b11';
      const gr = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      gr.addColorStop(0, wallTop);
      gr.addColorStop(1, wallBot);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
      if (temple) {
        // stone blocks
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        for (let y = 0, r = 0; y < h * 0.7; y += 22, r++) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          for (let x = (r % 2) * 22; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 22); ctx.stroke(); }
        }
        // rose window
        const cx = w / 2, cy = h * 0.3, rr = Math.min(60, h * 0.22);
        const glow = ctx.createRadialGradient(cx, cy, 5, cx, cy, rr * 2.4);
        glow.addColorStop(0, 'rgba(255,210,140,0.55)');
        glow.addColorStop(1, 'rgba(255,180,100,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        const cols = ['#e05a6a', '#f2b35b', '#6aa7e0', '#9b6ae0', '#5bd18a', '#f27a4f'];
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = cols[i % cols.length];
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rr, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, rr * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#ffe7a8'; ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1;
        // pillars
        for (const px of [w * 0.12, w * 0.3, w * 0.7, w * 0.88]) {
          const pg = ctx.createLinearGradient(px - 14, 0, px + 14, 0);
          pg.addColorStop(0, '#6b665f'); pg.addColorStop(0.5, '#9a948b'); pg.addColorStop(1, '#5a554f');
          ctx.fillStyle = pg;
          ctx.fillRect(px - 12, 0, 24, h * 0.72);
        }
      } else {
        // planks and beams
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        for (let x = 0; x < w; x += 18 + R() * 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h * 0.7); ctx.stroke(); }
        ctx.fillStyle = '#1f140c';
        ctx.fillRect(0, 0, w, 16);
        for (let x = 30; x < w; x += 140) ctx.fillRect(x, 0, 12, h * 0.7);
        const shop = MUD.DATA.shops[room.id] || room.id === 't_guild';
        if (shop) {
          for (const sy of [h * 0.28, h * 0.46]) {
            ctx.fillStyle = '#2c1d12';
            ctx.fillRect(w * 0.3, sy, w * 0.4, 5);
            for (let x = w * 0.31; x < w * 0.69; x += 9 + R() * 6) {
              const tall = 8 + R() * 16;
              ctx.fillStyle = ['#c0392b', '#2e86c1', '#27ae60', '#d4ac0d', '#8e44ad', '#aab0b8', '#7f8c8d'][Math.floor(R() * 7)];
              ctx.fillRect(x, sy - tall, 5 + R() * 3, tall);
            }
          }
        }
        if (room.flags.includes('restful') || room.id === 't_inn') {
          const wx = room.id === 't_inn' ? w * 0.78 : w * 0.45, wy = h * 0.14, ww = 70, wh = 56;
          const [top, bot] = skyAt(hour);
          const sg = ctx.createLinearGradient(0, wy, 0, wy + wh);
          sg.addColorStop(0, top); sg.addColorStop(1, bot);
          ctx.fillStyle = sg; ctx.fillRect(wx, wy, ww, wh);
          ctx.strokeStyle = '#1f140c'; ctx.lineWidth = 4; ctx.strokeRect(wx, wy, ww, wh);
          ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
          ctx.lineWidth = 1;
        }
        if (room.id === 't_inn' || room.id === 't_weapons') {
          // hearth
          const hx = room.id === 't_inn' ? w * 0.16 : w * 0.78, hy = h * 0.42;
          ctx.fillStyle = '#3b3632'; ctx.fillRect(hx - 40, hy - 10, 80, h * 0.3);
          ctx.fillStyle = '#120c08'; ctx.fillRect(hx - 26, hy + 8, 52, h * 0.3 - 18);
          this.lights.push({ x: hx, y: hy + 30, r: 140, color: '#ff8a3a', flicker: 0.3, fire: true });
        }
      }
      // floor
      const fy = h * 0.7;
      ctx.fillStyle = temple ? '#4a4540' : '#2b1c11';
      ctx.fillRect(0, fy, w, h - fy);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      let rh = 4;
      for (let y = fy; y < h; y += rh) { rh *= 1.25; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = -10; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 20, fy); ctx.lineTo(w / 2 + i * 90, h); ctx.stroke(); }
      if (temple) {
        ctx.fillStyle = 'rgba(160,30,40,0.55)';
        ctx.beginPath(); ctx.moveTo(w * 0.45, fy); ctx.lineTo(w * 0.55, fy); ctx.lineTo(w * 0.7, h); ctx.lineTo(w * 0.3, h); ctx.fill();
      }
      for (const tx of [w * 0.04, w * 0.96]) {
        ctx.fillStyle = '#1a120b'; ctx.fillRect(tx - 3, h * 0.36, 6, 16);
        this.lights.push({ x: tx, y: h * 0.34, r: 80, color: '#ffb35a', flicker: 0.25, fire: true });
      }
    }

    paintSewer(ctx, w, h, R, room) {
      ctx.fillStyle = '#111510';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0, r = 0; y < h; y += 14, r++) {
        for (let x = (r % 2) * -14; x < w; x += 28) {
          const v = R();
          ctx.fillStyle = `rgb(${34 + v * 18},${42 + v * 20},${32 + v * 14})`;
          ctx.fillRect(x + 1, y + 1, 26, 12);
        }
      }
      const cx = w / 2, cy = h * 0.55;
      const tg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.45);
      tg.addColorStop(0, 'rgba(0,0,0,0.95)');
      tg.addColorStop(0.45, 'rgba(0,0,0,0.75)');
      tg.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, w, h);
      // walkway and channel
      ctx.fillStyle = '#2a2f27';
      ctx.fillRect(0, h * 0.74, w, h * 0.08);
      ctx.fillStyle = '#1c2a1a';
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
      this.water = { y0: h * 0.82, y1: h, color: '#4a6a3a' };
      if (room.id === 's_tunnel2' || room.id === 's_cistern') {
        for (let i = 0; i < 8; i++) this.lights.push({ x: R() * w, y: R() * h * 0.6, r: 40 + R() * 40, color: room.id === 's_cistern' ? '#7fff6a' : '#8cffc0', flicker: 0.05 });
      }
      if (room.id === 's_entry') {
        ctx.fillStyle = 'rgba(255,240,200,0.12)';
        ctx.beginPath(); ctx.moveTo(w * 0.45, 0); ctx.lineTo(w * 0.55, 0); ctx.lineTo(w * 0.62, h * 0.8); ctx.lineTo(w * 0.38, h * 0.8); ctx.fill();
        ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 3;
        for (const lx of [w * 0.47, w * 0.53]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h * 0.74); ctx.stroke(); }
        for (let y = 10; y < h * 0.74; y += 16) { ctx.beginPath(); ctx.moveTo(w * 0.47, y); ctx.lineTo(w * 0.53, y); ctx.stroke(); }
        ctx.lineWidth = 1;
      }
    }

    paintRoad(ctx, w, h, R, hour, day) {
      const hor = h * 0.55;
      this.paintSky(ctx, w, h, R, hour, hor);
      this.ridge(ctx, w, h, R, hor, 14, this.shade(day, '#7f98a8', '#1b2230'), 2);
      this.ridge(ctx, w, h, R, hor + 12, 8, this.shade(day, '#6b9a4a', '#16241a'), 3);
      ctx.fillStyle = this.shade(day, '#5c8a3c', '#122016');
      ctx.fillRect(0, hor + 16, w, h);
      ctx.fillStyle = this.shade(day, '#9a7b52', '#2a2218');
      ctx.beginPath(); ctx.moveTo(w * 0.47, hor + 14); ctx.lineTo(w * 0.53, hor + 14); ctx.lineTo(w * 0.85, h); ctx.lineTo(w * 0.15, h); ctx.fill();
      ctx.strokeStyle = this.shade(day, '#7a6040', '#1e1810');
      for (let i = 0; i < 20; i++) { const y = lerp(hor + 20, h, R()); const x = lerp(w * 0.45, w * 0.55, R()); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y); ctx.stroke(); }
      // fences
      ctx.strokeStyle = this.shade(day, '#5a4027', '#18120b');
      ctx.lineWidth = 2;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const t = i / 6, y = lerp(hor + 18, h * 0.98, t * t), x = w / 2 + side * lerp(w * 0.06, w * 0.46, t * t);
          const ph = lerp(4, 26, t * t);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - ph); ctx.stroke();
        }
      }
      ctx.lineWidth = 1;
      this.flowers(ctx, w, h, R, hor + 20, 60, day);
    }

    flowers(ctx, w, h, R, y0, n, day) {
      for (let i = 0; i < n; i++) {
        const y = lerp(y0, h, R()), x = R() * w;
        if (Math.abs(x - w / 2) < (y - y0) * 0.7 && this.style === 'road') continue;
        ctx.fillStyle = rgba(['#ffd1e8', '#fff3a8', '#c6e0ff', '#ffffff', '#ffb0a0'][Math.floor(R() * 5)], 0.3 + day * 0.6);
        ctx.fillRect(x, y, 2, 2);
      }
    }

    paintField(ctx, w, h, R, hour, day, room) {
      const hor = h * 0.55;
      this.paintSky(ctx, w, h, R, hour, hor);
      this.ridge(ctx, w, h, R, hor, 18, this.shade(day, '#5e8f5a', '#132018'), 2);
      if (room.id === 'f_glade') {
        for (let i = 0; i < 18; i++) { const x = R() * w, s = 20 + R() * 30; ctx.fillStyle = this.shade(day, '#2f5a2c', '#0b150d'); ctx.beginPath(); ctx.moveTo(x, hor - s * 1.8); ctx.lineTo(x - s * 0.5, hor + 6); ctx.lineTo(x + s * 0.5, hor + 6); ctx.fill(); }
      }
      this.ridge(ctx, w, h, R, hor + 20, 10, this.shade(day, '#6fa648', '#15261a'), 3);
      ctx.fillStyle = this.shade(day, '#6aa445', '#132416');
      ctx.fillRect(0, h * 0.68, w, h);
      if (room.id === 'r_mill') {
        // ruined mill
        const mx = w * 0.72, my = h * 0.66;
        ctx.fillStyle = this.shade(day, '#4a3c30', '#141010');
        ctx.fillRect(mx - 40, my - 70, 80, 70);
        ctx.fillStyle = this.shade(day, '#2a2018', '#0b0908');
        ctx.beginPath(); ctx.moveTo(mx - 46, my - 70); ctx.lineTo(mx - 10, my - 100); ctx.lineTo(mx + 20, my - 80); ctx.lineTo(mx + 46, my - 70); ctx.fill();
        ctx.strokeStyle = this.shade(day, '#3a2c20', '#0c0a08'); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(mx + 52, my - 30, 30, 0, Math.PI * 2); ctx.stroke();
        for (let a = 0; a < 8; a++) { ctx.beginPath(); ctx.moveTo(mx + 52, my - 30); ctx.lineTo(mx + 52 + Math.cos(a * 0.785) * 30, my - 30 + Math.sin(a * 0.785) * 30); ctx.stroke(); }
        ctx.lineWidth = 1;
        this.lights.push({ x: w * 0.4, y: h * 0.78, r: day < 0.5 ? 110 : 40, color: '#ff8a3a', flicker: 0.35, fire: true });
      }
      this.flowers(ctx, w, h, R, h * 0.66, 120, day);
    }

    paintForest(ctx, w, h, R, hour, day) {
      const hor = h * 0.6;
      this.paintSky(ctx, w, h, R, hour, hor);
      ctx.fillStyle = `rgba(10,30,15,${0.35 + (1 - day) * 0.3})`;
      ctx.fillRect(0, 0, w, hor);
      const layers = [['#2c4a3a', '#0a1410', 0.55, 26], ['#23402a', '#08120b', 0.62, 34], ['#1a3320', '#060d08', 0.7, 44]];
      for (const [dc, nc, base, size] of layers) {
        ctx.fillStyle = this.shade(day, dc, nc);
        for (let x = -20; x < w + 20; x += size * (0.5 + R() * 0.5)) {
          const s = size * (0.8 + R() * 0.6), by = h * base + R() * 10;
          ctx.beginPath(); ctx.moveTo(x, by - s * 2.4); ctx.lineTo(x - s * 0.7, by); ctx.lineTo(x + s * 0.7, by); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x, by - s * 3); ctx.lineTo(x - s * 0.5, by - s * 1.2); ctx.lineTo(x + s * 0.5, by - s * 1.2); ctx.fill();
        }
      }
      ctx.fillStyle = this.shade(day, '#2a4221', '#0a130a');
      ctx.fillRect(0, h * 0.7, w, h);
      // near trunks
      for (const tx of [w * 0.03, w * 0.97, w * (0.3 + R() * 0.1)]) {
        const tw = 18 + R() * 16;
        const tg = ctx.createLinearGradient(tx - tw, 0, tx + tw, 0);
        tg.addColorStop(0, this.shade(day, '#2a1d12', '#0a0705')); tg.addColorStop(0.5, this.shade(day, '#4a3522', '#140e09')); tg.addColorStop(1, this.shade(day, '#20160d', '#070504'));
        ctx.fillStyle = tg;
        ctx.fillRect(tx - tw / 2, 0, tw, h * 0.85);
      }
      ctx.fillStyle = this.shade(day, '#1d3a1c', '#050c06');
      for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.arc(R() * w, R() * h * 0.12, 20 + R() * 30, 0, Math.PI * 2); ctx.fill(); }
      // glowing mushrooms
      for (let i = 0; i < 6; i++) this.lights.push({ x: R() * w, y: h * (0.78 + R() * 0.18), r: 18, color: '#7ef3ff', flicker: 0.1 });
      this.shafts = day > 0.3;
    }

    paintHills(ctx, w, h, R, hour, day, room) {
      const hor = h * 0.55;
      this.paintSky(ctx, w, h, R, hour, hor);
      ctx.fillStyle = `rgba(80,80,90,${0.25 * day})`;
      ctx.fillRect(0, 0, w, hor);
      this.ridge(ctx, w, h, R, hor, 22, this.shade(day, '#7d8a78', '#161a1a'), 2);
      this.ridge(ctx, w, h, R, hor + 18, 14, this.shade(day, '#8a8f6e', '#1a1c16'), 3);
      ctx.fillStyle = this.shade(day, '#8c8a64', '#1b1b14');
      ctx.fillRect(0, h * 0.68, w, h);
      // burial mounds
      for (let i = 0; i < 4; i++) {
        const mx = R() * w, mw = 30 + R() * 40;
        ctx.fillStyle = this.shade(day, '#6f7a5a', '#141811');
        ctx.beginPath(); ctx.ellipse(mx, hor + 20, mw, mw * 0.45, 0, Math.PI, 0); ctx.fill();
      }
      if (room.id === 'h_barrow') {
        const cx = w * 0.62, cy = h * 0.7;
        ctx.fillStyle = this.shade(day, '#5d6b4a', '#10140d');
        ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.28, h * 0.28, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#0a0a0c';
        ctx.beginPath(); ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 18, cy - 30); ctx.arc(cx, cy - 30, 18, Math.PI, 0); ctx.lineTo(cx + 18, cy); ctx.fill();
        ctx.strokeStyle = '#555c66'; ctx.lineWidth = 2;
        for (let x = cx - 14; x <= cx + 14; x += 7) { ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x, cy - 44); ctx.stroke(); }
        ctx.lineWidth = 1;
      }
      // standing stones
      for (let i = 0; i < 5; i++) {
        const sx = R() * w, sh = 16 + R() * 26, sy = h * (0.66 + R() * 0.1);
        ctx.fillStyle = this.shade(day, '#9a9a94', '#22222a');
        ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.lineTo(sx - 4, sy - sh); ctx.lineTo(sx + 5, sy - sh - 3); ctx.lineTo(sx + 7, sy); ctx.fill();
      }
      this.windy = true;
    }

    paintWater(ctx, w, h, R, hour, day, room) {
      const hor = h * 0.5;
      const under = room.z < 0;
      this.paintSky(ctx, w, h, R, hour, hor);
      this.ridge(ctx, w, h, R, hor, 12, this.shade(day, '#58804a', '#101a12'), 2);
      ctx.fillStyle = this.shade(day, '#3c6f8f', '#0c1826');
      ctx.fillRect(0, hor + 8, w, h);
      this.water = { y0: hor + 8, y1: h, color: day > 0.4 ? '#9fd0ee' : '#4a6a8a' };
      if (under) {
        ctx.fillStyle = '#16140f';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.55); ctx.quadraticCurveTo(w / 2, -h * 0.05, 0, h * 0.55); ctx.fill();
        for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(80,70,60,${R() * 0.4})`; ctx.fillRect(R() * w, R() * h * 0.2, 12, 6); }
        ctx.fillStyle = '#3a3226';
        ctx.fillRect(0, h * 0.72, w, h * 0.1);
      } else {
        // parapets
        ctx.fillStyle = this.shade(day, '#8a857c', '#23221f');
        ctx.fillRect(0, h * 0.66, w, h * 0.34);
        ctx.fillStyle = this.shade(day, '#a19b90', '#2c2a26');
        for (let x = 0; x < w; x += 34) ctx.fillRect(x, h * 0.62, 26, 12);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        for (let x = 0; x < w; x += 22) { ctx.beginPath(); ctx.moveTo(x, h * 0.66); ctx.lineTo(x, h); ctx.stroke(); }
        this.water = { y0: hor + 8, y1: h * 0.62, color: day > 0.4 ? '#9fd0ee' : '#4a6a8a' };
      }
    }

    paintCave(ctx, w, h, R, room) {
      const warren = room.area === 'warrens';
      ctx.fillStyle = warren ? '#1a130e' : '#141214';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const v = R();
        ctx.fillStyle = `rgba(${60 + v * 40},${45 + v * 30},${35 + v * 20},${0.15 + R() * 0.25})`;
        ctx.beginPath(); ctx.ellipse(R() * w, R() * h * 0.75, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, Math.PI * 2); ctx.fill();
      }
      const cx = w / 2, cy = h * 0.5;
      const tg = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.5);
      tg.addColorStop(0, 'rgba(0,0,0,0.7)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0d0a08';
      for (let x = 0; x < w; x += 14 + R() * 20) { const l = 10 + R() * 40; ctx.beginPath(); ctx.moveTo(x - 7, 0); ctx.lineTo(x, l); ctx.lineTo(x + 7, 0); ctx.fill(); }
      ctx.fillStyle = warren ? '#2a1f16' : '#221e1c';
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.74 + Math.sin(x * 0.05) * 4 + R() * 4);
      ctx.lineTo(w, h); ctx.fill();
      if (room.id === 'g_mouth') {
        ctx.fillStyle = 'rgba(160,200,255,0.12)';
        ctx.beginPath(); ctx.ellipse(w * 0.85, h * 0.4, 50, 70, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (warren) {
        for (const tx of [w * 0.12, w * 0.88, ...(room.id === 'g_hall' ? [w * 0.5] : [])]) {
          if (room.id === 'g_hall' && tx === w * 0.5) {
            ctx.fillStyle = '#1a1210'; ctx.fillRect(tx - 30, h * 0.72, 60, 10);
            this.lights.push({ x: tx, y: h * 0.7, r: 160, color: '#ff7a2a', flicker: 0.35, fire: true, big: true });
          } else {
            ctx.fillStyle = '#2a1a10'; ctx.fillRect(tx - 2, h * 0.3, 4, 18);
            this.lights.push({ x: tx, y: h * 0.28, r: 90, color: '#ff9a3a', flicker: 0.3, fire: true });
          }
        }
        if (room.id === 'g_shaman') this.lights.push({ x: w * 0.8, y: h * 0.7, r: 90, color: '#b06aff', flicker: 0.25 });
      }
      this.embers = warren;
    }

    paintCrypt(ctx, w, h, R, room) {
      ctx.fillStyle = '#16141c';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0, r = 0; y < h * 0.75; y += 20, r++) {
        for (let x = (r % 2) * -20; x < w; x += 40) {
          const v = R();
          ctx.fillStyle = `rgb(${38 + v * 16},${36 + v * 14},${48 + v * 18})`;
          ctx.fillRect(x + 1, y + 1, 38, 18);
        }
      }
      if (room.id === 'c_bones' || room.id === 'c_ossuary') {
        ctx.font = `14px ${EMOJI_FONT}`;
        for (let y = 20; y < h * 0.65; y += 18) for (let x = 6; x < w; x += 20) if (R() < (room.id === 'c_bones' ? 0.35 : 0.2)) { ctx.globalAlpha = 0.1 + R() * 0.15; ctx.fillText(R() < 0.7 ? '💀' : '🦴', x, y); }
        ctx.globalAlpha = 1;
      }
      for (const px of [w * 0.1, w * 0.9]) {
        const pg = ctx.createLinearGradient(px - 16, 0, px + 16, 0);
        pg.addColorStop(0, '#2a2733'); pg.addColorStop(0.5, '#4a4656'); pg.addColorStop(1, '#221f2a');
        ctx.fillStyle = pg;
        ctx.fillRect(px - 16, 0, 32, h * 0.8);
      }
      const tg = ctx.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, w * 0.55);
      tg.addColorStop(0, 'rgba(0,0,0,0.55)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = room.id === 'c_flooded' ? '#0e1418' : '#24212c';
      ctx.fillRect(0, h * 0.74, w, h);
      if (room.id === 'c_flooded') this.water = { y0: h * 0.74, y1: h, color: '#3c5a6a' };
      if (room.id === 'c_tomb') {
        ctx.fillStyle = '#3c3946'; ctx.fillRect(w * 0.55, h * 0.58, w * 0.3, h * 0.18);
        ctx.fillStyle = '#524e5e'; ctx.fillRect(w * 0.56, h * 0.54, w * 0.28, h * 0.05);
      }
      if (room.id === 'c_sanctum') {
        this.arcane = { x: w * 0.62, y: h * 0.86, rx: w * 0.3, ry: h * 0.08 };
        this.lights.push({ x: w * 0.62, y: h * 0.55, r: 200, color: '#9b5cff', flicker: 0.2, big: true });
      }
      for (let i = 0; i < 4; i++) this.lights.push({ x: w * (0.2 + i * 0.2), y: h * 0.5 + R() * 20, r: 50, color: '#8cffb0', flicker: 0.2 });
      this.fog = true;
    }

    /* ---------------------------------------------------------- ambient */
    drawAmbient(room, hour, dt) {
      const ctx = this.ctx, w = this.w, h = this.h, t = this.now / 1000;
      // lights
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const L of this.lights) {
        const f = 1 + Math.sin(t * 13 + L.x) * L.flicker * 0.5 + Math.sin(t * 7.3 + L.y) * L.flicker * 0.5;
        const r = L.r * f;
        const gr = ctx.createRadialGradient(L.x, L.y, 1, L.x, L.y, r);
        gr.addColorStop(0, rgba(L.color, 0.55));
        gr.addColorStop(0.3, rgba(L.color, 0.18));
        gr.addColorStop(1, rgba(L.color, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(L.x - r, L.y - r, r * 2, r * 2);
        if (L.fire) {
          for (let i = 0; i < (L.big ? 6 : 2); i++) {
            const fx = L.x + Math.sin(t * 9 + i * 2) * (L.big ? 12 : 2), fh = (L.big ? 26 : 8) * (0.7 + 0.3 * Math.sin(t * 17 + i));
            ctx.fillStyle = rgba('#ffcf6a', 0.7);
            ctx.beginPath(); ctx.ellipse(fx, L.y - fh / 3, (L.big ? 6 : 2.5), fh / 2, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      ctx.restore();
      // water shimmer
      const W = this.water;
      if (W && (room.sector === 'sewer' || room.sector === 'water' || room.id === 'c_flooded')) {
        ctx.strokeStyle = rgba(W.color, 0.35);
        ctx.lineWidth = 1;
        for (let y = W.y0 + 4, i = 0; y < W.y1; y += 7, i++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 12) {
            const yy = y + Math.sin(x * 0.05 + t * 2 + i) * 1.5;
            if (Math.sin(x * 0.13 + i * 1.7 + t) > 0.2) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
          }
          ctx.stroke();
        }
      }
      // light shafts in forest
      if (room.sector === 'forest' && daylight(hour) > 0.3) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const x = w * (0.15 + i * 0.24) + Math.sin(t * 0.3 + i) * 10;
          const a = 0.05 + 0.03 * Math.sin(t * 0.7 + i * 2);
          ctx.fillStyle = `rgba(255,240,180,${a})`;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 90, h * 0.85); ctx.lineTo(x + 40, h * 0.85); ctx.fill();
        }
        ctx.restore();
      }
      if (this.arcane && room.id === 'c_sanctum') {
        const A = this.arcane;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          ctx.strokeStyle = `rgba(170,110,255,${0.35 + 0.2 * Math.sin(t * 2 + k)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(A.x, A.y, A.rx * (1 - k * 0.25), A.ry * (1 - k * 0.25), 0, 0, Math.PI * 2); ctx.stroke();
        }
        for (let i = 0; i < 8; i++) {
          const a = t * 0.6 + (i / 8) * Math.PI * 2;
          ctx.fillStyle = 'rgba(210,160,255,0.8)';
          ctx.fillRect(A.x + Math.cos(a) * A.rx * 0.9 - 2, A.y + Math.sin(a) * A.ry * 0.9 - 2, 4, 4);
        }
        ctx.restore();
      }
      if (room.sector === 'crypt') {
        for (let i = 0; i < 5; i++) {
          const x = ((t * 12 + i * 170) % (w + 300)) - 150;
          const gr = ctx.createRadialGradient(x, h * 0.85, 5, x, h * 0.85, 140);
          gr.addColorStop(0, 'rgba(120,200,150,0.12)');
          gr.addColorStop(1, 'rgba(120,200,150,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(x - 140, h * 0.6, 280, h * 0.4);
        }
      }
      this.spawnAmbient(room, hour, dt);
    }

    spawnAmbient(room, hour, dt) {
      const w = this.w, h = this.h, day = daylight(hour);
      const r = Math.random;
      const P = (o) => this.particles.push({ t: 0, g: 0, ...o });
      if (this.particles.length > 220) return;
      switch (room.sector) {
        case 'sewer': if (r() < dt * 3) P({ x: r() * w, y: 0, vx: 0, vy: 60, g: 400, life: 1.2, color: '#9fc59a', size: 1.5 }); break;
        case 'forest':
          if (day < 0.4 && r() < dt * 4) P({ x: r() * w, y: h * (0.4 + r() * 0.5), vx: (r() - 0.5) * 20, vy: (r() - 0.5) * 20, life: 3, color: '#d8ff7a', size: 2, glow: true, wander: true });
          if (r() < dt * 1.5) P({ x: r() * w, y: -5, vx: 10 + r() * 20, vy: 25, life: 5, color: '#8a9a3a', size: 2.5, leaf: true });
          break;
        case 'field': case 'road':
          if (day > 0.5 && r() < dt * 0.8) P({ x: r() * w, y: h * (0.6 + r() * 0.3), vx: (r() - 0.5) * 30, vy: -5, life: 4, color: ['#ffd1e8', '#fff3a8', '#c6e0ff'][Math.floor(r() * 3)], size: 3, wander: true, butterfly: true });
          if (day < 0.4 && r() < dt * 2) P({ x: r() * w, y: h * (0.55 + r() * 0.4), vx: (r() - 0.5) * 20, vy: (r() - 0.5) * 10, life: 3, color: '#d8ff7a', size: 2, glow: true, wander: true });
          break;
        case 'hills': if (r() < dt * 3) P({ x: -5, y: h * (0.3 + r() * 0.6), vx: 120 + r() * 80, vy: (r() - 0.5) * 10, life: 4, color: '#c8c8b0', size: 1, streak: true }); break;
        case 'cave': if (this.embers && r() < dt * 6) { const L = this.lights[Math.floor(r() * this.lights.length)]; if (L) P({ x: L.x + (r() - 0.5) * 10, y: L.y, vx: (r() - 0.5) * 20, vy: -30 - r() * 40, life: 1.5, color: '#ffb35a', size: 1.5, glow: true }); } break;
        case 'crypt': if (r() < dt * 2) P({ x: r() * w, y: h * (0.3 + r() * 0.5), vx: (r() - 0.5) * 6, vy: -6, life: 4, color: '#a0ffc0', size: 1.5, glow: true }); break;
        case 'city': if (day < 0.5 && r() < dt * 1.5) { const L = this.lights[Math.floor(r() * this.lights.length)]; if (L) P({ x: L.x, y: L.y, vx: (r() - 0.5) * 16, vy: -10, life: 2, color: '#ffe0a0', size: 1.2, glow: true }); } break;
        case 'inside': if (r() < dt * 1) P({ x: r() * w, y: h * (0.2 + r() * 0.5), vx: (r() - 0.5) * 4, vy: 2, life: 5, color: '#fff2d0', size: 1, dust: true }); break;
      }
    }

    /* ---------------------------------------------------------- props, items */
    drawProps(room) {
      const ctx = this.ctx, props = room.items.filter((i) => i.noTake && i.vnum !== 'corpse');
      props.forEach((it, i) => {
        const x = this.w * (0.5 + (i - (props.length - 1) / 2) * 0.16), y = this.baseY - 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.font = `56px ${EMOJI_FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.globalAlpha = 0.95;
        ctx.fillText(it.icon || '▫️', x, y + 4);
        ctx.restore();
        this.hitboxes.push({ x: x - 30, y: y - 56, w: 60, h: 60, type: 'item', ref: it, label: it.short });
      });
    }

    drawItems(room) {
      const ctx = this.ctx, items = room.items.filter((i) => !i.noTake || i.vnum === 'corpse');
      const max = Math.min(items.length, Math.floor((this.w * 0.6) / 28));
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < max; i++) {
        const it = items[i];
        const x = this.w * 0.34 + i * 28, y = this.h * 0.93;
        const hov = this.hover && this.hover.ref === it;
        ctx.fillStyle = hov ? 'rgba(255,220,140,0.25)' : 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y + 8, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.font = `${it.vnum === 'corpse' ? 22 : 18}px ${EMOJI_FONT}`;
        ctx.fillText(it.icon || '📦', x, y + Math.sin(this.now / 600 + i) * 1.2);
        this.hitboxes.push({ x: x - 13, y: y - 13, w: 26, h: 26, type: 'item', ref: it, label: it.short });
      }
      if (items.length > max) { ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = '#ddd'; ctx.fillText(`+${items.length - max}`, this.w * 0.34 + max * 28, this.h * 0.93); }
      ctx.restore();
    }

    /* ---------------------------------------------------------- entities */
    drawEntities(room, dt) {
      const g = this.g, p = g.player, now = this.now, w = this.w;
      const mobs = room.mobs.slice(0, 7);
      const n = mobs.length;
      const pxTarget = n > 4 ? w * 0.14 : w * 0.2;
      // player
      let pv = this.vis.get('player');
      if (!pv) { pv = { x: pxTarget, born: now, lunge: -1e9, flash: -1e9 }; this.vis.set('player', pv); }
      pv.tx = pxTarget;
      // mobs
      const x0 = n > 4 ? w * 0.34 : w * 0.46, x1 = w * 0.9;
      const live = new Set(['player']);
      mobs.forEach((m, i) => {
        const tx = n === 1 ? w * 0.68 : lerp(x0, x1, i / (n - 1));
        let v = this.vis.get(m.uid);
        if (!v) { v = { x: tx, born: now, lunge: -1e9, flash: -1e9 }; this.vis.set(m.uid, v); }
        if (v.x == null) v.x = tx;
        v.tx = tx;
        v.ent = m;
        live.add(m.uid);
      });
      const order = [];
      for (const [id, v] of this.vis) {
        if (id !== 'player' && !live.has(id)) {
          if (v.dying && now - v.dying > 900) { this.vis.delete(id); continue; }
          if (v.leaving && now - v.leaving.t0 > 700) { this.vis.delete(id); continue; }
          if (!v.dying && !v.leaving) { this.vis.delete(id); continue; }
        }
        v.x += (v.tx - v.x) * Math.min(1, dt * (v.fromSide ? 3 : 8));
        order.push([id, v]);
      }
      const target = g.target();
      for (const [id, v] of order) {
        if (id === 'player') this.drawBeing(v, { icon: CLASS_ICON[p.cls] || '🧑', label: p.name, hp: p.hp, maxHp: g.maxHp(), kind: 'player', fighting: p.position === 'fighting', asleep: p.position === 'sleeping', resting: p.position === 'resting', uid: 0, facing: 1 });
        else if (v.ent) {
          const m = v.ent;
          this.drawBeing(v, {
            icon: m.icon, label: m.short.replace(/^(a|an|the) /i, ''), hp: m.hp, maxHp: m.maxHp, kind: m.flags.includes('aggressive') ? 'hostile' : m.flags.includes('shopkeeper') || m.flags.includes('guildmaster') ? 'vendor' : m.flags.includes('peaceful') ? 'peaceful' : 'neutral',
            fighting: m.fighting, targeted: target === m, boss: m.boss, uid: m.uid, ref: m, facing: -1, stunned: m.stunUntil > g.clock,
          });
        }
      }
      if (room.mobs.length > 7) {
        const ctx = this.ctx;
        ctx.font = '600 12px Inter, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
        ctx.fillText(`+${room.mobs.length - 7} more`, w - 10, this.baseY - 70);
      }
    }

    drawBeing(v, e) {
      const ctx = this.ctx, now = this.now;
      const size = e.boss ? 58 : e.kind === 'player' ? 46 : 42;
      let alpha = clamp01((now - v.born) / 400);
      let x = v.x, y = this.baseY, rot = 0;
      const bob = e.asleep ? 0 : Math.sin(now / 420 + e.uid * 1.7) * (e.fighting ? 3 : 1.8);
      const lt = (now - v.lunge) / 260;
      if (lt < 1) x += Math.sin(lt * Math.PI) * 18 * e.facing;
      if (v.dying) { const d = (now - v.dying) / 900; alpha = 1 - d; rot = d * 1.4 * -e.facing; y += d * 10; }
      if (v.leaving) {
        const d = (now - v.leaving.t0) / 700;
        alpha = 1 - d;
        const dir = v.leaving.dir;
        if (dir === 'e') x += d * 120; else if (dir === 'w') x -= d * 120; else y -= dir === 'u' ? d * 20 : -d * 10;
      }
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      // shadow / ground ring
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, size * 0.42, size * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      if (e.targeted || (this.hover && this.hover.ref === e.ref && e.ref)) {
        ctx.strokeStyle = e.targeted ? `rgba(255,90,90,${0.6 + 0.3 * Math.sin(now / 150)})` : 'rgba(255,220,140,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y + 2, size * 0.55, size * 0.17, 0, 0, Math.PI * 2); ctx.stroke();
      }
      const ft = (now - v.flash) / 300;
      if (ft < 1) {
        const gr = ctx.createRadialGradient(x, y - size * 0.5, 2, x, y - size * 0.5, size * 0.8);
        gr.addColorStop(0, `rgba(255,60,60,${0.7 * (1 - ft)})`);
        gr.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(x - size, y - size * 1.4, size * 2, size * 1.8);
      }
      // sprite
      ctx.save();
      ctx.translate(x, y - 2 + bob);
      if (rot) ctx.rotate(rot);
      if (e.asleep || e.stunned) ctx.rotate(e.stunned ? Math.sin(now / 90) * 0.12 : -0.25);
      if (e.facing === 1 && e.kind === 'player') ctx.scale(-1, 1);
      ctx.font = `${size}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (e.boss) { ctx.shadowColor = 'rgba(190,110,255,0.55)'; ctx.shadowBlur = 8; }
      ctx.fillText(e.icon, 0, 4);
      ctx.restore();
      if (e.asleep) { ctx.font = '600 12px Inter, sans-serif'; ctx.fillStyle = '#cfe0ff'; ctx.fillText('z', x + 14, y - size - Math.sin(now / 500) * 4); ctx.fillText('Z', x + 22, y - size - 10 - Math.sin(now / 500 + 1) * 4); }
      if (e.stunned) { ctx.font = `12px ${EMOJI_FONT}`; for (let i = 0; i < 3; i++) { const a = now / 300 + i * 2.1; ctx.fillText('⭐', x + Math.cos(a) * 14 - 6, y - size - 4 + Math.sin(a) * 4); } }
      // hp bar
      if (e.fighting || e.hp < e.maxHp) {
        const bw = Math.max(34, size * 0.9), bx = x - bw / 2, by = y - size - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
        const pct = clamp01(e.hp / e.maxHp);
        ctx.fillStyle = pct > 0.6 ? '#56d364' : pct > 0.3 ? '#e3b341' : '#f85149';
        ctx.fillRect(bx, by, bw * pct, 4);
      }
      // label
      const colors = { player: '#ffd866', hostile: '#ff8a80', neutral: '#e6e6e6', peaceful: '#9be7ff', vendor: '#f6d28d' };
      ctx.font = `600 ${e.boss ? 12 : 11}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = e.label.length > 22 ? e.label.slice(0, 21) + '…' : e.label;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      this.roundRect(x - tw / 2, y + 9, tw, 16, 8);
      ctx.fill();
      ctx.fillStyle = colors[e.kind];
      ctx.fillText(label, x, y + 11);
      ctx.restore();
      if (!v.dying && !v.leaving) this.hitboxes.push({ x: x - size * 0.55, y: y - size - 10, w: size * 1.1, h: size + 36, type: e.kind === 'player' ? 'player' : 'mob', ref: e.ref, label: e.label });
    }

    roundRect(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    /* ---------------------------------------------------------- fx */
    drawProjectiles() {
      const ctx = this.ctx, now = this.now;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.projectiles = this.projectiles.filter((pr) => {
        const t = (now - pr.t0) / pr.dur;
        if (t < 0) return true;
        if (t >= 1) { this.sparkle(pr.x1, pr.y1, pr.color, 18); return false; }
        if (pr.kind === 'lightning bolt' || pr.kind === 'shocking grasp') {
          ctx.strokeStyle = pr.color; ctx.lineWidth = 2.5; ctx.shadowColor = pr.color; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.moveTo(pr.x0, pr.y0);
          const segs = 8;
          for (let i = 1; i <= segs; i++) {
            const k = (i / segs) * Math.min(1, t * 1.5);
            ctx.lineTo(lerp(pr.x0, pr.x1, k), lerp(pr.y0, pr.y1, k) + (i < segs ? (Math.random() - 0.5) * 18 : 0));
          }
          ctx.stroke();
          return true;
        }
        const x = lerp(pr.x0, pr.x1, t), y = lerp(pr.y0, pr.y1, t) - Math.sin(t * Math.PI) * (20 + pr.wob * 3);
        const rad = pr.kind === 'fireball' ? 10 : 5;
        const gr = ctx.createRadialGradient(x, y, 1, x, y, rad * 3);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.3, pr.color);
        gr.addColorStop(1, rgba(pr.color, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, rad * 3, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.8) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.35, t: 0, color: pr.color, size: 2, g: 0, glow: true });
        return true;
      });
      ctx.restore();
    }

    drawParticles(dt) {
      const ctx = this.ctx, t = this.now / 1000;
      this.particles = this.particles.filter((p) => {
        p.t += dt;
        if (p.t >= p.life) return false;
        if (p.wander) { p.vx += (Math.random() - 0.5) * 60 * dt; p.vy += (Math.random() - 0.5) * 60 * dt; }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = Math.min(1, (p.life - p.t) * 2, p.t * 4);
        if (p.leaf) {
          ctx.save(); ctx.translate(p.x + Math.sin(t * 3 + p.life) * 8, p.y); ctx.rotate(t * 2 + p.life);
          ctx.fillStyle = rgba(p.color, a * 0.8); ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
        } else if (p.butterfly) {
          const flap = Math.abs(Math.sin(t * 18 + p.life * 10));
          ctx.fillStyle = rgba(p.color, a);
          ctx.beginPath(); ctx.ellipse(p.x - 2, p.y, 2.5 * flap + 0.5, 2, 0, 0, Math.PI * 2); ctx.ellipse(p.x + 2, p.y, 2.5 * flap + 0.5, 2, 0, 0, Math.PI * 2); ctx.fill();
        } else if (p.streak) {
          ctx.strokeStyle = rgba(p.color, a * 0.25); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 24, p.y); ctx.stroke();
        } else {
          if (p.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; }
          ctx.fillStyle = rgba(p.color, a * (p.dust ? 0.35 : 1));
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.glow ? 1.3 : 1), 0, Math.PI * 2); ctx.fill();
          if (p.glow) {
            ctx.fillStyle = rgba(p.color, a * 0.2);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
        return p.x > -40 && p.x < this.w + 40 && p.y < this.h + 20;
      });
    }

    drawFloaters() {
      const ctx = this.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.floaters = this.floaters.filter((f) => {
        const t = (this.now - f.t0) / f.dur;
        if (t >= 1) return false;
        const y = f.y - ease(t) * 34;
        const s = f.size * (t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, t));
        ctx.globalAlpha = 1 - Math.max(0, (t - 0.6) / 0.4);
        ctx.font = `800 ${s}px Inter, sans-serif`;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, y);
        return true;
      });
      ctx.restore();
    }

    /* ---------------------------------------------------------- picking */
    pick(clientX, clientY) {
      const r = this.c.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      for (let i = this.hitboxes.length - 1; i >= 0; i--) {
        const b = this.hitboxes[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
      }
      return null;
    }
  }

  MUD.Scene = Scene;
  MUD.sceneUtil = { daylight, skyAt, CLASS_ICON };
})(typeof window !== 'undefined' ? window : globalThis);
