/**
 * Aura — Service Worker
 * Implements offline-first caching strategy.
 * 
 * ZERO-CLOUD: Once loaded, Aura works with ZERO internet connection.
 * All assets are cached locally on first visit.
 */

const CACHE_NAME = 'aura-cache-v2';

const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'src/ui/styles.css',
    'src/core/events.js',
    'src/core/file-chunker.js',
    'src/core/file-digester.js',
    'src/core/aura-connection-manager.js',
    'src/core/p2p-transfer.js',
    'src/core/bluetooth-discovery.js',
    'src/ui/components.js',
    'src/ui/clipboard.js',
    'sounds/blop.mp3',
    'sounds/blop.ogg',
    'images/favicon-96x96.png',
    'images/icon-192x192.png',
    'images/icon-512x512.png',
    'images/apple-touch-icon.png',
    'images/aura-logo.png',
    'manifest.json'
];

// ─── Install: Cache all critical assets ───

self.addEventListener('install', event => {
    console.log('Aura SW: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Aura SW: Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: Clean old caches ───

self.addEventListener('activate', event => {
    console.log('Aura SW: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('Aura SW: Clearing old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ─── Fetch: Cache-first strategy ───
// Serve from cache if available, fall back to network.
// This ensures the app works completely offline.

self.addEventListener('fetch', event => {
    // Skip WebSocket requests
    if (event.request.url.includes('/server/')) return;

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) {
                    // Return cached version, but also update cache in background
                    const fetchPromise = fetch(event.request)
                        .then(networkResponse => {
                            if (networkResponse && networkResponse.status === 200) {
                                const responseClone = networkResponse.clone();
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                            }
                            return networkResponse;
                        })
                        .catch(() => cached);

                    return cached;
                }
                // Not in cache — fetch from network
                return fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return networkResponse;
                    });
            })
    );
});
