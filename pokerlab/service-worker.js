/**
 * PokerLab Service Worker - v11
 * Gestion du cache offline-first pour GitHub Pages.
 * Version incrémentée pour forcer le rechargement des nouvelles ressources.
 */

const CACHE_NAME = 'pokerlab-cache-v11';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './css/utilities.css',
    './js/app.js',
    './js/core/deck.js',
    './js/core/poker-rules.js',
    './js/core/evaluator.js',
    './js/core/game-engine.js',
    './js/bots/bot-engine.js',
    './js/bots/bot-profiles.js',
    './js/components/cards.js',
    './js/components/table.js',
    './js/components/navigation.js',
    './js/components/range-matrix.js',
    './js/modules/training.js',
    './js/modules/puzzles.js',
    './js/modules/lessons.js',
    './js/modules/game-review.js',
    './data/ranges/ranges.json',
    './data/puzzles/puzzles.json',
    './data/lessons/lessons.json'
];

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Installation du Service Worker et mise en cache des assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Mise en cache des fichiers v11');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[Service Worker] Erreur lors de la mise en cache:', error);
            })
    );
});

// Activation et nettoyage des anciens caches obsolètes
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Suppression de l\'ancien cache :', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Stratégie Cache-First avec fallback réseau
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            // Network-first: deployed HTML/JS/CSS updates are never hidden by stale cache entries.
            const response = await fetch(event.request);
            if (response && response.status === 200 && response.type !== 'opaque') {
                await cache.put(event.request, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
                const appShell = await caches.match('./index.html');
                if (appShell) return appShell;
            }
            throw error;
        }
    })());
});
