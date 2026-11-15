#!/usr/bin/env node
/**
 * Convertit un fichier texte ART/GTO en nœud JSON PokerLab.
 * Le convertisseur conserve les fréquences au niveau des 1 326 combos physiques.
 * Les 169 classes sont des agrégats dérivés et ne remplacent jamais les combos.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const RANKS = '23456789TJQKA';
const RANKS_DESC = [...RANKS].reverse();
const SUITS = 'cdhs';
const POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BU', 'BTN', 'SB', 'BB']);

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (!argv[i].startsWith('--')) continue;
        const key = argv[i].slice(2);
        const value = argv[i + 1];
        if (!value || value.startsWith('--')) throw new Error(`Valeur manquante pour --${key}`);
        args[key] = value;
        i += 1;
    }
    return args;
}

function canonicalCombo(raw) {
    const value = raw.trim();
    if (!/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(value)) {
        throw new Error(`Combinaison invalide : "${raw}"`);
    }
    const cards = [value.slice(0, 2), value.slice(2, 4)];
    if (cards[0] === cards[1]) throw new Error(`Carte dupliquée dans ${value}`);
    const rankIndex = card => RANKS.indexOf(card[0]);
    cards.sort((a, b) => rankIndex(b) - rankIndex(a) || SUITS.indexOf(a[1]) - SUITS.indexOf(b[1]));
    return cards.join('');
}

function handClass(combo) {
    const a = combo.slice(0, 2);
    const b = combo.slice(2, 4);
    const ra = a[0];
    const rb = b[0];
    if (ra === rb) return `${ra}${rb}`;
    const [high, low] = RANKS.indexOf(ra) > RANKS.indexOf(rb) ? [ra, rb] : [rb, ra];
    return `${high}${low}${a[1] === b[1] ? 's' : 'o'}`;
}

function allHandClasses() {
    const result = [];
    for (const rank of RANKS_DESC) result.push(`${rank}${rank}`);
    for (let i = 0; i < RANKS_DESC.length; i += 1) {
        for (let j = i + 1; j < RANKS_DESC.length; j += 1) {
            result.push(`${RANKS_DESC[i]}${RANKS_DESC[j]}s`);
            result.push(`${RANKS_DESC[i]}${RANKS_DESC[j]}o`);
        }
    }
    return result;
}

function parseTextRange(text) {
    const source = text.replace(/^\uFEFF/, '').trim();
    const comboFrequencies = {};
    const occupied = new Set();
    const segments = [];
    const blockPattern = /\[(\d+(?:\.\d+)?)\]([\s\S]*?)\[\/(\d+(?:\.\d+)?)\]/g;
    let cursor = 0;
    let match;
    let blockCount = 0;

    while ((match = blockPattern.exec(source)) !== null) {
        const [, openText, body, closeText] = match;
        if (Number(openText) !== Number(closeText)) {
            throw new Error(`Fréquences d'ouverture/fermeture différentes : ${openText} / ${closeText}`);
        }
        if (Number(openText) < 0 || Number(openText) > 100) {
            throw new Error(`Fréquence hors intervalle [0,100] : ${openText}`);
        }
        segments.push({ text: source.slice(cursor, match.index), frequency: 100, untagged: true });
        segments.push({ text: body, frequency: Number(openText), untagged: false });
        cursor = blockPattern.lastIndex;
        blockCount += 1;
    }
    segments.push({ text: source.slice(cursor), frequency: 100, untagged: true });

    if (source.includes('[') || source.includes(']')) {
        const residue = source.replace(blockPattern, '');
        if (residue.includes('[') || residue.includes(']')) {
            throw new Error('Bloc de fréquence mal formé ou balise non reconnue.');
        }
    }

    let untaggedComboCount = 0;
    for (const segment of segments) {
        const tokens = segment.text.split(',').map(token => token.trim()).filter(Boolean);
        for (const token of tokens) {
            const combo = canonicalCombo(token);
            if (occupied.has(combo)) throw new Error(`Combinaison présente plusieurs fois : ${combo}`);
            occupied.add(combo);
            comboFrequencies[combo] = segment.frequency / 100;
            if (segment.untagged) untaggedComboCount += 1;
        }
    }

    const classes = Object.fromEntries(allHandClasses().map(key => [key, []]));
    for (const [combo, frequency] of Object.entries(comboFrequencies)) {
        classes[handClass(combo)].push(frequency);
    }
    const classFrequencies = {};
    for (const [key, values] of Object.entries(classes)) {
        const totalCombos = key.length === 2 ? 6 : (key.endsWith('s') ? 4 : 12);
        const sum = values.reduce((acc, value) => acc + value, 0);
        classFrequencies[key] = {
            frequency: sum / totalCombos,
            min: values.length === totalCombos ? Math.min(...values) : 0,
            max: values.length ? Math.max(...values) : 0,
            availableCombos: values.length,
            possibleCombos: totalCombos,
            nonZeroCombos: values.filter(value => value > 0).length
        };
    }

    return {
        comboFrequencies,
        classFrequencies,
        statistics: {
            taggedBlocks: blockCount,
            listedCombos: occupied.size,
            untaggedCombosAssumed100Percent: untaggedComboCount,
            emptyRange: occupied.size === 0,
            missingCombos: 1326 - occupied.size
        }
    };
}

function describeFilename(filePath, folderPosition) {
    const filename = path.basename(filePath, path.extname(filePath));
    const tokens = filename.split('_');
    const actorCode = tokens[0] || null;
    const actionTokens = tokens[1] === 'RFI' ? ['RFI'] :
        (['3bet', '4bet', '5bet', '6bet'].includes(tokens[1])
            ? tokens.slice(1, tokens[2] === 'small' ? 3 : 2)
            : (tokens[1] ? [tokens[1]] : []));
    return {
        id: filename,
        originalFilename: path.basename(filePath),
        folderPosition: folderPosition || null,
        actorCode,
        actorPositionRecognized: POSITIONS.has(actorCode),
        actionCode: actionTokens.join('_') || null,
        filenameTokens: tokens
    };
}

export function convertRangeText(text, options = {}) {
    const parsed = parseTextRange(text);
    return {
        schemaVersion: 2,
        recordType: 'preflop-range-node',
        status: 'unreviewed',
        game: {
            format: options.format || 'unknown',
            tableSize: options.tableSize ? Number(options.tableSize) : null,
            effectiveStackBB: options.effectiveStackBB ? Number(options.effectiveStackBB) : null
        },
        spot: describeFilename(options.inputPath || 'unnamed.txt', options.folderPosition),
        range: {
            encoding: 'sparse-physical-combo-frequency',
            frequencyUnit: 'fraction',
            defaultFrequency: 0,
            untaggedComboFrequency: 1,
            comboFrequencies: parsed.comboFrequencies,
            classFrequencies: parsed.classFrequencies
        },
        provenance: {
            sourceId: options.sourceId || 'unverified-source',
            sourceName: options.sourceName || null,
            sourceFile: path.basename(options.inputPath || 'unnamed.txt'),
            sourceTermsStatus: options.termsStatus || 'not-reviewed-for-this-use',
            redistributionAllowed: null,
            notes: 'Les combinaisons non encadrées dans le TXT sont interprétées à 100 %. Cette convention doit être confirmée par la documentation de la source.'
        },
        parse: parsed.statistics
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.input || !args.output) {
        console.error('Usage: node tools/ranges/convert-artgto.mjs --input fichier.txt --output fichier.json [--folder-position UTG] [--source-id artgto-personal-archive]');
        process.exitCode = 2;
        return;
    }
    const raw = await fs.readFile(args.input, 'utf8');
    const result = convertRangeText(raw, {
        inputPath: args.input,
        folderPosition: args['folder-position'],
        sourceId: args['source-id'],
        sourceName: args['source-name'],
        termsStatus: args['terms-status'],
        format: args.format,
        tableSize: args['table-size'],
        effectiveStackBB: args['effective-stack-bb']
    });
    await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
    await fs.writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ output: args.output, ...result.parse }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
    main().catch(error => {
        console.error(`[ranges] ${error.message}`);
        process.exitCode = 1;
    });
}
