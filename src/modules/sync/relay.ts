/**
 * The cloud relay's logic, with nothing in it but data in and data out. The
 * same code runs behind the small server in `server/relay.ts` and inside the
 * tests. It imports only the access rules (which import nothing), by their
 * full file name, so Node can run it as it is.
 *
 * The relay is deliberately simple-minded. It stores rows it is given and
 * numbers every change; it never merges, never decides between two versions
 * and never looks inside a row. A change is accepted only if the device
 * sending it had seen the latest version of that row; otherwise it is
 * refused and the device sorts it out with its author. Nothing a device has
 * not asked to change is ever changed.
 *
 * The one thing it does judge is who is asking. The holder of the sync key
 * is the owner. Anyone else comes in on an invitation, with a role, and for
 * them the relay applies the access rules to every row in both directions:
 * they are sent only what their role may see, and a change their role may
 * not make is refused, whatever their copy of the app says.
 */
import { isRole, refusal, visible, type Role } from './access.ts';

export interface RelayRow {
  /** `table:id`. */
  key: string;
  /** The row, or null when it was deleted. */
  row: Record<string, unknown> | null;
  /** The number of the change that produced this version. Higher is later. */
  seq: number;
  /** Which device made it, and when the relay received it. */
  deviceId: string;
  at: number;
  /** Set when this is sent because of what the receiver may now see, rather than because the row moved on: it is to be taken even if its number is not new. */
  force?: boolean;
}

export interface RelayDevice {
  id: string;
  name: string;
  lastSyncAt: number;
  /** A collaborator's device, listed so that changes can be put to a name. Not one of the owner's own. */
  member?: boolean;
}

/** Someone invited into one project. */
export interface RelayMember {
  id: string;
  projectId: string;
  role: Role;
  name: string;
  email: string;
  /** A hash of the secret half of their invitation. The secret itself is never stored. */
  secretHash: string;
  status: 'invited' | 'active' | 'revoked';
  createdAt: number;
  joinedAt: number | null;
  lastSyncAt: number | null;
  /** What they have been sent: the version of each row they hold. */
  served: Record<string, number>;
  devices: Record<string, true>;
}
export type RelayMemberInfo = Omit<RelayMember, 'secretHash' | 'served' | 'devices'>;

export interface RelaySnapshot {
  id: string;
  at: number;
  /** The change number it was taken at. */
  seq: number;
  rows: number;
  title: string;
}

export interface RelayProject {
  id: string;
  title: string;
  seq: number;
  updatedAt: number;
  rows: Record<string, RelayRow>;
  snapshots: (RelaySnapshot & { state: Record<string, Record<string, unknown>> })[];
}

export interface RelayAccount {
  devices: Record<string, RelayDevice>;
  projects: Record<string, RelayProject>;
  members?: Record<string, RelayMember>;
}

export interface SyncRequest {
  deviceId: string;
  deviceName: string;
  projectId: string;
  /** The last change number this device has taken in. */
  cursor: number;
  /** What the device wants to change. `baseSeq` is the version of the row it started from (0 for a new row). */
  changes: { key: string; row: Record<string, unknown> | null; baseSeq: number }[];
  /** The device cannot be sure it received everything sent to it before (a first sync, or the last one failed): send it all again. */
  resync?: boolean;
}

export interface SyncResponse {
  /** Changes made by anyone since `cursor`, oldest first, before this request's own. */
  remote: RelayRow[];
  /** The sender's changes that went in, with their new numbers. */
  accepted: { key: string; seq: number }[];
  /** The sender's changes that were refused because the row had moved on. They come back as `remote` next time. */
  rejected: string[];
  cursor: number;
  devices: RelayDevice[];
  /** The sender's changes their role does not allow, each with the reason. Nothing was changed by them. */
  denied?: { key: string; reason: string }[];
  /** Who the relay takes the sender to be, when they came in on an invitation. */
  member?: { id: string; role: Role; name: string };
}

/** A backup is taken when this many changes, or this much time, have gone by since the last one. */
export const SNAPSHOT_EVERY = { changes: 200, ms: 6 * 60 * 60 * 1000, keep: 20 };

export const emptyAccount = (): RelayAccount => ({ devices: {}, projects: {} });

const titleOf = (project: RelayProject): string => {
  const row = project.rows[`projects:${project.id}`]?.row;
  return typeof row?.title === 'string' ? row.title : project.title;
};

function takeSnapshot(project: RelayProject, now: number): void {
  const state: Record<string, Record<string, unknown>> = {};
  for (const [key, entry] of Object.entries(project.rows)) if (entry.row) state[key] = entry.row;
  project.snapshots.push({ id: `${project.id}-${project.seq}`, at: now, seq: project.seq, rows: Object.keys(state).length, title: titleOf(project), state });
  // The oldest go first, but one from each end is always kept.
  while (project.snapshots.length > SNAPSHOT_EVERY.keep) project.snapshots.splice(1, 1);
}

