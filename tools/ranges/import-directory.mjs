#!/usr/bin/env node
/** Convertit récursivement les TXT d'un dossier par position en JSON normalisés + catalogue. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertRangeText } from './convert-artgto.mjs';

function argsOf(argv) {
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

async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await walk(fullPath));
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) files.push(fullPath);
    }
    return files.sort();
}

export async function importDirectory(inputDir, outputDir, sourceId = 'unverified-source') {
    const files = await walk(inputDir);
    const datasets = [];
    const errors = [];
    for (const inputPath of files) {
        const relative = path.relative(inputDir, inputPath);
        const folderPosition = path.basename(path.dirname(inputPath)).toLowerCase();
        const filename = path.basename(inputPath, path.extname(inputPath));
        const outputRelative = path.join('normalized', folderPosition, `${filename}.json`).split(path.sep).join('/');
        const outputPath = path.join(outputDir, outputRelative);
        try {
            const raw = await fs.readFile(inputPath, 'utf8');
            const node = convertRangeText(raw, { inputPath, folderPosition, sourceId });
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, `${JSON.stringify(node, null, 2)}\n`, 'utf8');
            datasets.push({
                id: `${folderPosition}/${filename}`,
                status: 'pending-review',
                file: path.join(outputDir, outputRelative).split(path.sep).join('/').replace(/^\.\//, ''),
                game: { format: 'unknown', tableSize: null, effectiveStackBB: null },
                spot: {
                    actorPosition: node.spot.actorCode,
                    actionCode: node.spot.actionCode,
                    sequenceKey: null,
                    originalFilename: node.spot.originalFilename
                },
                sourceId
            });
        } catch (error) {
            errors.push({ file: relative, error: error.message });
        }
    }
    const catalog = {
        schemaVersion: 1,
        status: datasets.length ? 'pending-review' : 'empty-awaiting-datasets',
        datasets
    };
    const catalogPath = path.join(outputDir, 'catalog', 'index.json');
    await fs.mkdir(path.dirname(catalogPath), { recursive: true });
    await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    return { filesFound: files.length, converted: datasets.length, failed: errors.length, errors, catalogPath };
}

async function main() {
    const args = argsOf(process.argv.slice(2));
    if (!args['input-dir'] || !args['output-dir']) {
        console.error('Usage: node tools/ranges/import-directory.mjs --input-dir ./private-source/ranges --output-dir ./private-ranges --source-id artgto-personal-archive');
        process.exitCode = 2;
        return;
    }
    const result = await importDirectory(args['input-dir'], args['output-dir'], args['source-id']);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(`[ranges] ${error.message}`); process.exitCode = 1; });
}
