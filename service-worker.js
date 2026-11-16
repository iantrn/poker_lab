/**
 * PokerLab Service Worker - v40
 * Cache offline-first, avec bundle complet des ranges préflop.
 */

const CACHE_NAME = "pokerlab-cache-v40";
const CACHE_PREFIX = "pokerlab-cache-";

const ASSETS_TO_CACHE = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/style.css",
    "./css/utilities.css",
    "./js/app.js",
    "./js/core/deck.js",
    "./js/core/poker-rules.js",
    "./js/core/evaluator.js",
    "./js/core/game-engine.js",
    "./js/bots/bot-engine.js",
    "./js/bots/bot-profiles.js",
    "./js/components/cards.js",
    "./js/components/table.js",
    "./js/components/navigation.js",
    "./js/components/range-matrix.js",
    "./js/modules/ranges-data.js",
    "./js/modules/ranges-viewer.js",
    "./js/modules/training.js",
    "./js/modules/postflop-solver.js",
    "./js/modules/postflop-strategy.js",
    "./js/modules/postflop-solver-ui.js",
    "./js/modules/puzzles.js",
    "./js/modules/lessons.js",
    "./js/modules/game-review.js",
    "./data/ranges/ranges.json",
    "./data/ranges/preflop/catalog/index.json",
    "./data/ranges/preflop/matrix/index.json",
    "./data/puzzles/puzzles.json",
    "./data/lessons/lessons.json"
];

// Généré par tools/ranges/build-matrix.mjs.
// Facultatif pendant le développement, indispensable pour l'offline complet des ranges.
const OPTIONAL_ASSETS_TO_CACHE = [
    "./data/ranges/preflop/matrix/ranges.json"
];

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Les ressources essentielles doivent toutes être disponibles.
        // Une erreur fait échouer l'installation plutôt que de publier un cache incomplet.
        await cache.addAll(ASSETS_TO_CACHE);

        // Le bundle est facultatif tant que le script de génération n'a pas été exécuté.
        await Promise.all(OPTIONAL_ASSETS_TO_CACHE.map(async asset => {
            try {
                await cache.add(asset);
            } catch (error) {
                console.warn("[PokerLab SW] Bundle offline non précaché :", asset, error);
            }
        }));

        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();

        await Promise.all(cacheNames.map(cacheName => {
            // Ne jamais supprimer les caches d'autres applications sur la même origine.
            if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                return caches.delete(cacheName);
            }
            return Promise.resolve();
        }));

        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const requestUrl = new URL(request.url);
    const scopeUrl = new URL(self.registration.scope);

    // Le Service Worker ne traite que les requêtes de son propre périmètre.
    if (
        requestUrl.origin !== scopeUrl.origin ||
        !requestUrl.pathname.startsWith(scopeUrl.pathname)
    ) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Navigation : privilégier la version publiée, avec fallback offline.
        if (request.mode === "navigate") {
            try {
                const response = await fetch(request);

                if (response && response.status === 200 && response.type === "basic") {
                    await cache.put(request, response.clone());
                }

                return response;
            } catch (error) {
                const cachedPage = await cache.match(request);
                if (cachedPage) return cachedPage;

                const appShellUrl = new URL("./index.html", scopeUrl).href;
                const appShell = await cache.match(appShellUrl);
                if (appShell) return appShell;

                throw error;
            }
        }

        // Ressources statiques et données : Cache-First, puis réseau avec mise en cache.
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        const response = await fetch(request);

        if (response && response.status === 200 && response.type === "basic") {
            await cache.put(request, response.clone());
        }

        return response;
    })());
});
