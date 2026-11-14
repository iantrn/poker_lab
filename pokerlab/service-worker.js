
/* =========================================================
   POKERLAB - SERVICE WORKER
   Version : 4.0
   Description : Cache local et fonctionnement hors ligne
   ========================================================= */

"use strict";

const SW_CONFIG = {
    cacheVersion: "v4",
    cachePrefix: "pokerlab-",
    cacheName: "pokerlab-v4",

    localResources: [
        "./",
        "./index.html",
        "./manifest.json",

        "./css/utilities.css",
        "./css/style.css",

        "./js/app.js",

        "./js/core/deck.js",
        "./js/core/evaluator.js",
        "./js/core/game-engine.js",
        "./js/core/poker-rules.js",

        "./js/bots/bot-engine.js",
        "./js/bots/bot-profiles.js",

        "./js/modules/training.js",
        "./js/modules/puzzles.js",
        "./js/modules/lessons.js",
        "./js/modules/game-review.js",

        "./js/components/table.js",
        "./js/components/cards.js",
        "./js/components/navigation.js",
        "./js/components/range-matrix.js",

        "./js/utils/storage.js",
        "./js/utils/helpers.js",

        "./data/ranges/ranges.json",
        "./data/puzzles/puzzles.json",
        "./data/lessons/lessons.json"
    ]
};

/* =========================================================
   1. INSTALLATION
   ========================================================= */

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(SW_CONFIG.cacheName);

            await cache.addAll(SW_CONFIG.localResources);

            console.info("[PokerLab SW] Cache v4 installé.");

            await self.skipWaiting();
        })()
    );
});

/* =========================================================
   2. ACTIVATION
   ========================================================= */

self.addEventListener("activate", event => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();

            const obsoleteCaches = cacheNames.filter(
                cacheName =>
                    cacheName.startsWith(SW_CONFIG.cachePrefix) &&
                    cacheName !== SW_CONFIG.cacheName
            );

            await Promise.all(
                obsoleteCaches.map(cacheName =>
                    caches.delete(cacheName)
                )
            );

            await self.clients.claim();

            console.info(
                "[PokerLab SW] Cache v4 activé. Anciens caches supprimés."
            );
        })()
    );
});

/* =========================================================
   3. GESTION DES REQUÊTES
   ========================================================= */

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const requestURL = new URL(request.url);

    if (requestURL.origin !== self.location.origin) {
        return;
    }

    // Navigation HTML : réseau prioritaire.
    if (request.mode === "navigate") {
        event.respondWith(
            (async () => {
                const cache = await caches.open(SW_CONFIG.cacheName);

                try {
                    const networkResponse = await fetch(request);

                    if (networkResponse && networkResponse.ok) {
                        const indexURL = new URL(
                            "./index.html",
                            self.registration.scope
                        );

                        await cache.put(
                            indexURL.href,
                            networkResponse.clone()
                        );
                    }

                    return networkResponse;

                } catch (error) {
                    console.warn(
                        "[PokerLab SW] Navigation hors ligne."
                    );

                    const cachedPage = await cache.match(
                        request,
                        { ignoreSearch: true }
                    );

                    if (cachedPage) {
                        return cachedPage;
                    }

                    const fallbackURL = new URL(
                        "./index.html",
                        self.registration.scope
                    );

                    const fallbackPage = await cache.match(
                        fallbackURL.href
                    );

                    if (fallbackPage) {
                        return fallbackPage;
                    }

                    return new Response(
                        "PokerLab est temporairement indisponible.",
                        {
                            status: 503,
                            headers: {
                                "Content-Type":
                                    "text/plain; charset=utf-8"
                            }
                        }
                    );
                }
            })()
        );

        return;
    }

    // Autres ressources : cache prioritaire.
    event.respondWith(
        (async () => {
            const cache = await caches.open(SW_CONFIG.cacheName);

            const cachedResponse = await cache.match(request);

            if (cachedResponse) {
                return cachedResponse;
            }

            try {
                const networkResponse = await fetch(request);

                if (networkResponse && networkResponse.ok) {
                    await cache.put(
                        request,
                        networkResponse.clone()
                    );
                }

                return networkResponse;

            } catch (error) {
                console.error(
                    "[PokerLab SW] Ressource inaccessible :",
                    request.url
                );

                return new Response(
                    "Cette ressource n'est pas disponible hors ligne.",
                    {
                        status: 503,
                        headers: {
                            "Content-Type":
                                "text/plain; charset=utf-8"
                        }
                    }
                );
            }
        })()
    );
});
