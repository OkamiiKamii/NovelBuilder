import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { collab, db, sync } from '@/core';
import { INVITABLE, ROLES, ROLE_LABELS, ROLE_SUMMARIES, can, type Role } from '@/modules/sync/access';
import { isConfigured, membershipOf, relayClient, setMembership, setSyncAccount, useSyncAccount } from '@/modules/sync/account';
import type { RelayMemberInfo } from '@/modules/sync/relay';
import { syncProject } from '@/modules/sync/runner';
import { removeNovel } from '@/modules/projects/removal';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { FieldSuggestion, useSuggestions } from '../components/Review';
import { ThreadCard, useThreads } from '../components/Threads';
import { colorOf, useMe } from '../identity';
import { isOpen } from '../service';

const when = (at: number | null) => (at ? new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');
const say = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');
const STATUS = { invited: 'Invited, not joined yet', active: 'Active', revoked: 'Access removed' };

/** The owner's side of the team: who is on it, in what role, and inviting more. Everything here goes through the relay with the account's own key. */
function Roster({ projectId, title }: { projectId: string; title: string }) {
  const account = useSyncAccount();
  const state = useLiveQuery(() => sync.state(projectId), [projectId]);
  const [people, setPeople] = useState<RelayMemberInfo[] | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [invite, setInvite] = useState({ name: '', email: '', role: 'editor' as Role });
  const [made, setMade] = useState<{ name: string; email: string; role: Role; link: string } | null>(null);
  const api = collab.forProject(projectId);
  const ready = isConfigured(account) && Boolean(state?.enabled);
  const fail = (err: unknown) => setNotice({ text: say(err), error: true });

  const refresh = async () => {
    const { members } = await relayClient(account).members(projectId);
    setPeople(members);
    await api.mirrorMembers(members);
  };
  useEffect(() => {
    if (ready) void refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, projectId]);
  const change = async (member: RelayMemberInfo, changes: { role?: Role; status?: 'revoked' | 'active' }, verb: string, label: string) => {
    try {
      await relayClient(account).updateMember(member.id, changes);
      await api.noteTeam(verb, member.id, label);
      await refresh();
      void syncProject(projectId).catch(() => {});
      setNotice(null);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <>
      <section className="panel stack" aria-label="Invite someone">
        <h2>Invite someone</h2>
        {!ready ? (
          <p className="muted">
            People join a project through the cloud. <Link to={`/project/${projectId}/sync`}>Set up cloud sync</Link> for this project first, then invite them here.
          </p>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                try {
                  // What is in the cloud is what they will receive: send anything still waiting first.
                  await syncProject(projectId);
                  const { member, token } = await relayClient(account).invite({ projectId, ...invite });
                  const link = `${window.location.origin}/join#relay=${encodeURIComponent(account.relayUrl)}&token=${encodeURIComponent(token)}`;
                  setMade({ name: member.name, email: member.email, role: member.role, link });
                  await api.noteTeam('invited', member.id, `${member.name} as ${ROLE_LABELS[member.role]}`);
                  setInvite({ name: '', email: '', role: invite.role });
                  await refresh();
                  void syncProject(projectId).catch(() => {});
                  setNotice(null);
                } catch (err) {
                  fail(err);
                }
              })();
            }}
          >
            <div className="grid-2 tight">
              <label className="field">
                <span>Their name</span>
                <input value={invite.name} aria-label="Name of the person to invite" onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Their email (optional)</span>
                <input type="email" value={invite.email} aria-label="Email of the person to invite" onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span>Role</span>
              <select value={invite.role} aria-label="Role for the person to invite" onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                {INVITABLE.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <span className="muted small">{ROLE_SUMMARIES[invite.role]}</span>
            </label>
            <div className="actions start">
              <button type="submit" className="btn primary" disabled={!invite.name.trim()}>
                Create the invitation
              </button>
            </div>
          </form>
        )}
        {made && (
          <div className="invite-made stack" role="status" aria-label="Invitation created">
            <p>
              <strong>{made.name}</strong> is invited as {ROLE_LABELS[made.role]}. Send them this link. It is their key to the project, and it is shown only now.
            </p>
            <input readOnly value={made.link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
            <div className="actions start wrap">
              <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(made.link).then(() => setNotice({ text: 'Link copied.' }), () => setNotice({ text: 'Select the link and copy it.', error: true }))}>
                Copy the link
              </button>
              <a
                className="btn"
                href={`mailto:${encodeURIComponent(made.email)}?subject=${encodeURIComponent(`An invitation to “${title}”`)}&body=${encodeURIComponent(`You are invited to “${title}” as ${ROLE_LABELS[made.role]}.\n\nOpen this link to join:\n${made.link}\n`)}`}
              >
                Write them an email
              </a>
            </div>
            <p className="muted small">The email opens in your own mail program, addressed and written; this app does not send mail itself.</p>
          </div>
        )}
        {notice && (
          <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
      </section>

      {people && (
        <section className="panel" aria-label="People on this project">
          <h2>People on this project</h2>
          {people.length === 0 ? (
            <p className="muted">Nobody but you, so far.</p>
          ) : (
            <table className="analytics-table team-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last here</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((member) => (
                  <tr key={member.id} className={member.status === 'revoked' ? 'is-revoked' : ''}>
                    <th scope="row">
                      <span className="who-dot" style={{ background: colorOf(member.id) }} aria-hidden="true" />
                      {member.name}
                      {member.email && <span className="muted small"> {member.email}</span>}
                    </th>
                    <td>
                      <select value={member.role} aria-label={`Role of ${member.name}`} disabled={member.status === 'revoked'} onChange={(e) => void change(member, { role: e.target.value as Role }, 'changed the role of', `${member.name} to ${ROLE_LABELS[e.target.value as Role]}`)}>
                        {INVITABLE.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{STATUS[member.status]}</td>
                    <td>{when(member.lastSyncAt)}</td>
                    <td>
                      {member.status === 'revoked' ? (
                        <button type="button" className="btn ghost" onClick={() => void change(member, { status: 'active' }, 'restored the access of', member.name)}>
                          Restore access
                        </button>
                      ) : (
                        <button type="button" className="btn ghost danger-text" aria-label={`Remove ${member.name}`} onClick={() => void change(member, { status: 'revoked' }, 'removed', member.name)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">A change of role takes effect the next time that person syncs: they are sent what the new role adds and lose what it takes away. Removing someone stops their syncing; what they had already downloaded stays on their device.</p>
        </section>
      )}
    </>
  );
}

/** Who is on the project and what has been happening on it. What each person sees here is what their role allows. */
export function TeamPage() {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const me = useMe(project.id);
  const account = useSyncAccount();
  const { hash } = useLocation();
  const members = useLiveQuery(() => collab.forProject(project.id).members(), [project.id]) ?? [];
  const threads = useThreads(project.id) ?? [];
  const suggestions = useSuggestions(project.id) ?? [];
  const activity = (useLiveQuery(() => (can(me.role, 'seeActivity') ? db.activity.where('projectId').equals(project.id).toArray() : []), [project.id, me.role]) ?? []).sort((a, b) => b.at - a.at);
  const [show, setShow] = useState<'open' | 'resolved' | 'all'>('open');
  const [who, setWho] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const decides = can(me.role, 'decide');
  const waiting = suggestions.filter((s) => isOpen(s) && (decides || s.authorId === me.id));
  const listed = threads.filter((t) => show === 'all' || t.root.status === show);
  const actors = [...new Map(activity.map((a) => [a.actorId, a.actorName])).entries()];
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="stack team-page">
      <header className="page-header">
        <div>
          <h1>Team</h1>
          <p className="muted" role="status">
            You are {me.name}, {ROLE_LABELS[me.role]}. {ROLE_SUMMARIES[me.role]}
          </p>
        </div>
        {me.role !== 'owner' && (
          <div className="actions">
            <button type="button" className="btn" disabled={syncing} onClick={() => {
              setSyncing(true);
              void syncProject(project.id).then(() => setSyncError(null), (err) => setSyncError(say(err))).finally(() => setSyncing(false));
            }}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}
      </header>
      {syncError && (
        <p className="notice error" role="alert">
          {syncError}
        </p>
      )}

      {me.role === 'owner' ? (
        <>
          <section className="panel" aria-label="How you appear">
            <label className="field">
              <span>Your name, as others will see it</span>
              <input value={account.userName} aria-label="Your name" placeholder="The owner" onChange={(e) => setSyncAccount({ userName: e.target.value })} />
            </label>
          </section>
          <Roster projectId={project.id} title={project.title} />
        </>
      ) : (
        <section className="panel stack" aria-label="This project is shared with you">
          <h2>Shared with you</h2>
          {members.filter((m) => m.status !== 'revoked').length > 0 && (
            <ul className="dock-list" aria-label="People on this project">
              {members.filter((m) => m.status !== 'revoked').map((member) => (
                <li key={member.id}>
                  <span>
                    <span className="who-dot" style={{ background: colorOf(member.id) }} aria-hidden="true" />
                    {member.name}
                    {member.id === me.id ? ' (you)' : ''}
                  </span>
                  <span className="muted small">{ROLE_LABELS[member.role]}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="actions start">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!window.confirm('Remove this project from this device? Your comments and suggestions already sent stay with the project.')) return;
                void (async () => {
                  await sync.disable(project.id);
                  await removeNovel(project.id);
                  if (membershipOf(project.id)) setMembership(project.id, null);
                  navigate('/');
                })();
              }}
            >
              Leave: remove it from this device
            </button>
          </div>
        </section>
      )}

      <details className="panel">
        <summary>What each role can do</summary>
        <dl className="roles">
          {ROLES.map((role) => (
            <div key={role}>
              <dt>{ROLE_LABELS[role]}</dt>
              <dd>{ROLE_SUMMARIES[role]}</dd>
            </div>
          ))}
        </dl>
      </details>

      {can(me.role, 'suggest') && (
        <section className="stack" id="suggestions" aria-label="Suggestions waiting">
          <h2>
            {decides ? 'Waiting for your verdict' : 'Your suggestions, waiting'} <span className="muted">{waiting.length}</span>
          </h2>
          {waiting.length === 0 ? (
            <p className="muted">Nothing is waiting.</p>
          ) : (
            <ul className="threads">
              {waiting.map((suggestion) =>
                suggestion.kind === 'fields' ? (
                  <FieldSuggestion key={suggestion.id} projectId={project.id} suggestion={suggestion} showTarget />
                ) : (
                  <li key={suggestion.id} className="thread" aria-label={`Changes to ${suggestion.targetLabel} suggested by ${suggestion.authorName}`}>
                    <p>
                      <span className="who-dot" style={{ background: colorOf(suggestion.authorId) }} aria-hidden="true" />
                      <strong>{suggestion.authorName}</strong> <span className="muted small">{ROLE_LABELS[suggestion.authorRole]}</span> suggests changes to the text of <strong>{suggestion.targetLabel}</strong>.
                    </p>
                    <Link className="btn" to={`/project/${project.id}/manuscript/${suggestion.targetId}`}>
                      {decides ? 'Review in the manuscript' : 'Open the chapter'}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      )}

      {can(me.role, 'comment') && (
        <section className="stack" id="conversations" aria-label="Conversations">
          <div className="section-head">
            <h2>
              Conversations <span className="muted">{listed.length}</span>
            </h2>
            <select value={show} aria-label="Which conversations to show" onChange={(e) => setShow(e.target.value as typeof show)}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </div>
          {listed.length === 0 ? (
            <p className="muted">{show === 'open' ? 'No open conversations.' : 'None.'}</p>
          ) : (
            <ul className="threads">
              {listed.map((thread) => (
                <ThreadCard key={thread.root.id} projectId={project.id} thread={thread} showTarget />
              ))}
            </ul>
          )}
        </section>
      )}

      {can(me.role, 'seeActivity') && (
        <section className="panel stack" id="activity" aria-label="Activity">
          <div className="section-head">
            <h2>Who did what</h2>
            <select value={who} aria-label="Whose activity to show" onChange={(e) => setWho(e.target.value)}>
              <option value="">Everyone</option>
              {actors.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {activity.length === 0 ? (
            <p className="muted">Nothing yet.</p>
          ) : (
            <ol className="activity-log">
              {activity.filter((a) => !who || a.actorId === who).slice(0, 200).map((entry) => (
                <li key={entry.id}>
                  <span className="who-dot" style={{ background: colorOf(entry.actorId) }} aria-hidden="true" />
                  <span>
                    <strong>{entry.actorName}</strong> {entry.verb} {entry.label}
                    {entry.count > 1 ? <span className="muted"> ({entry.count} times)</span> : ''}
                  </span>
                  <time className="muted small">{when(entry.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Where an invitation link lands. The link carries the relay's address and
 * the invitation after the `#`, which a browser never sends to any server
 * by itself; it is sent only to that relay, when the person chooses to join.
 */
export function JoinPage() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const params = new URLSearchParams(hash.slice(1));
  const [relayUrl, token] = [(params.get('relay') ?? '').replace(/\/+$/, ''), params.get('token') ?? ''];
  const [invitation, setInvitation] = useState<{ projectId: string; title: string; role: Role; name: string } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const valid = /^https?:\/\//.test(relayUrl) && token.startsWith('m_');
  useEffect(() => {
    if (!valid) return;
    relayClient({ relayUrl, syncKey: token }).invitation().then((found) => {
      setInvitation(found);
      setName(found.name);
    }, (err) => setError(say(err)));
  }, [relayUrl, token, valid]);

  const join = async () => {
    if (!invitation) return;
    setJoining(true);
    try {
      if ((await db.projects.get(invitation.projectId)) && !membershipOf(invitation.projectId)) throw new Error('This device already has this project as its owner. An invitation is for someone else’s device.');
      const joined = await relayClient({ relayUrl, syncKey: token }).join(name);
      setMembership(invitation.projectId, { projectId: invitation.projectId, relayUrl, token, memberId: joined.member.id, name: joined.member.name, role: joined.member.role });
      await sync.enable(invitation.projectId);
      await syncProject(invitation.projectId);
      navigate(`/project/${invitation.projectId}`);
    } catch (err) {
      setError(say(err));
      setJoining(false);
    }
  };

  return (
    <div className="page stack join-page">
      <header className="page-header">
        <div>
          <h1>Join a project</h1>
        </div>
        <Link to="/" className="btn">
          ← Library
        </Link>
      </header>
      {!valid ? (
        <p className="notice error" role="alert">
          This is not a complete invitation link. Ask the owner to send it again.
        </p>
      ) : (
        <section className="panel stack" aria-label="Invitation">
          {invitation ? (
            <>
              <p>
                You are invited to <strong>{invitation.title}</strong> as <strong>{ROLE_LABELS[invitation.role]}</strong>.
              </p>
              <p className="muted">{ROLE_SUMMARIES[invitation.role]}</p>
              <label className="field">
                <span>Your name, as the others will see it</span>
                <input value={name} aria-label="Your name" onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="actions start">
                <button type="button" className="btn primary" disabled={joining || !name.trim()} onClick={() => void join()}>
                  {joining ? 'Joining…' : 'Join the project'}
                </button>
              </div>
              <p className="muted small">The project is downloaded to this device, as much of it as your role includes, and kept in step with the others from then on.</p>
            </>
          ) : (
            !error && <p className="muted">Looking up the invitation…</p>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
