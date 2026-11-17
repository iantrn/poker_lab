#!/usr/bin/env node
/**
 * Génère les fichiers compacts utilisés par la matrice de ranges de l'application.
 *
 * Entrée  : JSON normalisés produits par import-directory.mjs (normalized/<position>/*.json)
 * Sortie  : <output-dir>/index.json              -> index des spots
 *           <output-dir>/ranges.json             -> bundle complet des 2 606 matrices
 * Les anciennes copies <position>/<spot>.json sont redondantes et ne
 * sont plus générées. Les identifiants de spots restent inchangés.
 *
 * Usage :
 *   node tools/ranges/build-matrix.mjs --input-dir ./private-ranges/normalized --output-dir ./data/ranges/preflop/matrix
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BU', 'BTN', 'SB', 'BB']);

function argsOf(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (!argv[i].startsWith('--')) continue;
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) throw new Error(`Valeur manquante pour ${argv[i]}`);
        args[argv[i].slice(2)] = value;
        i += 1;
    }
    return args;
}

function round(value) {
    return Math.round(value * 100) / 100;
}

/** "BB_call_vs_UTG_RFI_MP_3bet" -> { hero: "BB", action: "call", sequence: "UTG RFI › MP 3bet" } */
export function parseSpotName(name) {
    const tokens = name.replace(/\.txt$/i, '').split('_');
    const hero = tokens[0];
    const vsIndex = tokens.indexOf('vs');
    const actionTokens = tokens.slice(1, vsIndex === -1 ? tokens.length : vsIndex);
    const steps = [];
    if (vsIndex !== -1) {
        for (const token of tokens.slice(vsIndex + 1)) {
            if (POSITIONS.has(token) || !steps.length) steps.push([token]);
            else steps[steps.length - 1].push(token);
        }
    }
    return {
        hero,
        action: actionTokens.join('_') || 'RFI',
        sequence: steps.map(step => step.join(' ')).join(' › ')
    };
}

async function main() {
    const args = argsOf(process.argv.slice(2));
    if (!args['input-dir'] || !args['output-dir']) {
        console.error('Usage: node tools/ranges/build-matrix.mjs --input-dir ./private-ranges/normalized --output-dir ./data/ranges/preflop/matrix');
        process.exitCode = 2;
        return;
    }
    const inputDir = args['input-dir'];
    const outputDir = args['output-dir'];
    const spots = [];
    const compactRanges = {};
    await fs.mkdir(outputDir, { recursive: true });
    const folders = (await fs.readdir(inputDir, { withFileTypes: true })).filter(entry => entry.isDirectory());
    for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
        const files = (await fs.readdir(path.join(inputDir, folder.name))).filter(file => file.endsWith('.json')).sort();
        for (const file of files) {
            const node = JSON.parse(await fs.readFile(path.join(inputDir, folder.name, file), 'utf8'));
            const id = path.basename(file, '.json');
            const classes = node.range?.classFrequencies || {};
            const matrix = {};
            let totalCombos = 0;
            for (const [hand, info] of Object.entries(classes)) {
                const frequency = info?.frequency || 0;
                const possible = info?.possibleCombos || 0;
                totalCombos += frequency * possible;
                if (frequency > 0) matrix[hand] = round(frequency * 100);
            }
            compactRanges[`${folder.name}/${id}`] = matrix;
            const parsed = parseSpotName(node.spot?.originalFilename || id);
            spots.push({
                id: `${folder.name}/${id}`,
                p: folder.name.toUpperCase(),
                a: parsed.action,
                s: parsed.sequence,
                r: round((totalCombos / 1326) * 100)
            });
        }
    }
    const index = {
        version: 1,
        source: 'artgto-personal-archive',
        positions: [...new Set(spots.map(spot => spot.p))],
        actions: [...new Set(spots.map(spot => spot.a))],
        spots
    };
    await fs.writeFile(path.join(outputDir, 'index.json'), JSON.stringify(index));
    const rangeBundle = {
        version: 1,
        source: 'artgto-personal-archive',
        ranges: compactRanges
    };
    const bundlePath = path.join(outputDir, 'ranges.json');
    await fs.writeFile(bundlePath, JSON.stringify(rangeBundle));
    const bundleStats = await fs.stat(bundlePath);
    console.log(JSON.stringify({
        spots: spots.length,
        bundledRanges: Object.keys(compactRanges).length,
        bundleBytes: bundleStats.size,
        positions: index.positions,
        actions: index.actions
    }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-matrix.mjs')) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
