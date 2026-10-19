// Inventories browser-saved Ported2Browser catalogue pages. No network access.
//
// Simulation (default):
//   npm run discover:p2b -- --input page-1.html --input page-2.html
// Optional local JSON output:
//   npm run discover:p2b -- --input snapshots/ --output imports/ported2browser/discovery.json

import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, extname, resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import {parseCatalogSnapshots} from '../src/lib/importer/ported2browserHtml';

const argv = process.argv.slice(2).filter((value) => value !== '--');
const values = (name: string) => argv.flatMap((value, index) => (value === `--${name}` && argv[index + 1] ? [argv[index + 1]] : []));
const option = (name: string) => values(name).at(-1);
const inputs = values('input');

if (inputs.length === 0 || argv.includes('--help')) {
  console.log('Usage : npm run discover:p2b -- --input <fichier-ou-dossier> [--input ...] [--output inventaire.json]');
  process.exit(inputs.length ? 0 : 1);
}

const files = inputs.flatMap((input) => {
  const path = resolve(input);
  if (!existsSync(path)) throw new Error(`Entrée introuvable : ${path}`);
  if (statSync(path).isFile()) return [path];
  return readdirSync(path)
    .filter((name) => ['.html', '.htm'].includes(extname(name).toLowerCase()))
    .map((name) => resolve(path, name));
});

const result = parseCatalogSnapshots(files.map((source) => ({source, html: readFileSync(source, 'utf8')})));
const broken = result.entries.filter((entry) => entry.broken).length;
const alerts = result.entries.filter((entry) => entry.alert).length;

console.log(`Ported2Browser — découverte locale\n  fichiers ${files.length} · pages ${result.pagesSeen.join(', ') || 'inconnues'}\n  déclarées ${result.declaredTotal ?? 'inconnu'} · uniques ${result.entries.length} · doublons de snapshots ${result.duplicateIds.length}\n  liens signalés cassés ${broken} · alertes ${alerts}\n  inventaire complet ${result.complete ? 'OUI' : 'NON'}`);

const output = option('output');
if (output) {
  const target = resolve(output);
  mkdirSync(dirname(target), {recursive: true});
  writeFileSync(target, `${JSON.stringify({source: 'Ported2Browser', discoveredAt: new Date().toISOString(), ...result}, null, 2)}\n`);
  console.log(`  sortie ${target}`);
} else {
  console.log('Simulation : aucun fichier écrit.');
}

if (!result.complete) process.exitCode = 2;
