import test from 'node:test';
import assert from 'node:assert/strict';
import { convertRangeText } from '../../tools/ranges/convert-artgto.mjs';
import { validateRangeNode } from '../../tools/ranges/validate-range.mjs';

const options = { inputPath: 'UTG_RFI.txt', folderPosition: 'utg', sourceId: 'test-source' };

test('convertit les combos tagués et non tagués sans perdre les fréquences', () => {
    const node = convertRangeText('[50]AsKs, AhKh[/50], AcAd', options);
    assert.equal(node.range.comboFrequencies.AsKs, 0.5);
    assert.equal(node.range.comboFrequencies.AhKh, 0.5);
    assert.equal(node.range.classFrequencies.AKs.frequency, 0.25);
    assert.equal(node.parse.taggedBlocks, 1);
    assert.equal(node.parse.untaggedCombosAssumed100Percent, 1);
    assert.deepEqual(validateRangeNode(node), []);
});

test('une classe de main agrége toutes ses combinaisons physiques', () => {
    const node = convertRangeText('[25]AsKs, AhKh, AdKd, AcKc[/25]', options);
    assert.equal(node.range.classFrequencies.AKs.frequency, 0.25);
    assert.equal(node.range.classFrequencies.AKs.availableCombos, 4);
    assert.equal(node.range.classFrequencies.AKs.possibleCombos, 4);
});

test('un fichier vide représente une range vide sans inventer de combo', () => {
    const node = convertRangeText('\n  ', options);
    assert.equal(node.parse.emptyRange, true);
    assert.equal(Object.keys(node.range.comboFrequencies).length, 0);
    assert.equal(node.range.classFrequencies.AA.frequency, 0);
});

test('refuse les doublons et les fréquences incohérentes', () => {
    assert.throws(() => convertRangeText('AsKs, AsKs', options), /plusieurs fois/);
    assert.throws(() => convertRangeText('[25]AsKs[\/30]', options), /différentes/);
    assert.throws(() => convertRangeText('[125]AsKs[/125]', options), /Fréquence/);
});

test('refuse une combinaison physique invalide', () => {
    assert.throws(() => convertRangeText('AsAs', options), /Carte dupliquée/);
    assert.throws(() => convertRangeText('AxKs', options), /Combinaison invalide/);
});
