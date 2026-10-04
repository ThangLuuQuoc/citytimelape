// Touch (and mouse) gestures on the 3D view.
//  Locked camera: drag sideways = scrub through time, double-tap = play/pause,
//                 two fingers = switch to the free camera (then pinch/drag again).
//  Free camera:   OrbitControls handles drag (orbit), pinch (zoom), two-finger drag (pan);
//                 double-tap still toggles play/pause.
export function bindGestures(el, h) {
  const pts = new Map();
  let scrub = null, lastTap = 0, lastTapX = 0, lastTapY = 0, moved = 0;

  el.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (h.mode() !== 'locked') return;
    if (pts.size === 1) {
      scrub = { x: e.clientX, year: h.year(), wasPlaying: h.playing() };
      el.setPointerCapture?.(e.pointerId);
    } else if (pts.size === 2) {
      // second finger: hand the camera to the user
      if (scrub) { h.setPlaying(scrub.wasPlaying); scrub = null; }
      h.free();
      h.toast('Free camera: drag to orbit · pinch to zoom · two fingers to pan');
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    moved = Math.max(moved, Math.hypot(e.clientX - p.x, e.clientY - p.y));
    if (!scrub || h.mode() !== 'locked') return;
    const dx = e.clientX - scrub.x;
    if (Math.abs(dx) > 6) {
      if (h.playing()) h.setPlaying(false);
      // a full-width swipe moves about 120 years
      h.seek(scrub.year + dx / el.clientWidth * 120);
    }
  });

  const up = (e) => {
    pts.delete(e.pointerId);
    if (scrub && pts.size === 0) {
      if (moved > 6) h.setPlaying(scrub.wasPlaying);
      scrub = null;
    }
    if (moved < 10 && pts.size === 0) {
      const now = performance.now();
      if (now - lastTap < 320 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
        h.togglePlay();
        lastTap = 0;
      } else {
        lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY;
      }
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); scrub = null; });
  // stop the browser from scrolling / zooming the page instead
  el.style.touchAction = 'none';
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
