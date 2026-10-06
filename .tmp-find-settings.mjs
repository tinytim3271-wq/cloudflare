import fs from 'node:fs';
const s = fs.readFileSync('src/runtime/legacy.js', 'utf8');
for (const marker of ['shopProfileDefaults', 'settings = function', 'id="shop-profile', 'saveProfilePatch', 'laborRate', 'defaultLabor', 'coupons']) {
  let idx = 0, n = 0;
  while ((idx = s.indexOf(marker, idx)) >= 0 && n < 4) {
    console.log('\n==', marker, idx, '==');
    console.log(s.slice(idx, idx + 500));
    idx += marker.length;
    n++;
  }
}
