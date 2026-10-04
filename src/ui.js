// DOM controls: timeline scrubber, playback, camera, settings and keyboard shortcuts.
import { ERAS, EVENTS, START_YEAR, END_YEAR, PRESENT_YEAR, eraAt, clamp, monthOf, FIRE_WINDOW } from './timeline.js';

const $ = id => document.getElementById(id);
const span = END_YEAR - START_YEAR;
const pct = y => ((y - START_YEAR) / span) * 100;

const JUMPS = [[1800, '1800'], [1833, 'Harbor'], [1860, 'Wharves'], [1871.69, 'Fire'], [1905, 'Bascules'], [1930, 'Deco'], [1973, 'Sears'], [2016, 'Riverwalk'], [PRESENT_YEAR, 'Today'], [2050, '2050']];

export class UI {
  constructor(state, cb, presets) {
    this.s = state;
    this.cb = cb;
    this.presets = presets;
    this.lastYearInt = null;
    this.lastEra = null;
    this.buildTimeline();
    this.bindControls();
    this.bindKeys();
    this.syncAll();
  }

  // ---------------- timeline ----------------
  buildTimeline() {
    const eras = $('tl-eras');
    for (const e of ERAS) {
      const d = document.createElement('div');
      d.style.width = `${pct(Math.min(e.to, END_YEAR)) - pct(e.from)}%`;
      d.style.background = e.speculative ? `repeating-linear-gradient(45deg, ${e.color}, ${e.color} 4px, #2f8f6c 4px, #2f8f6c 8px)` : e.color;
      d.title = `${e.name} (${e.from}–${Math.min(Math.floor(e.to), END_YEAR)})`;
      eras.appendChild(d);
    }
    const ticks = $('tl-ticks');
    const tip = document.createElement('div');
    tip.className = 'tl-tooltip';
    tip.hidden = true;
    document.body.appendChild(tip);
    for (const ev of EVENTS) {
      const t = document.createElement('div');
      t.className = 'tick' + (ev.y > PRESENT_YEAR ? ' spec' : '');
      t.style.left = `${pct(ev.y)}%`;
      t.addEventListener('pointerenter', e => { tip.hidden = false; tip.innerHTML = `<b>${Math.floor(ev.y)}</b>${ev.t}`; place(e); });
      t.addEventListener('pointermove', place);
      t.addEventListener('pointerleave', () => { tip.hidden = true; });
      t.addEventListener('pointerdown', e => { e.stopPropagation(); this.seek(ev.y - (ev.y === 1871.77 ? 0.08 : 0.4)); });
      ticks.appendChild(t);
    }
    function place(e) {
      tip.style.left = `${Math.min(e.clientX + 12, innerWidth - 290)}px`;
      tip.style.top = `${e.clientY - 46}px`;
    }
    const scale = $('tl-scale');
    for (let y = START_YEAR; y <= END_YEAR; y += 25) {
      const s = document.createElement('span');
      s.style.left = `${pct(y)}%`;
      s.textContent = y;
      scale.appendChild(s);
    }
    const tl = $('timeline');
    let dragging = false, wasPlaying = false;
    const yearAt = e => {
      const r = tl.getBoundingClientRect();
      return START_YEAR + clamp((e.clientX - r.left) / r.width, 0, 1) * span;
    };
    tl.addEventListener('pointerdown', e => {
      dragging = true; wasPlaying = this.s.playing; this.s.playing = false;
      tl.setPointerCapture(e.pointerId);
      this.seek(yearAt(e));
    });
    tl.addEventListener('pointermove', e => { if (dragging) this.seek(yearAt(e)); });
    const up = () => { if (dragging) { dragging = false; this.s.playing = wasPlaying; this.syncPlay(); } };
    tl.addEventListener('pointerup', up);
    tl.addEventListener('pointercancel', up);

    const jumps = $('jumps');
    for (const [y, name] of JUMPS) {
      const b = document.createElement('button');
      b.textContent = name;
      b.title = `Jump to ${Math.floor(y)}`;
      b.onclick = () => this.seek(y);
      jumps.appendChild(b);
    }
  }

  seek(y) {
    this.cb.onSeek(y);
  }

