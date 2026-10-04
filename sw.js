// Service worker: makes the time-lapse installable and usable offline.
// App files: network-first (updates show up immediately), cached copy when offline.
// three.js from the CDN and Google Fonts: cache-first (they're versioned / immutable).
const VERSION = 'v2';
const SHELL = `ctl-shell-${VERSION}`;
const RUNTIME = `ctl-runtime-${VERSION}`;

const SHELL_FILES = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  ...['main', 'timeline', 'geo', 'geom', 'materials', 'city', 'landmarks', 'nature', 'life', 'waterfront', 'ui', 'touch'].map(f => `./src/${f}.js`),
];
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const CDN_FILES = [
  'build/three.module.js',
  'examples/jsm/controls/OrbitControls.js', 'examples/jsm/objects/Sky.js',
  'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/postprocessing/AfterimagePass.js',
  'examples/jsm/postprocessing/OutputPass.js', 'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/MaskPass.js', 'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/shaders/CopyShader.js', 'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/AfterimageShader.js', 'examples/jsm/shaders/OutputShader.js',
  'examples/jsm/renderers/CSS2DRenderer.js', 'examples/jsm/utils/BufferGeometryUtils.js',
].map(p => THREE + p);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES);
    // best effort: a CDN hiccup must not block installation
    const rt = await caches.open(RUNTIME);
    await Promise.all(CDN_FILES.map(u => rt.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('ctl-') && key !== SHELL && key !== RUNTIME) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      }
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    })());
  }
});
