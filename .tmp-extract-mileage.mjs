import fs from 'fs';
const p = 'C:/Users/secon/OneDrive/Documents/cloudflare/src/legacy.js';
const s = fs.readFileSync(p, 'utf8');
const out = [];
function snip(label, re, n = 1200) {
  const i = s.search(re);
  out.push(`\n==${label} @${i}==`);
  if (i < 0) {
    out.push('NOT FOUND');
    return;
  }
  out.push(s.slice(i, i + n));
}
snip('ensureInvoiceForOrder', /function ensureInvoiceForOrder/);
snip('openOrder fn', /(?:const|let|var|function)\s+openOrder/);
snip('openNew fn', /(?:const|let|var|function)\s+openNew/);
snip('apiFetch', /(?:async\s+)?function apiFetch|const apiFetch\s*=/);
snip('shopProfileDefaults', /shopProfileDefaults\s*=\s*\{/);
snip('save profile submit', /Business profile saved/);
snip('invoice lines map', /ensureInvoiceForOrder[\s\S]{0,200}lines/);
fs.writeFileSync('C:/Users/secon/OneDrive/Documents/cloudflare/.tmp-mileage-out.txt', out.join('\n'));
console.log('wrote', out.length, 'chunks');
