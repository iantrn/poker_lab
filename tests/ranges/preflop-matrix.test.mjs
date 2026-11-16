import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const matrixDirectory = path.join(root, "data/ranges/preflop/matrix");

const index = JSON.parse(
    fs.readFileSync(path.join(matrixDirectory, "index.json"), "utf8")
);
const bundle = JSON.parse(
    fs.readFileSync(path.join(matrixDirectory, "ranges.json"), "utf8")
);

test("l'index des ranges préflop expose les six positions et un catalogue non vide", () => {
    assert.equal(index.version, 1);
    assert.deepEqual(index.positions, ["BB", "BU", "CO", "MP", "SB", "UTG"]);
    assert.ok(Array.isArray(index.spots));
    assert.equal(index.spots.length, 2606);
});

test("le bundle contient exactement une entrée pour chaque spot de l'index", () => {
    assert.equal(bundle.version, 1);
    assert.equal(bundle.source, index.source);
    assert.ok(bundle.ranges && typeof bundle.ranges === "object");
    assert.equal(Array.isArray(bundle.ranges), false);

    const ids = index.spots.map(spot => spot.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(Object.keys(bundle.ranges).length, ids.length);

    for (const id of ids) {
        assert.ok(Object.prototype.hasOwnProperty.call(bundle.ranges, id), `Range absente : ${id}`);
        const range = bundle.ranges[id];
        assert.ok(range && typeof range === "object" && !Array.isArray(range));
        for (const [handClass, frequency] of Object.entries(range)) {
            assert.match(handClass, /^(?:[AKQJT98765432]{2}|[AKQJT98765432]{2}[so])$/);
            assert.ok(Number.isFinite(frequency) && frequency >= 0 && frequency <= 100,
                `Fréquence invalide pour ${id}/${handClass}`);
        }
    }
});

test("les métadonnées des spots sont cohérentes avec les positions publiées", () => {
    const positions = new Set(index.positions);
    for (const spot of index.spots) {
        assert.ok(spot.id && typeof spot.id === "string");
        assert.ok(positions.has(spot.p), `Position inconnue pour ${spot.id}`);
        assert.ok(typeof spot.a === "string" && spot.a.length > 0);
        assert.ok(Number.isFinite(spot.r) && spot.r >= 0 && spot.r <= 100);
    }
});
