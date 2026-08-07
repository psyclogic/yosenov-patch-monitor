import crypto from 'node:crypto';

const projectId = process.env.FIREBASE_PROJECT_ID;
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!projectId || !rawServiceAccount) throw new Error('FIREBASE_PROJECT_ID dan FIREBASE_SERVICE_ACCOUNT wajib diisi.');
const service = JSON.parse(rawServiceAccount);
service.private_key = service.private_key.replace(/\\n/g, '\n');

function base64url(input) { return Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url'); }
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const claim = base64url({ iss: service.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const unsigned = `${header}.${claim}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), service.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  if (!response.ok) throw new Error(`OAuth gagal: ${await response.text()}`);
  return (await response.json()).access_token;
}
function decodeField(field) {
  if (!field) return '';
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? field.booleanValue ?? '';
}
function encodeField(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value ?? '') };
}
async function main() {
  const token = await getAccessToken();
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const listRes = await fetch(`${base}/games?pageSize=300`, { headers: { authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(await listRes.text());
  const docs = (await listRes.json()).documents || [];
  console.log(`Menemukan ${docs.length} game.`);
  for (const [index, document] of docs.entries()) {
    const appId = decodeField(document.fields?.appId) || document.name.split('/').at(-1);
    try {
      const infoRes = await fetch(`https://api.steamcmd.net/v1/info/${appId}`, { headers: { 'User-Agent': 'YOSENOV-Patch-Monitor/1.0' } });
      const info = await infoRes.json();
      const app = info?.data?.[appId];
      const branch = app?.depots?.branches?.public;
      if (!branch?.buildid) throw new Error('Build publik tidak ditemukan');
      const fields = {
        remoteBuildId: encodeField(branch.buildid),
        latestPatchAt: encodeField(branch.timeupdated ? new Date(Number(branch.timeupdated) * 1000).toISOString() : ''),
        syncedAt: encodeField(new Date().toISOString()),
        updatedAt: encodeField(new Date().toISOString())
      };
      const masks = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
      const patchRes = await fetch(`https://firestore.googleapis.com/v1/${document.name}?${masks}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type':'application/json' }, body: JSON.stringify({ fields }) });
      if (!patchRes.ok) throw new Error(await patchRes.text());
      console.log(`[${index + 1}/${docs.length}] ${appId} -> build ${branch.buildid}`);
    } catch (error) { console.error(`[${index + 1}/${docs.length}] ${appId}: ${error.message}`); }
    await new Promise(r => setTimeout(r, 250));
  }
}
main().catch(error => { console.error(error); process.exit(1); });
