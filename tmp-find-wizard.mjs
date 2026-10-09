import { readFileSync } from 'node:fs';
const text = readFileSync('tmp-old-app.js', 'utf8');
const paths = [...text.matchAll(/src\/[A-Za-z0-9_./-]+\.js/g)].map(match => match[0]);
const unique = [...new Set(paths)].sort();
console.log(unique.join('\n'));
console.log('\ncount', unique.length);
