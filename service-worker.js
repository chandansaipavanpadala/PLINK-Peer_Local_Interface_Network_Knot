/**
 * Aura — Service Worker (Mega-File Optimized)
 * 
 * Implements:
 * 1. Offline-first caching strategy for PWA
 * 2. Stream-to-disk downloads for 5GB+ received files
 *    — Chunks are piped directly to a download response
 *      without ever holding the full file in RAM.
 *
 * ZERO-CLOUD: Once loaded, Aura works with ZERO internet.
 */

const CACHE_NAME = 'aura-cache-v3';

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

// ═══════════════════════════════════════
//  Streaming Download Registry
//  Holds active stream controllers keyed by streamId.
//  The main thread pushes chunks via postMessage,
//  and the fetch handler serves them as a streaming Response.
// ═══════════════════════════════════════

const activeStreams = new Map();

// ─── Install: Cache all critical assets ───

self.addEventListener('install', event => {
    console.log('Aura SW: Installing v3 (streaming support)...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Aura SW: Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: Clean old caches, claim clients ───

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

// ─── Messages from main thread (stream control) ───

self.addEventListener('message', event => {
    const data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'stream-download': {
            // Main thread is starting a large file receive
            // Create a ReadableStream and store its controller
            let controller;
            const stream = new ReadableStream({
                start(c) {
                    controller = c;
                }
            });

            activeStreams.set(data.streamId, {
                stream: stream,
                controller: controller,
                filename: data.filename,
                mime: data.mime || 'application/octet-stream',
                size: data.size
            });

            // Reply that we're ready
            if (event.ports[0]) {
                event.ports[0].postMessage({ type: 'stream-ready' });
            }

            console.log('Aura SW: Stream registered:', data.streamId, data.filename);
            break;
        }

        case 'stream-chunk': {
            // Main thread is pushing a chunk of received data
            const entry = activeStreams.get(data.streamId);
            if (entry && entry.controller) {
                entry.controller.enqueue(new Uint8Array(data.chunk));
            }
            break;
        }

        case 'stream-end': {
            // Main thread says the file is fully received
            const entry = activeStreams.get(data.streamId);
            if (entry && entry.controller) {
                entry.controller.close();
                console.log('Aura SW: Stream completed:', data.streamId);
            }
            // Don't delete from map yet — the fetch handler still needs it
            // It will be cleaned up after the Response is consumed
            break;
        }
    }
});

// ─── Fetch: Cache-first + Stream downloads ───

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // ═══ Stream download handler ═══
    // Intercepts requests to /aura-stream-download/{streamId}
    // and returns a streaming Response piped from the registered ReadableStream
    if (url.pathname.startsWith('/aura-stream-download/')) {
        const streamId = url.pathname.split('/').pop();
        const entry = activeStreams.get(streamId);

        if (entry) {
            const headers = new Headers({
                'Content-Type': entry.mime,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(entry.filename)}"`,
                'Content-Length': entry.size
            });

            const response = new Response(entry.stream, { headers });

            // Clean up the registry after some time
            // (give the browser time to start consuming the stream)
            setTimeout(() => activeStreams.delete(streamId), 60000);

            event.respondWith(response);
            return;
        }
    }

    // ═══ Skip WebSocket / signaling requests ═══
    if (url.pathname.includes('/server/') || url.protocol === 'ws:' || url.protocol === 'wss:') {
        return;
    }

    // ═══ Cache-first strategy for app assets ═══
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) {
                    // Return cached, update in background
                    fetch(event.request)
                        .then(networkResponse => {
                            if (networkResponse && networkResponse.status === 200) {
                                const responseClone = networkResponse.clone();
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                            }
                        })
                        .catch(() => {});

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
