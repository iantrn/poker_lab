/**
 * PokerLab Service Worker - v5
 * Gestion du cache offline-first pour GitHub Pages.
 */

const CACHE_NAME = 'pokerlab-cache-v5';
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
    './js/utils/storage.js',
    './js/utils/helpers.js',
    './data/ranges/ranges.json',
    './data/puzzles/puzzles.json',
    './data/lessons/lessons.json'
];

// Installation du Service Worker et mise en cache des assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Mise en cache des fichiers v5');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
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
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        // Mettre en cache la nouvelle ressource si valide
                        if (event.request.method === 'GET' && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
            .catch(() => {
                // Fallback optionnel hors ligne si la ressource n'est pas dans le cache
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
    );
});