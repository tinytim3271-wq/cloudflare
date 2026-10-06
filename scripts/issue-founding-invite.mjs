import { randomBytes } from 'node:crypto';

const issuedTo = process.argv.slice(2).join(' ').trim() || 'unspecified';
const token = randomBytes(4).toString('hex');
const issuedAt = new Date().toISOString();
const sql = `INSERT INTO founding_invites (token, issued_to, issued_at) VALUES ('${token}', '${issuedTo.replaceAll("'", "''")}', '${issuedAt}');`;

console.log(`Invite: /founding?invite=${token}`);
console.log('Apply it to the shop database, then send only that link:');
console.log(`npx wrangler d1 execute DB --remote --command "${sql}"`);
