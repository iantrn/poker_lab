
/* =========================================================
   POKERLAB - BOT PROFILES
   Définition des personnalités et difficultés des bots
   ========================================================= */

(function () {
    "use strict";

    /**
     * Profils comportementaux des adversaires.
     *
     * Les fréquences sont exprimées en pourcentage.
     */
    const PROFILES = {
        nit: {
            id: "nit",
            name: "Nit",
            description: "Joueur extrêmement serré, qui sélectionne uniquement les meilleures mains.",
            characteristics: [
                "Très sélectif préflop",
                "Peu de bluffs",
                "Abandonne facilement sans une bonne main"
            ],
            stats: {
                vpip: 14,
                pfr: 11,
                threeBet: 4,
                aggression: 1.5,
                foldToThreeBet: 75,
                continuationBet: 55,
                bluffFrequency: 8,
                foldToBet: 65,
                showdownFrequency: 30
            }
        },

        tag: {
            id: "tag",
            name: "TAG",
            description: "Joueur serré-agressif qui privilégie les mains solides et l'agression.",
            characteristics: [
                "Sélection rigoureuse des mains",
                "Relances fréquentes avec de bonnes mains",
                "Agressivité maîtrisée postflop"
            ],
            stats: {
                vpip: 22,
                pfr: 19,
                threeBet: 7,
                aggression: 2.8,
                foldToThreeBet: 65,
                continuationBet: 70,
                bluffFrequency: 18,
                foldToBet: 48,
                showdownFrequency: 28
            }
        },

        lag: {
            id: "lag",
            name: "LAG",
            description: "Joueur large-agressif qui joue beaucoup de mains et met la pression.",
            characteristics: [
                "Large sélection de mains",
                "Relances et sur-relances fréquentes",
                "Nombreux bluffs et semi-bluffs"
            ],
            stats: {
                vpip: 32,
                pfr: 27,
                threeBet: 11,
                aggression: 4.0,
                foldToThreeBet: 48,
                continuationBet: 78,
                bluffFrequency: 32,
                foldToBet: 35,
                showdownFrequency: 25
            }
        },

        balanced: {
            id: "balanced",
            name: "Balanced",
            description: "Joueur équilibré qui cherche à varier ses décisions et à éviter les tendances prévisibles.",
            characteristics: [
                "Range de mains diversifiée",
                "Alternance entre value bets et bluffs",
                "Adaptation à la situation"
            ],
            stats: {
                vpip: 25,
                pfr: 21,
                threeBet: 8,
                aggression: 3.0,
                foldToThreeBet: 58,
                continuationBet: 68,
                bluffFrequency: 25,
                foldToBet: 45,
                showdownFrequency: 27
            }
        }
    };

    /**
     * Niveaux de difficulté.
     *
     * decisionNoise : variabilité des décisions.
     * mistakeRate : fréquence des erreurs volontaires.
     * bluffAdjustment : ajustement de la fréquence de bluff.
     * adaptation : capacité à tenir compte du jeu adverse.
     */
    const DIFFICULTIES = {
        easy: {
            id: "easy",
            name: "Débutant",
            description: "Un adversaire accessible qui commet régulièrement des erreurs.",
            decisionNoise: 25,
            mistakeRate: 25,
            bluffAdjustment: -10,
            adaptation: 0
        },

        medium: {
            id: "medium",
            name: "Intermédiaire",
            description: "Un adversaire plus cohérent qui applique des stratégies de base.",
            decisionNoise: 12,
            mistakeRate: 10,
            bluffAdjustment: 0,
            adaptation: 1
        },

        hard: {
            id: "hard",
            name: "Avancé",
            description: "Un adversaire discipliné qui prend des décisions plus réfléchies.",
            decisionNoise: 4,
            mistakeRate: 2,
            bluffAdjustment: 5,
            adaptation: 2
        }
    };

    /**
     * Récupère un profil comportemental.
     *
     * @param {string} profileId Identifiant du profil.
     * @returns {Object|null}
     */
    function getProfile(profileId) {
        const profile = PROFILES[profileId];

        if (!profile) {
            return null;
        }

        return JSON.parse(JSON.stringify(profile));
    }

    /**
     * Récupère un niveau de difficulté.
     *
     * @param {string} difficultyId Identifiant de difficulté.
     * @returns {Object|null}
     */
    function getDifficulty(difficultyId) {
        const difficulty = DIFFICULTIES[difficultyId];

        if (!difficulty) {
            return null;
        }

        return JSON.parse(JSON.stringify(difficulty));
    }

    /**
     * Retourne la liste des profils disponibles.
     */
    function getAllProfiles() {
        return Object.keys(PROFILES).map(id => getProfile(id));
    }

    /**
     * Retourne la liste des difficultés disponibles.
     */
    function getAllDifficulties() {
        return Object.keys(DIFFICULTIES).map(id => getDifficulty(id));
    }

    /**
     * Vérifie l'existence d'un profil.
     */
    function hasProfile(profileId) {
        return Object.prototype.hasOwnProperty.call(
            PROFILES,
            profileId
        );
    }

    /**
     * Vérifie l'existence d'une difficulté.
     */
    function hasDifficulty(difficultyId) {
        return Object.prototype.hasOwnProperty.call(
            DIFFICULTIES,
            difficultyId
        );
    }

    // API publique de PokerLab.
    window.PokerLabBotProfiles = {
        PROFILES,
        DIFFICULTIES,
        getProfile,
        getDifficulty,
        getAllProfiles,
        getAllDifficulties,
        hasProfile,
        hasDifficulty
    };

})();
