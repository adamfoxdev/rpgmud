/* ==========================================================================
 * RPG MUD — minimap
 * Draws explored rooms on the player's current level, with doors, stairs and
 * unexplored exits. Click an explored room to auto-walk there.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MUD = root.MUD;
  const { DIRS } = MUD.util;

  const SECTOR_COLOR = {
    city: '#b89a68', inside: '#8a6a4a', sewer: '#5d7a55', road: '#a58a5c', field: '#6fa04e',
    forest: '#3f7a42', hills: '#9a9670', cave: '#8a5f40', crypt: '#7566a8', water: '#4f86b0',
  };

  class Minimap {
    constructor(canvas, game) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.g = game;
      this.cell = 30;
      this.cam = null;
      this.hover = null;
      this.onHover = null;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      if (root.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
      canvas.addEventListener('mousemove', (e) => this.mouse(e));
      canvas.addEventListener('mouseleave', () => { this.hover = null; if (this.onHover) this.onHover(null); });
      canvas.addEventListener('click', (e) => {
        const r = this.roomAt(e);
        if (r && this.g.player.explored.has(r.id) && this.onClick) this.onClick(r);
      });
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    }

    zoom(d) { this.cell = Math.max(16, Math.min(52, this.cell + d * 4)); }

    resize() {
      const r = this.c.getBoundingClientRect();
      this.dpr = Math.min(2, root.devicePixelRatio || 1);
      this.w = Math.max(100, r.width);
      this.h = Math.max(100, r.height);
      this.c.width = Math.round(this.w * this.dpr);
      this.c.height = Math.round(this.h * this.dpr);
    }

    toScreen(x, y) { return [this.w / 2 + (x - this.cam.x) * this.cell, this.h / 2 + (y - this.cam.y) * this.cell]; }

    roomAt(e) {
      if (!this.cam) return null;
      const b = this.c.getBoundingClientRect();
      const mx = e.clientX - b.left, my = e.clientY - b.top;
      const cur = this.g.room();
      const gx = Math.round((mx - this.w / 2) / this.cell + this.cam.x), gy = Math.round((my - this.h / 2) / this.cell + this.cam.y);
      return Object.values(this.g.rooms).find((r) => r.z === cur.z && r.x === gx && r.y === gy && this.known(r)) || null;
    }

    mouse(e) {
      const r = this.roomAt(e);
      this.hover = r;
      this.c.style.cursor = r && this.g.player.explored.has(r.id) ? 'pointer' : 'crosshair';
      if (this.onHover) this.onHover(r, e);
    }

    known(r) {
      const ex = this.g.player.explored;
      if (ex.has(r.id)) return true;
      for (const d of Object.values(r.exits)) if (ex.has(d.to)) return true;
      return false;
    }

    render(now) {
      const g = this.g, ctx = this.ctx, p = g.player;
      if (!p) return;
      const cur = g.room();
      if (!this.cam || this.cam.z !== cur.z) this.cam = { x: cur.x, y: cur.y, z: cur.z };
      this.cam.x += (cur.x - this.cam.x) * 0.15;
      this.cam.y += (cur.y - this.cam.y) * 0.15;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#0d1016';
      ctx.fillRect(0, 0, this.w, this.h);
      // grid dots
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      const c = this.cell;
      const ox = (this.w / 2 - this.cam.x * c) % c, oy = (this.h / 2 - this.cam.y * c) % c;
      for (let x = ox; x < this.w; x += c) for (let y = oy; y < this.h; y += c) ctx.fillRect(x - 1, y - 1, 2, 2);

      const rooms = Object.values(g.rooms).filter((r) => r.z === cur.z && this.known(r));
      const box = Math.max(8, c * 0.52);
      // connections
      ctx.lineCap = 'round';
      for (const r of rooms) {
        if (!p.explored.has(r.id)) continue;
        const [x, y] = this.toScreen(r.x, r.y);
        for (const [d, ex] of Object.entries(r.exits)) {
          const D = DIRS[d];
          if (D.dz) continue;
          const to = g.rooms[ex.to];
          const [tx, ty] = this.toScreen(to.x, to.y);
          const explored = p.explored.has(to.id);
          ctx.strokeStyle = explored ? 'rgba(200,190,160,0.45)' : 'rgba(200,190,160,0.2)';
          ctx.lineWidth = Math.max(1.5, c * 0.08);
          ctx.setLineDash(explored ? [] : [3, 3]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(explored ? tx : (x + tx) / 2, explored ? ty : (y + ty) / 2); ctx.stroke();
          ctx.setLineDash([]);
          if (ex.door) {
            const mx = (x + tx) / 2, my = (y + ty) / 2;
            ctx.strokeStyle = ex.door.locked ? '#f85149' : ex.door.closed ? '#e3953b' : '#7ee787';
            ctx.lineWidth = 3;
            ctx.beginPath();
            if (D.dx) { ctx.moveTo(mx, my - 5); ctx.lineTo(mx, my + 5); } else { ctx.moveTo(mx - 5, my); ctx.lineTo(mx + 5, my); }
            ctx.stroke();
          }
        }
      }
      // rooms
      for (const r of rooms) {
        const [x, y] = this.toScreen(r.x, r.y);
        if (x < -c || y < -c || x > this.w + c || y > this.h + c) continue;
        const explored = p.explored.has(r.id);
        const col = SECTOR_COLOR[r.sector] || '#888';
        if (!explored) {
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.setLineDash([2, 3]);
          ctx.lineWidth = 1;
          ctx.strokeRect(x - box * 0.35, y - box * 0.35, box * 0.7, box * 0.7);
          ctx.setLineDash([]);
          continue;
        }
        const isCur = r.id === cur.id, isHover = this.hover && this.hover.id === r.id;
        ctx.fillStyle = col;
        ctx.globalAlpha = isCur ? 1 : 0.85;
        this.round(x - box / 2, y - box / 2, box, box, box * 0.22);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (r.flags.includes('safe')) { ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.lineWidth = 1; this.round(x - box / 2, y - box / 2, box, box, box * 0.22); ctx.stroke(); }
        if (isHover) { ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; this.round(x - box / 2 - 2, y - box / 2 - 2, box + 4, box + 4, box * 0.3); ctx.stroke(); }
        // stairs
        ctx.fillStyle = '#10131a';
        const s = box * 0.22;
        if (r.exits.u) { ctx.beginPath(); ctx.moveTo(x - box / 2 + 2, y - box / 2 + 2 + s); ctx.lineTo(x - box / 2 + 2 + s, y - box / 2 + 2); ctx.lineTo(x - box / 2 + 2 + s * 2, y - box / 2 + 2 + s); ctx.fill(); }
        if (r.exits.d) { ctx.beginPath(); ctx.moveTo(x + box / 2 - 2 - s * 2, y + box / 2 - 2 - s); ctx.lineTo(x + box / 2 - 2 - s, y + box / 2 - 2); ctx.lineTo(x + box / 2 - 2, y + box / 2 - 2 - s); ctx.fill(); }
        // shop / guild markers
        if (c >= 24 && (MUD.DATA.shops[r.id] || r.id === 't_guild' || r.flags.includes('recall'))) {
          ctx.font = `${Math.round(box * 0.5)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(r.flags.includes('recall') ? '✨' : r.id === 't_guild' ? '📜' : '🪙', x, y + 1);
        }
        if (isCur) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 300);
          ctx.strokeStyle = `rgba(255,216,102,${0.5 + pulse * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, box * 0.75 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, box * 0.16), 0, Math.PI * 2); ctx.fill();
          // creatures in the current room
          r.mobs.slice(0, 6).forEach((m, i) => {
            const a = (i / Math.max(1, Math.min(6, r.mobs.length))) * Math.PI * 2 - Math.PI / 2;
            ctx.fillStyle = m.flags.includes('aggressive') ? '#ff6b6b' : m.flags.includes('peaceful') ? '#74e3ec' : '#ffd866';
            ctx.beginPath(); ctx.arc(x + Math.cos(a) * box * 0.34, y + Math.sin(a) * box * 0.34, 2, 0, Math.PI * 2); ctx.fill();
          });
        }
      }
      // walk path
      if (g.walkPath.length) {
        let [x, y] = this.toScreen(cur.x, cur.y);
        let rr = cur;
        ctx.strokeStyle = 'rgba(255,216,102,0.8)';
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -now / 40;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (const d of g.walkPath) {
          rr = g.rooms[rr.exits[d].to];
          if (rr.z !== cur.z) break;
          [x, y] = this.toScreen(rr.x, rr.y);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // level indicator
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      const lvl = cur.z === 0 ? 'SURFACE' : cur.z > 0 ? `UPPER ${cur.z}` : `DEPTH ${-cur.z}`;
      ctx.fillText(lvl, 8, this.h - 6);
    }

    round(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }

  MUD.Minimap = Minimap;
})(typeof window !== 'undefined' ? window : globalThis);
