import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = fs.readFileSync(path.join(root, "frontend/vite.config.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "frontend/src/app.ts"), "utf8");
const icons = [...vite.matchAll(/\{ src: "(assets\/icons\/[^"]+)", sizes: "(\d+x\d+)", type: "image\/png" \}/g)]
  .map(match => ({ src: match[1], sizes: match[2], type: "image/png" }));

function decodePng(file) {
    const chunks = [];
    let offset = 8;
    while (offset < file.length) {
        const length = file.readUInt32BE(offset);
        const type = file.toString("ascii", offset + 4, offset + 8);
        const data = file.subarray(offset + 8, offset + 8 + length);
        chunks.push({ type, data });
        offset += 12 + length;
        if (type === "IEND") break;
    }

    const ihdr = chunks.find(chunk => chunk.type === "IHDR").data;
    const palette = chunks.find(chunk => chunk.type === "PLTE").data;
    const compressed = Buffer.concat(chunks.filter(chunk => chunk.type === "IDAT").map(chunk => chunk.data));
    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    const bitDepth = ihdr[8];
    const colorType = ihdr[9];
    const pixels = inflateSync(compressed);

    return { width, height, bitDepth, colorType, palette, pixels };
}

test("V2-generated PWA manifest uses valid icons of the expected dimensions", () => {
  const expected = new Map([
    ["assets/icons/icon-192.png", [192, 192]],
    ["assets/icons/icon-512.png", [512, 512]],
    ["assets/icons/apple-touch-icon.png", [180, 180]]
  ]);
  assert.equal(icons.length, expected.size);
  for (const icon of icons) {
    assert.ok(expected.has(icon.src), "Unexpected icon " + icon.src);
    assert.equal(icon.type, "image/png");
    assert.deepEqual(icon.sizes.split("x").map(Number), expected.get(icon.src));
    const file = fs.readFileSync(path.join(root, icon.src));
    assert.ok(file.length > 100, "Missing icon content: " + icon.src);
    assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(file.readUInt32BE(16), expected.get(icon.src)[0]);
    assert.equal(file.readUInt32BE(20), expected.get(icon.src)[1]);
    const decoded = decodePng(file);
    assert.equal(decoded.width, expected.get(icon.src)[0]);
    assert.equal(decoded.height, expected.get(icon.src)[1]);
    assert.equal(decoded.bitDepth, 4);
    assert.equal(decoded.colorType, 3);
    assert.ok(decoded.palette.length >= 3);
    const rowBytes = 1 + Math.ceil(decoded.width * decoded.bitDepth / 8);
    assert.equal(decoded.pixels.length, rowBytes * decoded.height);
    for (let y = 0; y < decoded.height; y++) {
      const row = y * rowBytes;
      assert.equal(decoded.pixels[row], 0);
      for (let x = 0; x < decoded.width; x++) {
        const packed = decoded.pixels[row + 1 + Math.floor(x / 2)];
        const paletteIndex = x % 2 === 0 ? packed >> 4 : packed & 0x0f;
        assert.ok(paletteIndex < decoded.palette.length / 3);
      }
    }
  }
});

test("V2 Workbox precache and its service worker registration are declared consistently", () => {
  assert.match(vite, /VitePWA\(\{/);
  assert.match(vite, /filename: "service-worker[.]js"/);
  assert.match(vite, /manifestFilename: "manifest[.]webmanifest"/);
  assert.match(vite, /globPatterns: \["\*\*\/\*\.\{html,js,css,wasm,json,svg,png\}"\]/);
  assert.match(vite, /navigateFallback: "index[.]html"/);
  assert.match(vite, /cleanupOutdatedCaches: true/);
  assert.match(app, /navigator[.]serviceWorker[.]register\("\.\/service-worker[.]js"/);
  assert.match(vite, /const sourceDirs = \["assets", "data"\]/);
});
