import fs from 'node:fs';

const s = fs.readFileSync('src/runtime/legacy.js', 'utf8');
function dump(marker, after = 2500) {
  const i = s.indexOf(marker);
  if (i < 0) {
    console.log('MISSING', marker);
    return;
  }
  console.log(`\n===== ${marker} =====\n`);
  console.log(s.slice(i, i + after));
}
dump('function openCouponForm');
dump('async function saveProfilePatch', 900);
dump('async function saveShopEntity', 1500);
dump('function bindBrandingFeaturesCore', 2000);
dump('data-add-coupon', 800);
