/**
 * PokerLab Service Worker - v7
 * Gestion du cache offline-first pour GitHub Pages.
 * Version incrémentée pour forcer le rechargement des nouvelles ressources.
 */

const CACHE_NAME = 'pokerlab-cache-v7';
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

// Installation du Service Worker et mise en cache des assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Mise en cache des fichiers v6');
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
    // Ne pas intercepter les requêtes vers d'autres domaines
    if (!event.request.url.includes(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((networkResponse) => {
                    // Ne pas mettre en cache les requêtes POST ou les erreurs
                    if (event.request.method !== 'GET' || networkResponse.status !== 200) {
                        return networkResponse;
                    }

                    return caches.open(CACHE_NAME).then((cache) => {
                        // Mettre en cache la nouvelle ressource
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
            .catch(() => {
                // Fallback pour les pages de navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                // Fallback pour les autres ressources
                return caches.match('./index.html');
            })
    );
});