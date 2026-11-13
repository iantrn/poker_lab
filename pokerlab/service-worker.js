
/* =========================================================
   POKERLAB - SERVICE WORKER
   Version : 2.0
   Description : Cache local et fonctionnement hors ligne
   ========================================================= */

"use strict";


/* =========================================================
   1. CONFIGURATION
   ========================================================= */

const SW_CONFIG = {

    cacheVersion: "v2",

    cachePrefix: "pokerlab-",

    cacheName: "pokerlab-v2",

    // Ressources nécessaires au fonctionnement de PokerLab.
    localResources: [

        // Application principale
        "./",
        "./index.html",
        "./manifest.json",

        // Feuilles de style
        "./css/utilities.css",
        "./css/style.css",

        // JavaScript principal
        "./js/app.js",

        // Moteur de poker
        "./js/core/deck.js",
        "./js/core/evaluator.js",
        "./js/core/game-engine.js",
        "./js/core/poker-rules.js",

        // Intelligence artificielle
        "./js/bots/bot-engine.js",
        "./js/bots/bot-profiles.js",

        // Modules
        "./js/modules/training.js",
        "./js/modules/puzzles.js",
        "./js/modules/lessons.js",
        "./js/modules/game-review.js",

        // Composants
        "./js/components/table.js",
        "./js/components/cards.js",
        "./js/components/navigation.js",
        "./js/components/range-matrix.js",

        // Utilitaires
        "./js/utils/storage.js",
        "./js/utils/helpers.js",

        // Données locales
        "./data/ranges/ranges.json",
        "./data/puzzles/puzzles.json",
        "./data/lessons/lessons.json"

    ]

};


/* =========================================================
   2. INSTALLATION
   ========================================================= */

self.addEventListener("install", (event) => {

    event.waitUntil(

        (async () => {

            try {

                const cache = await caches.open(
                    SW_CONFIG.cacheName
                );

                // Préchargement de toutes les ressources locales.
                await cache.addAll(
                    SW_CONFIG.localResources
                );

                console.info(
                    "[PokerLab SW] Toutes les ressources locales sont en cache."
                );

                // Activation immédiate.
                await self.skipWaiting();

                console.info(
                    "[PokerLab SW] Installation terminée."
                );

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
   3. ACTIVATION
   ========================================================= */

self.addEventListener("activate", (event) => {

    event.waitUntil(

        (async () => {

            try {

                const cacheNames = await caches.keys();

                // Identifier les anciennes versions de PokerLab.
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

                // Supprimer les anciens caches.
                await Promise.all(

                    obsoleteCaches.map((cacheName) => {

                        console.info(
                            "[PokerLab SW] Suppression de l'ancien cache :",
                            cacheName
                        );

                        return caches.delete(cacheName);

                    })

                );

                // Prendre immédiatement le contrôle des pages.
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

    // Ignorer les requêtes qui ne sont pas GET.
    if (request.method !== "GET") {
        return;
    }

    const requestURL = new URL(request.url);

    // Ignorer les requêtes externes.
    if (requestURL.origin !== self.location.origin) {
        return;
    }


    /* -----------------------------------------------------
       4.1. NAVIGATION HTML
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

                    // Mettre à jour la page en cache si elle est valide.
                    if (
                        networkResponse &&
                        networkResponse.ok
                    ) {

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

                    // Essayer d'abord la page demandée.
                    const cachedPage = await cache.match(
                        request,
                        {
                            ignoreSearch: true
                        }
                    );

                    if (cachedPage) {
                        return cachedPage;
                    }

                    // Sinon, retourner la page d'accueil.
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
       4.2. RESSOURCES LOCALES
       Stratégie : Cache First
       ----------------------------------------------------- */

    event.respondWith(

        (async () => {

            const cache = await caches.open(
                SW_CONFIG.cacheName
            );

            // Vérifier d'abord le cache.
            const cachedResponse = await cache.match(
                request
            );

            if (cachedResponse) {
                return cachedResponse;
            }

            try {

                // Si la ressource n'est pas en cache,
                // essayer de la récupérer sur le réseau.
                const networkResponse = await fetch(request);

                // Mettre en cache les réponses valides.
                if (
                    networkResponse &&
                    networkResponse.ok
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
