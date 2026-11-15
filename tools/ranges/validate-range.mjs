#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const CLASS_PATTERN = /^(?:[AKQJT98765432]{2}|[AKQJT98765432][AKQJT98765432][so])$/;

export function validateRangeNode(node) {
    const errors = [];
    if (node?.schemaVersion !== 2) errors.push('schemaVersion doit être 2.');
    if (node?.recordType !== 'preflop-range-node') errors.push('recordType invalide.');
    if (!node?.spot?.id) errors.push('spot.id manquant.');
    if (node?.range?.encoding !== 'sparse-physical-combo-frequency') errors.push('Encodage de range non reconnu.');
    const combos = node?.range?.comboFrequencies;
    if (!combos || typeof combos !== 'object' || Array.isArray(combos)) {
        errors.push('range.comboFrequencies doit être un objet.');
        return errors;
    }
    if (Object.keys(combos).length > 1326) errors.push('Plus de 1 326 combinaisons.');
    const seen = new Set();
    for (const [combo, frequency] of Object.entries(combos)) {
        if (!/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(combo)) errors.push(`Format de combo invalide : ${combo}`);
        else {
            const cards = [combo.slice(0, 2), combo.slice(2, 4)];
            if (cards[0] === cards[1]) errors.push(`Carte dupliquée : ${combo}`);
            for (const card of cards) {
                if (!RANKS.includes(card[0]) || !SUITS.includes(card[1])) errors.push(`Carte inconnue : ${card}`);
            }
            if (seen.has(combo)) errors.push(`Combo dupliqué : ${combo}`);
            seen.add(combo);
        }
        if (typeof frequency !== 'number' || !Number.isFinite(frequency) || frequency < 0 || frequency > 1) {
            errors.push(`Fréquence hors intervalle [0,1] : ${combo}`);
        }
    }
    const classes = node?.range?.classFrequencies;
    if (!classes || typeof classes !== 'object') errors.push('range.classFrequencies manquant.');
    else {
        for (const [key, value] of Object.entries(classes)) {
            if (!CLASS_PATTERN.test(key)) errors.push(`Classe de main invalide : ${key}`);
            if (typeof value?.frequency !== 'number' || value.frequency < 0 || value.frequency > 1) {
                errors.push(`Fréquence agrégée invalide : ${key}`);
            }
        }
    }
    if (!node?.provenance?.sourceId) errors.push('provenance.sourceId manquant.');
    if (node?.provenance?.redistributionAllowed !== null && typeof node?.provenance?.redistributionAllowed !== 'boolean') {
        errors.push('provenance.redistributionAllowed doit être booléen ou null.');
    }
    return errors;
}

async function main() {
    const file = process.argv[2];
    if (!file) {
        console.error('Usage: node tools/ranges/validate-range.mjs fichier.json');
        process.exitCode = 2;
        return;
    }
    const node = JSON.parse(await fs.readFile(file, 'utf8'));
    const errors = validateRangeNode(node);
    if (errors.length) {
        console.error(errors.map(error => `- ${error}`).join('\n'));
        process.exitCode = 1;
        return;
    }
    console.log(`OK — ${path.basename(file)} (${Object.keys(node.range.comboFrequencies).length}/1326 combos listés).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