/**
 * What a collaborator is to be sent: every row their role may see that they
 * do not hold the current version of, and a removal for every row they hold
 * that is no longer theirs to see (it was deleted, unpublished, or their
 * role changed). Private fields are blanked on the way out.
 */
function memberView(project: RelayProject, member: RelayMember): RelayRow[] {
  const lookup = (key: string) => project.rows[key]?.row ?? null;
  const out: RelayRow[] = [];
  for (const entry of Object.values(project.rows)) {
    const view = visible(member.role, member.id, entry.key, entry.row, lookup);
    const held = member.served[entry.key];
    if (view) {
      if (held === entry.seq) continue;
      out.push({ ...entry, row: view, force: true });
      member.served[entry.key] = entry.seq;
    } else if (held !== undefined) {
      out.push({ ...entry, row: null, force: true });
      delete member.served[entry.key];
    }
  }
  return out.sort((a, b) => a.seq - b.seq);
}

const memberDevices = (account: RelayAccount, projectId: string): RelayDevice[] =>
  Object.values(account.members ?? {})
    .filter((m) => m.projectId === projectId && m.status !== 'revoked')
    .flatMap((m) => Object.keys(m.devices).map((id) => ({ id, name: m.name, lastSyncAt: m.lastSyncAt ?? 0, member: true })));

/**
 * One round of sync for one project. Mutates `account`; the caller persists
 * it. `member` is given when the request came in on an invitation rather
 * than with the account's own key.
 */
export function relaySync(account: RelayAccount, request: SyncRequest, now: number, member?: RelayMember): SyncResponse {
  if (member && (member.projectId !== request.projectId || !account.projects[request.projectId])) throw new Error('That invitation is for a different project.');
  const project = (account.projects[request.projectId] ??= { id: request.projectId, title: 'Untitled', seq: 0, updatedAt: now, rows: {}, snapshots: [] });
  if (member) {
    member.lastSyncAt = now;
    member.devices[request.deviceId] = true;
    if (request.resync) for (const key of Object.keys(member.served)) member.served[key] = -1;
  } else account.devices[request.deviceId] = { id: request.deviceId, name: request.deviceName || 'A device', lastSyncAt: now };

  // A collaborator is sent rows only in answer to a request that brings none: that is the request whose answer their
  // device takes in. (It ignores what comes back with its own changes, so marking rows as delivered there would lose them.)
  const remote = member ? (request.changes.length === 0 ? memberView(project, member) : []) : Object.values(project.rows).filter((entry) => entry.seq > request.cursor).sort((a, b) => a.seq - b.seq);
  const accepted: SyncResponse['accepted'] = [];
  const rejected: string[] = [];
  const denied: NonNullable<SyncResponse['denied']> = [];
  const lookup = (key: string) => project.rows[key]?.row ?? null;
  for (const change of request.changes) {
    const current = project.rows[change.key];
    // Optimistic concurrency: the device must have started from the version the relay holds.
    if ((current?.seq ?? 0) !== change.baseSeq) {
      rejected.push(change.key);
      continue;
    }
    // Then, for a collaborator, whether their role allows it. (A change made against an out-of-date row is simply out
    // of date, whoever made it; only a change to the row as it stands is judged.)
    if (member) {
      const reason = refusal(member.role, member.id, change.key, current?.row ?? null, change.row);
      if (reason) {
        denied.push({ key: change.key, reason });
        continue;
      }
    }
    project.seq += 1;
    project.rows[change.key] = { key: change.key, row: change.row, seq: project.seq, deviceId: request.deviceId, at: now };
    accepted.push({ key: change.key, seq: project.seq });
    // The sender holds what they just sent, if it is theirs to see at all.
    if (member && visible(member.role, member.id, change.key, change.row, lookup)) member.served[change.key] = project.seq;
  }
  if (accepted.length) {
    project.updatedAt = now;
    project.title = titleOf(project);
    const last = project.snapshots.at(-1);
    if (!last || project.seq - last.seq >= SNAPSHOT_EVERY.changes || now - last.at >= SNAPSHOT_EVERY.ms) takeSnapshot(project, now);
  }
  const devices = member ? [] : Object.values(account.devices).sort((a, b) => b.lastSyncAt - a.lastSyncAt);
  // Who else is on the project is for those who may see its activity, not for readers and viewers.
  const names = !member || visible(member.role, member.id, 'activity:', {}, lookup) ? memberDevices(account, project.id) : [];
  return { remote, accepted, rejected, denied, cursor: project.seq, devices: [...devices, ...names], ...(member ? { member: { id: member.id, role: member.role, name: member.name } } : {}) };
}

