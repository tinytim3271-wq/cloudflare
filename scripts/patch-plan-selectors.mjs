import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/runtime/legacy.js');
let s = fs.readFileSync(file, 'utf8');
const before = s;

const oldSelect = '<option value="starter">Starter</option><option value="growth">Growth</option>';
const newSelect = '<option value="starter">Starter · $49</option><option value="shop">Shop · $149</option><option value="pro">Pro · $299</option><option value="enterprise">Enterprise · Custom</option>';

if (!s.includes(oldSelect)) {
  if (s.includes('Shop · $149')) {
    console.log('Plan selectors already updated');
    process.exit(0);
  }
  throw new Error('Could not find legacy Growth plan selectors');
}

s = s.split(oldSelect).join(newSelect);
fs.writeFileSync(file, s);
console.log('Updated plan selectors, count', before.split(oldSelect).length - 1);
