// Service worker: кэш оболочки приложения (cache-first).
// Запросы к docs.google.com (сама таблица) сюда НЕ попадают — их кэширует
// отдельно sheet.js через localStorage, чтобы контролировать свежесть данных.

const CACHE_NAME = 'cc-shell-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './model.js',
  './sheet.js',
  './app.js',
  './sw-register.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Никогда не кэшировать обращения к Google Таблице — данные должны быть свежими,
  // офлайн-резерв для них делает sheet.js через localStorage.
  if (url.hostname === 'docs.google.com' || url.hostname === 'docs.googleusercontent.com') {
    return;
  }

  if (event.request.method !== 'GET') return;

  // Google Fonts — тоже не трогаем (сеть сама решит, кэш браузера справится).
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
