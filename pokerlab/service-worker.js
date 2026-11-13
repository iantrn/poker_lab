
/* =========================================================
   POKERLAB - SERVICE WORKER
   Version : 1.0
   Description : Gestion du cache et fonctionnement hors ligne
   ========================================================= */

"use strict";


/* =========================================================
   1. CONFIGURATION
   ========================================================= */

const SW_CONFIG = {

    cacheVersion: "v1",

    cachePrefix: "pokerlab-",

    cacheName: "pokerlab-v1",

    tailwindURL: "https://cdn.tailwindcss.com",

    localResources: [
        "./",
        "./index.html",
        "./manifest.json",
        "./css/style.css",
        "./js/app.js"
    ]

};


/* =========================================================
   2. INSTALLATION DU SERVICE WORKER
   ========================================================= */

self.addEventListener("install", (event) => {

    event.waitUntil(

        (async () => {

            try {

                const cache = await caches.open(
                    SW_CONFIG.cacheName
                );

                // Mise en cache des ressources locales.

                await cache.addAll(
                    SW_CONFIG.localResources
                );

                // Tentative de mise en cache de Tailwind CDN.

                try {

                    const tailwindRequest = new Request(
                        SW_CONFIG.tailwindURL,
                        {
                            mode: "no-cors"
                        }
                    );

                    const tailwindResponse = await fetch(
                        tailwindRequest
                    );

                    if (
                        tailwindResponse &&
                        (
                            tailwindResponse.type === "opaque" ||
                            tailwindResponse.ok
                        )
                    ) {

                        await cache.put(
                            tailwindRequest,
                            tailwindResponse
                        );

                    }

                } catch (error) {

                    console.warn(
                        "[PokerLab SW] Impossible de mettre Tailwind en cache :",
                        error
                    );

                }

                console.info(
                    "[PokerLab SW] Installation terminée."
                );

                // Activation immédiate du nouveau service worker.

                await self.skipWaiting();

            } catch (error) {

                console.error(
                    "[PokerLab SW] Échec de l'installation :",
                    error
                );

                throw error;

            }

        })()

    );

});


/* =========================================================
   3. ACTIVATION DU SERVICE WORKER
   ========================================================= */

self.addEventListener("activate", (event) => {

    event.waitUntil(

        (async () => {

            try {

                const cacheNames = await caches.keys();

                const obsoleteCaches = cacheNames.filter(
                    (cacheName) => {

                        return (
                            cacheName.startsWith(
                                SW_CONFIG.cachePrefix
                            ) &&
                            cacheName !== SW_CONFIG.cacheName
                        );

                    }
                );

                // Suppression des anciennes versions du cache.

                await Promise.all(
                    obsoleteCaches.map((cacheName) => {

                        return caches.delete(cacheName);

                    })
                );

                // Prise de contrôle des pages ouvertes.

                await self.clients.claim();

                console.info(
                    "[PokerLab SW] Service Worker activé."
                );

            } catch (error) {

                console.error(
                    "[PokerLab SW] Erreur pendant l'activation :",
                    error
                );

            }

        })()

    );

});


/* =========================================================
   4. GESTION DES REQUÊTES
   ========================================================= */

self.addEventListener("fetch", (event) => {

    const request = event.request;

    // Ignorer les requêtes autres que GET.

    if (request.method !== "GET") {
        return;
    }

    const requestURL = new URL(request.url);

    // Vérifier si la requête concerne Tailwind CDN.

    const isTailwindRequest =
        requestURL.origin === "https://cdn.tailwindcss.com";


    /* -----------------------------------------------------
       4.1. TAILWIND CDN
       Stratégie : Cache First
       ----------------------------------------------------- */

    if (isTailwindRequest) {

        event.respondWith(

            (async () => {

                const cache = await caches.open(
                    SW_CONFIG.cacheName
                );

                const cachedResponse = await cache.match(
                    request
                );

                if (cachedResponse) {
                    return cachedResponse;
                }

                try {

                    const networkResponse = await fetch(request);

                    if (
                        networkResponse &&
                        networkResponse.status === 200
                    ) {

                        const responseClone =
                            networkResponse.clone();

                        await cache.put(
                            request,
                            responseClone
                        );

                    }

                    return networkResponse;

                } catch (error) {

                    console.error(
                        "[PokerLab SW] Tailwind indisponible :",
                        error
                    );

                    return new Response(
                        "Tailwind CSS indisponible hors ligne.",
                        {
                            status: 503,
                            statusText: "Service Unavailable"
                        }
                    );

                }

            })()

        );

        return;

    }


    // Ne pas intercepter les ressources provenant d'autres domaines.

    if (requestURL.origin !== self.location.origin) {
        return;
    }


    /* -----------------------------------------------------
       4.2. NAVIGATION HTML
       Stratégie : Network First
       ----------------------------------------------------- */

    if (request.mode === "navigate") {

        event.respondWith(

            (async () => {

                const cache = await caches.open(
                    SW_CONFIG.cacheName
                );

                try {

                    const networkResponse = await fetch(request);

                    if (
                        networkResponse &&
                        networkResponse.status === 200
                    ) {

                        await cache.put(
                            "./index.html",
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
                        {
                            ignoreSearch: true
                        }
                    );

                    if (cachedPage) {
                        return cachedPage;
                    }

                    const fallbackPage = await cache.match(
                        "./index.html"
                    );

                    if (fallbackPage) {
                        return fallbackPage;
                    }

                    return new Response(
                        "PokerLab est temporairement indisponible.",
                        {
                            status: 503,
                            headers: {
                                "Content-Type": "text/plain; charset=utf-8"
                            }
                        }
                    );

                }

            })()

        );

        return;

    }


    /* -----------------------------------------------------
       4.3. RESSOURCES LOCALES
       Stratégie : Cache First
       ----------------------------------------------------- */

    event.respondWith(

        (async () => {

            const cache = await caches.open(
                SW_CONFIG.cacheName
            );

            const cachedResponse = await cache.match(
                request
            );

            if (cachedResponse) {
                return cachedResponse;
            }

            try {

                const networkResponse = await fetch(request);

                if (
                    networkResponse &&
                    networkResponse.status === 200
                ) {

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
                            "Content-Type": "text/plain; charset=utf-8"
                        }
                    }
                );

            }

        })()

    );

});


/* =========================================================
   5. FIN DU SERVICE WORKER
   ========================================================= */
