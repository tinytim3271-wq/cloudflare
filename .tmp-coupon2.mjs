import fs from 'node:fs';
const s = fs.readFileSync('src/runtime/legacy.js', 'utf8');
for (const marker of ['data-edit-coupon', 'Add coupon', 'openCouponForm(', 'bindCoupon', 'coupons }', 'saveProfilePatch({ coupons']) {
  let idx = 0; let n = 0;
  while ((idx = s.indexOf(marker, idx)) >= 0 && n < 5) {
    console.log(`\n--- ${marker} @ ${idx} ---\n`);
    console.log(s.slice(idx, idx + 600));
    idx += marker.length; n += 1;
  }
}
