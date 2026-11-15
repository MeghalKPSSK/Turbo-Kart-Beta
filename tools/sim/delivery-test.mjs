// Delivery check: docs/ is what GitHub Pages serves, public/ is where assets are authored.
// Fails when any file in public/ is missing from docs/ or differs from its copy there, which
// means `npm run build` has not been run since an asset changed.
//   node tools/sim/delivery-test.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'public');
const delivery = join(root, 'docs');

function* walk(folder) {
    for (const name of readdirSync(folder)) {
        const path = join(folder, name);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (name !== '.DS_Store') yield path;
    }
}
const hash = (path) => createHash('sha1').update(readFileSync(path)).digest('hex');

const problems = [];
let count = 0;
for (const path of walk(source)) {
    count += 1;
    const name = relative(source, path);
    const copy = join(delivery, name);
    if (!existsSync(copy)) problems.push(`missing from docs/: ${name}`);
    else if (hash(path) !== hash(copy)) problems.push(`differs in docs/: ${name}`);
}
if (problems.length) {
    console.log(problems.join('\n'));
    console.log(`\n${problems.length} of ${count} delivered files are out of date. Run "npm run build".`);
    process.exit(1);
}
console.log(`docs/ matches public/ (${count} files)`);