const info = ({ secretHash: _secret, served: _served, devices: _devices, ...rest }: RelayMember): RelayMemberInfo => rest;

/** Invites someone into a project with a role. The caller makes the id and the secret, and keeps the secret: only its hash is stored. */
export function relayInvite(account: RelayAccount, invite: { projectId: string; role: unknown; name: string; email: string }, memberId: string, secretHash: string, now: number): RelayMemberInfo {
  if (!account.projects[invite.projectId]) throw new Error('Sync this project to the cloud before inviting anyone to it.');
  if (!isRole(invite.role) || invite.role === 'owner') throw new Error('Choose a role for the person you are inviting.');
  const member: RelayMember = { id: memberId, projectId: invite.projectId, role: invite.role, name: invite.name.trim() || 'A collaborator', email: invite.email.trim(), secretHash, status: 'invited', createdAt: now, joinedAt: null, lastSyncAt: null, served: {}, devices: {} };
  (account.members ??= {})[memberId] = member;
  return info(member);
}

export const relayMembers = (account: RelayAccount, projectId: string): RelayMemberInfo[] =>
  Object.values(account.members ?? {}).filter((m) => m.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt).map(info);

/** Changes someone's role, or removes or restores their access. A new role takes effect at their next sync: they are sent what it adds and lose what it takes away. */
export function relayUpdateMember(account: RelayAccount, memberId: string, changes: { role?: unknown; status?: unknown }): RelayMemberInfo {
  const member = account.members?.[memberId];
  if (!member) throw new Error('That person is not on the project.');
  if (changes.role !== undefined) {
    if (!isRole(changes.role) || changes.role === 'owner') throw new Error('That is not a role someone can be given.');
    if (changes.role !== member.role) {
      member.role = changes.role;
      for (const key of Object.keys(member.served)) member.served[key] = -1;
    }
  }
  if (changes.status === 'revoked') member.status = 'revoked';
  if (changes.status === 'active' && member.status === 'revoked') member.status = member.joinedAt ? 'active' : 'invited';
  return info(member);
}

/** The member an invitation belongs to, if its secret matches and it has not been revoked. */
export function relayMember(account: RelayAccount, memberId: string, secretHash: string): RelayMember | null {
  const member = account.members?.[memberId];
  return member && member.secretHash === secretHash && member.status !== 'revoked' ? member : null;
}

/** What an invitation is to, for the person holding it. */
export const relayInvitation = (account: RelayAccount, member: RelayMember): { projectId: string; title: string; role: Role; name: string; joined: boolean } => ({
  projectId: member.projectId, title: account.projects[member.projectId] ? titleOf(account.projects[member.projectId]) : 'A project', role: member.role, name: member.name, joined: member.joinedAt !== null,
});

/** Takes up an invitation, under the name the person gives. */
export function relayJoin(member: RelayMember, name: string, now: number): RelayMemberInfo {
  if (name.trim()) member.name = name.trim().slice(0, 80);
  member.joinedAt ??= now;
  member.status = 'active';
  return info(member);
}

/** The projects an account has in the cloud, for a device that does not have them yet. */
export const relayProjects = (account: RelayAccount): { id: string; title: string; updatedAt: number; rows: number }[] =>
  Object.values(account.projects)
    .filter((project) => project.rows[`projects:${project.id}`]?.row)
    .map((project) => ({ id: project.id, title: titleOf(project), updatedAt: project.updatedAt, rows: Object.values(project.rows).filter((r) => r.row).length }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const relaySnapshots = (account: RelayAccount, projectId: string): RelaySnapshot[] =>
  (account.projects[projectId]?.snapshots ?? []).map(({ id, at, seq, rows, title }) => ({ id, at, seq, rows, title })).sort((a, b) => b.at - a.at);

/** The rows of a backup, by `table:id`. Null when there is no such backup. */
export const relaySnapshot = (account: RelayAccount, projectId: string, snapshotId: string): Record<string, Record<string, unknown>> | null => account.projects[projectId]?.snapshots.find((s) => s.id === snapshotId)?.state ?? null;

/** Takes a backup now, whatever the schedule says. */
export function relayBackupNow(account: RelayAccount, projectId: string, now: number): RelaySnapshot | null {
  const project = account.projects[projectId];
  if (!project) return null;
  takeSnapshot(project, now);
  const { id, at, seq, rows, title } = project.snapshots.at(-1)!;
  return { id, at, seq, rows, title };
}

/** Removes a device from the list. It can sync again whenever it likes; this only tidies the list. */
export function relayForgetDevice(account: RelayAccount, deviceId: string): void {
  delete account.devices[deviceId];
}