  // ---------------- buttons & settings ----------------
  bindControls() {
    const s = this.s;
    $('play').onclick = () => this.togglePlay();
    $('back1').onclick = () => this.seek(s.year - 1);
    $('fwd1').onclick = () => this.seek(s.year + 1);
    $('back10').onclick = () => this.seek(s.year - 10);
    $('fwd10').onclick = () => this.seek(s.year + 10);

    this.seg('speed', v => { s.speed = +v; }, () => String(s.speed));
    this.seg('season', v => { s.season = v; }, () => s.season);
    this.seg('quality', v => { s.quality = v; this.cb.onQuality(); }, () => s.quality);
    this.seg('cammode', v => { this.cb.onCamMode(v); this.syncAll(); }, () => s.camMode);

    const tod = $('tod');
    tod.oninput = () => { s.tod = +tod.value; s.autoDay = false; $('autoday').checked = false; };
    $('autoday').onchange = e => { s.autoDay = e.target.checked; };
    $('night-btn').onclick = () => this.toggleNight();

    const checks = { labels: 'labels', traffic: 'traffic', smoke: 'smoke', slow: 'slowEvents', loop: 'loop', shadows: 'shadows', bloom: 'bloom', trails: 'trails' };
    for (const [id, key] of Object.entries(checks)) {
      const el = $(id);
      el.checked = !!s[key];
      el.onchange = () => {
        s[key] = el.checked;
        if (key === 'trails' && el.checked && s.camMode !== 'locked') { this.cb.onCamMode('locked'); this.syncAll(); }
      };
    }

    const presets = $('presets'), sel = $('cam-select');
    Object.entries(this.presets).forEach(([id, p], i) => {
      const b = document.createElement('button');
      b.dataset.v = id;
      b.innerHTML = `${p.name}<kbd>${i + 1}</kbd>`;
      b.onclick = () => { this.cb.onPreset(id); this.syncAll(); };
      presets.appendChild(b);
      const o = document.createElement('option');
      o.value = id; o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.onchange = () => { this.cb.onPreset(sel.value); this.syncAll(); };

    $('settings').onclick = () => { $('panel').hidden = !$('panel').hidden; };
    $('panel-close').onclick = () => { $('panel').hidden = true; };
    $('hide').onclick = () => this.toggleUI();
    $('show-ui').onclick = () => this.toggleUI();
  }

  seg(id, set, get) {
    const root = $(id);
    root.querySelectorAll('button').forEach(b => {
      b.onclick = () => { set(b.dataset.v); this.syncAll(); };
    });
    (this.segs ||= []).push({ root, get });
  }

  bindKeys() {
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
      if (e.target.tagName === 'SELECT') return;
      const s = this.s;
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case ' ': e.preventDefault(); this.togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); this.seek(s.year + step); break;
        case 'ArrowLeft': e.preventDefault(); this.seek(s.year - step); break;
        case 'Home': this.seek(START_YEAR); break;
        case 'End': this.seek(END_YEAR); break;
        case 'h': case 'H': this.toggleUI(); break;
        case 'f': case 'F': this.cb.onCamMode(s.camMode === 'free' ? 'locked' : 'free'); this.syncAll(); break;
        case 'n': case 'N': this.toggleNight(); break;
        case 'l': case 'L': s.labels = !s.labels; this.syncAll(); break;
        default: {
          const i = parseInt(e.key, 10) - 1;
          const ids = Object.keys(this.presets);
          if (i >= 0 && i < ids.length) { this.cb.onPreset(ids[i]); this.syncAll(); }
        }
      }
    });
  }

  togglePlay() {
    const s = this.s;
    if (!s.playing && s.year >= END_YEAR - 0.01) s.year = START_YEAR;
    s.playing = !s.playing;
    this.syncPlay();
  }
  toggleNight() {
    const s = this.s;
    s.autoDay = false;
    s.tod = s.tod > 6.5 && s.tod < 18.5 ? 21 : 10;
    this.syncAll();
  }
  toggleUI() {
    const ui = $('ui');
    ui.classList.toggle('hidden');
    $('show-ui').hidden = !ui.classList.contains('hidden');
  }

  syncPlay() {
    const b = $('play');
    b.textContent = this.s.playing ? '❚❚' : '▶';
    b.classList.toggle('playing', this.s.playing);
  }
  syncAll() {
    const s = this.s;
    for (const { root, get } of this.segs) {
      const v = get();
      root.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    }
    $('presets').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === s.preset));
    $('cam-select').value = s.preset;
    $('labels').checked = s.labels;
    $('autoday').checked = s.autoDay;
    $('trails').checked = s.trails;
    this.syncPlay();
  }

  // ---------------- per-frame ----------------
  update(year, tod) {
    $('tl-handle').style.left = `${pct(year)}%`;
    $('tl-progress').style.width = `${pct(year)}%`;
    const yi = Math.floor(year);
    $('tl-tip').textContent = yi;
    const inFire = year >= FIRE_WINDOW[0] && year < FIRE_WINDOW[1];
    $('month').textContent = inFire ? monthOf(year) : '';
    if (yi !== this.lastYearInt || inFire) {
      this.lastYearInt = yi;
      $('year').textContent = yi;
      const era = eraAt(year);
      if (era !== this.lastEra) {
        this.lastEra = era;
        $('era').textContent = era.name;
        $('era-text').textContent = era.text;
        $('era-dot').style.background = era.color;
        $('era-dot').style.color = era.color;
        $('spec').hidden = !era.speculative;
      }
      const past = EVENTS.filter(e => e.y <= year + 0.01).slice(-4).reverse();
      $('events').innerHTML = past.map(e => `<li class="${year - e.y < 4 ? 'fresh' : ''}"><b>${Math.floor(e.y)}</b><span>${e.t}</span></li>`).join('');
    }
    const h = Math.floor(tod), m = Math.floor((tod - h) * 60);
    const todEl = $('tod');
    if (document.activeElement !== todEl) todEl.value = tod;
    if (this.s.fps) $('fps-val').textContent = `${Math.round(this.s.fps)} fps · ${this.s.quality === 'auto' ? 'auto → ' + this.s.autoQuality : this.s.quality}`;
    $('tod-val').textContent = `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
