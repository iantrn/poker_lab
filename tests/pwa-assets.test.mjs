import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("le manifest déclare des icônes PNG aux dimensions attendues", () => {
    const expected = new Map([
        ["./assets/icons/icon-192.png", [192, 192]],
        ["./assets/icons/icon-512.png", [512, 512]],
        ["./assets/icons/apple-touch-icon.png", [180, 180]]
    ]);

    for (const icon of manifest.icons) {
        assert.ok(expected.has(icon.src), `Icône inattendue : ${icon.src}`);
        assert.equal(icon.type, "image/png");
        assert.deepEqual(
            icon.sizes.split("x").map(Number),
            expected.get(icon.src)
        );

        const file = fs.readFileSync(path.join(root, icon.src.replace(/^\.\//, "")));
        assert.ok(file.length > 100, `Icône vide ou trop petite : ${icon.src}`);
        assert.deepEqual(
            [...file.subarray(0, 8)],
            [137, 80, 78, 71, 13, 10, 26, 10],
            `Signature PNG invalide : ${icon.src}`
        );
        assert.equal(file.readUInt32BE(16), expected.get(icon.src)[0]);
        assert.equal(file.readUInt32BE(20), expected.get(icon.src)[1]);
    }

    assert.equal(expected.size, manifest.icons.length);
});

test("le Service Worker précache les ressources offline indispensables", () => {
    assert.match(serviceWorker, /const CACHE_NAME = "pokerlab-cache-v57";/);

    for (const asset of [
        "./assets/icons/icon-192.png",
        "./assets/icons/icon-512.png",
        "./assets/icons/apple-touch-icon.png",
        "./data/lessons/lessons.json",
        "./data/puzzles/puzzles.json",
        "./data/ranges/preflop/matrix/index.json",
        "./data/ranges/preflop/matrix/ranges.json"
    ]) {
        assert.ok(serviceWorker.includes(`"${asset}"`), `Ressource absente du précache : ${asset}`);
    }

    assert.match(serviceWorker, /await cache\.addAll\(ASSETS_TO_CACHE\)/);
    assert.doesNotMatch(serviceWorker, /OPTIONAL_ASSETS_TO_CACHE/);
});
