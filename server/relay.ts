// The cloud relay for Novel Builder's sync. Run it with:  node server/relay.ts
// Options (environment):  PORT=8787  DATA=./relay-data
//
// It keeps one JSON file per account under DATA and speaks the small protocol
// in src/modules/sync/relay.ts. An account is whoever holds a sync key; the
// relay stores a hash of the key, never the key itself. The key's holder can
// invite others into a project with a role; what each role may see and change
// (src/modules/sync/access.ts) is enforced here, on every request. Put it
// behind HTTPS before using it across the internet.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { emptyAccount, relayBackupNow, relayForgetDevice, relayInvitation, relayInvite, relayJoin, relayMember, relayMembers, relayProjects, relaySnapshot, relaySnapshots, relaySync, relayUpdateMember, type RelayAccount } from '../src/modules/sync/relay.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DATA = process.env.DATA ?? './relay-data';
mkdirSync(DATA, { recursive: true });

const accounts = new Map<string, RelayAccount>();
const fileOf = (id: string) => join(DATA, `${id}.json`);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
function load(key: string): { id: string; account: RelayAccount } {
  const id = sha(key);
  if (!accounts.has(id)) accounts.set(id, existsSync(fileOf(id)) ? (JSON.parse(readFileSync(fileOf(id), 'utf8')) as RelayAccount) : emptyAccount());
  return { id, account: accounts.get(id)! };
}
// An invitation names the account it belongs to, so it can be found without the account's key. It never creates one.
function loadById(id: string): RelayAccount | null {
  if (!/^[0-9a-f]{64}$/.test(id)) return null;
  if (!accounts.has(id) && existsSync(fileOf(id))) accounts.set(id, JSON.parse(readFileSync(fileOf(id), 'utf8')) as RelayAccount);
  return accounts.get(id) ?? null;
}
// Written to a temporary file first, so a crash mid-write cannot leave half an account behind.
function save(id: string): void {
  writeFileSync(`${fileOf(id)}.tmp`, JSON.stringify(accounts.get(id)));
  renameSync(`${fileOf(id)}.tmp`, fileOf(id));
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, content-encoding', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };

createServer((req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204, {});
  const url = new URL(req.url ?? '/', 'http://relay');
  if (url.pathname === '/v1/health') return send(200, { ok: true, service: 'novel-builder-relay' });
  const key = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (key.length < 20) return send(401, { error: 'A sync key is required.' });

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks);
      const text = raw.length ? (req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString('utf8') : '{}';
      const body = JSON.parse(text) as Record<string, unknown>;
      const now = Date.now();

      // ---- Someone invited: `m_<account>_<member>_<secret>`. They reach one project, as their role allows, and nothing else.
      if (key.startsWith('m_')) {
        const [, accountId = '', memberId = '', secret = ''] = key.split('_');
        const theirs = loadById(accountId);
        const member = theirs && relayMember(theirs, memberId, sha(secret));
        if (!theirs || !member) return send(403, { error: 'This invitation is not valid, or access has been removed.' });
        if (req.method === 'GET' && url.pathname === '/v1/invite') return send(200, relayInvitation(theirs, member));
        if (req.method === 'POST' && url.pathname === '/v1/join') {
          const joined = relayJoin(member, String(body.name ?? ''), now);
          save(accountId);
          return send(200, { member: joined, ...relayInvitation(theirs, member) });
        }
        if (req.method === 'POST' && url.pathname === '/v1/sync') {
          const result = relaySync(theirs, body as never, now, member);
          save(accountId);
          return send(200, result);
        }
        return send(403, { error: 'Only the owner can do that.' });
      }

      const { id, account } = load(key);
      // ---- The owner manages the team.
      if (req.method === 'POST' && url.pathname === '/v1/members/invite') {
        const [memberId, secret] = [randomUUID(), randomBytes(24).toString('hex')];
        const member = relayInvite(account, { projectId: String(body.projectId ?? ''), role: body.role, name: String(body.name ?? ''), email: String(body.email ?? '') }, memberId, sha(secret), now);
        save(id);
        return send(200, { member, token: `m_${id}_${memberId}_${secret}` });
      }
      if (req.method === 'GET' && url.pathname === '/v1/members') return send(200, { members: relayMembers(account, url.searchParams.get('project') ?? '') });
      if (req.method === 'POST' && url.pathname === '/v1/members/update') {
        const member = relayUpdateMember(account, String(body.memberId ?? ''), { role: body.role, status: body.status });
        save(id);
        return send(200, { member });
      }
      if (req.method === 'POST' && url.pathname === '/v1/sync') {
        const result = relaySync(account, body as never, now);
        save(id);
        return send(200, result);
      }
      if (req.method === 'GET' && url.pathname === '/v1/projects') return send(200, { projects: relayProjects(account), devices: Object.values(account.devices) });
      if (req.method === 'GET' && url.pathname === '/v1/snapshots') return send(200, { snapshots: relaySnapshots(account, url.searchParams.get('project') ?? '') });
      if (req.method === 'GET' && url.pathname === '/v1/snapshot') {
        const state = relaySnapshot(account, url.searchParams.get('project') ?? '', url.searchParams.get('id') ?? '');
        return state ? send(200, { state }) : send(404, { error: 'That backup is not there.' });
      }
      if (req.method === 'POST' && url.pathname === '/v1/backup') {
        const snapshot = relayBackupNow(account, String(body.projectId ?? ''), now);
        save(id);
        return snapshot ? send(200, { snapshot }) : send(404, { error: 'That project is not in the cloud yet.' });
      }
      if (req.method === 'POST' && url.pathname === '/v1/forget-device') {
        relayForgetDevice(account, String(body.deviceId ?? ''));
        save(id);
        return send(200, { ok: true });
      }
      return send(404, { error: 'Not found.' });
    } catch (err) {
      return send(400, { error: err instanceof Error ? err.message : 'Bad request.' });
    }
  });
}).listen(PORT, () => console.log(`Novel Builder relay listening on http://localhost:${PORT} (data in ${DATA})`));
