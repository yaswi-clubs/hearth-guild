import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createStore } from './data/store.js';
import {
  actions, GameError, needsRollover, weekId, dayIndex, DAY_NAMES, bossFor, maxHP, dealt, hpLeft,
  choreList, hitList, memberList, remaining, BUILDINGS, MEMBER_COLOURS, STARTER_CHORES, RESOURCES,
  houseUpgradeCost, hallUpgradeCost, REPLANT_COST, MAX_LEVEL, canAfford, newHousehold, formatCode, parseCode, hashPin, WIN_LOOT,
} from './game/rules.js';
import { createVillage } from './game/village.js';

const LS = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

export default function App() {
  const [store, setStore] = useState(null);
  const [boot, setBoot] = useState({ state: 'loading' });
  const [hid, setHid] = useState(LS.get('hg:current'));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await createStore();
        await s.init();
        if (!alive) return;
        if (hid && !(await s.exists(hid))) { LS.set('hg:current', null); setHid(null); }
        setStore(s); setBoot({ state: 'ready' });
      } catch (e) {
        console.error(e);
        setBoot({ state: 'error', message: e?.code === 'auth/operation-not-allowed' ? 'Anonymous sign-in is switched off in Firebase. Turn it on under Authentication → Sign-in method.' : 'Could not connect. Check your internet connection and try again.' });
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id) => { LS.set('hg:current', id); setHid(id); };
  const leave = () => { LS.set('hg:current', null); setHid(null); };

  if (boot.state === 'loading') return <Splash text="Opening the village gates…" />;
  if (boot.state === 'error') return <Splash text={boot.message} action={<button className="btn" onClick={() => location.reload()}>Try again</button>} />;
  if (!hid) return <Welcome store={store} onOpen={open} />;
  return <Game key={hid} store={store} hid={hid} onLeave={leave} />;
}

function Splash({ text, action }) {
  return <div className="splash"><div className="logo">Hearth Guild</div><p>{text}</p>{action}</div>;
}

/* ---------------- welcome & setup ---------------- */
function Welcome({ store, onOpen }) {
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (mode === 'create') return <Setup store={store} onDone={onOpen} onBack={() => setMode(null)} />;
  const join = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { onOpen(await store.join(parseCode(code))); } catch (x) { setErr(x.message || 'Could not join.'); } finally { setBusy(false); }
  };
  return (
    <div className="welcome">
      <div className="logo big">Hearth Guild</div>
      <p className="tag-line">Your household is a guild. Chores are attacks. Beat the boss by Sunday and build your village.</p>
      <div className="panel">
        <button className="btn wide" onClick={() => setMode('create')}>Start a new guild</button>
        {store.mode === 'firebase' ? (
          <form onSubmit={join} className="join">
            <label htmlFor="code">Got a guild code from someone at home?</label>
            <div className="row-inline">
              <input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH-JK" autoCapitalize="characters" />
              <button className="btn blue" disabled={busy || parseCode(code).length < 8}>Join</button>
            </div>
            {err && <p className="err">{err}</p>}
          </form>
        ) : (
          <p className="meta">Single-device mode: everyone plays on this phone or tablet. To play on separate phones, add your Firebase config (see README).</p>
        )}
      </div>
    </div>
  );
}

function Setup({ store, onDone, onBack }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([
    { name: '', role: 'adult', color: MEMBER_COLOURS[0] },
    { name: '', role: 'adult', color: MEMBER_COLOURS[1] },
    { name: '', role: 'kid', color: MEMBER_COLOURS[2] },
  ]);
  const [chores, setChores] = useState(STARTER_CHORES.map((c) => ({ ...c, on: true })));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setM = (k, patch) => setMembers((ms) => ms.map((m, i) => (i === k ? { ...m, ...patch } : m)));
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const state = newHousehold({ name, members, chores: chores.filter((c) => c.on) });
      onDone(await store.create(state));
    } catch (x) { setErr(x instanceof GameError ? x.message : 'Could not create the guild. Try again.'); console.error(x); } finally { setBusy(false); }
  };
  return (
    <form className="setup" onSubmit={submit}>
      <button type="button" className="linkbtn back" onClick={onBack}>← Back</button>
      <h1>Found your guild</h1>
      <label htmlFor="gname">Guild name</label>
      <input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Colliers Wood Crew" maxLength={30} />
      <h2>Members</h2>
      <p className="meta">Everyone who lives here, adults included. Up to 6.</p>
      {members.map((m, k) => (
        <div className="member-edit" key={k}>
          <ColourPick value={m.color} onChange={(color) => setM(k, { color })} id={`c${k}`} />
          <input aria-label={`Member ${k + 1} name`} value={m.name} onChange={(e) => setM(k, { name: e.target.value })} placeholder={`Member ${k + 1}`} maxLength={20} />
          <select aria-label="Role" value={m.role} onChange={(e) => setM(k, { role: e.target.value })}>
            <option value="adult">Adult</option><option value="kid">Kid</option>
          </select>
          {members.length > 2 && <button type="button" className="iconbtn" aria-label="Remove member" onClick={() => setMembers((ms) => ms.filter((_, i) => i !== k))}>×</button>}
        </div>
      ))}
      {members.length < 6 && <button type="button" className="btn ghost sm" onClick={() => setMembers((ms) => [...ms, { name: '', role: 'kid', color: MEMBER_COLOURS[ms.length % 6] }])}>+ Add member</button>}
      <h2>Starting quests</h2>
      <p className="meta">Untick any that don't fit. You can edit quests, points and who does what later.</p>
      <div className="starter">
        {chores.map((c, k) => (
          <label key={k} className="check-row">
            <input type="checkbox" checked={c.on} onChange={(e) => setChores((cs) => cs.map((x, i) => (i === k ? { ...x, on: e.target.checked } : x)))} />
            <span>{c.title}</span><span className="meta">{c.pts} pts{c.times > 1 ? ` × ${c.times}` : ''}</span>
          </label>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
      <button className="btn wide" disabled={busy}>{busy ? 'Building your village…' : 'Create guild'}</button>
    </form>
  );
}

function ColourPick({ value, onChange, id }) {
  return (
    <div className="colours" role="radiogroup" aria-label="Colour" id={id}>
      {MEMBER_COLOURS.map((c) => (
        <button type="button" key={c} role="radio" aria-checked={value === c} className={value === c ? 'sw on' : 'sw'} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
    </div>
  );
}

/* ---------------- the game ---------------- */
function Game({ store, hid, onLeave }) {
  const [s, setS] = useState(null);
  const [missing, setMissing] = useState(false);
  const [player, setPlayerRaw] = useState(LS.get(`hg:player:${hid}`));
  const [tab, setTab] = useState('quests');
  const [sel, setSel] = useState(null);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // 'who' | 'settings' | 'end' | {quest}
  const [seen, setSeen] = useState(Number(LS.get(`hg:seen:${hid}`) || 0));
  const canvasRef = useRef(null), villageRef = useRef(null), prevDone = useRef(null), rolling = useRef(false);

  const setPlayer = (id) => { LS.set(`hg:player:${hid}`, id); setPlayerRaw(id); };
  const say = useCallback((t) => { setToast(t); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2400); }, []);

  useEffect(() => store.subscribe(hid, setS, () => setMissing(true)), [store, hid]);
  useEffect(() => {
    const v = createVillage(canvasRef.current, { onTap: (id) => setSel(id) });
    villageRef.current = v; return () => v.destroy();
  }, []);

  // Feed the village and animate attacks approved anywhere in the household.
  useEffect(() => {
    if (!s) return;
    villageRef.current?.setState(s);
    const done = hitList(s).filter((h) => h.state === 'done');
    if (prevDone.current) {
      done.filter((h) => !prevDone.current.has(h.id)).forEach((h) => {
        villageRef.current?.shoot(h.memberId, h.dmg, s.members[h.memberId]?.color || '#f5c542');
      });
    }
    prevDone.current = new Set(done.map((h) => h.id));
    if (needsRollover(s) && !rolling.current) {
      rolling.current = true;
      store.run(hid, (x) => (needsRollover(x) ? actions.endWeek(x, {}) : x)).catch(console.error).finally(() => { rolling.current = false; });
    }
  }, [s, store, hid]);

  // Reset the "done" baseline when the week changes so the new boss doesn't get hit by last week's attacks.
  const weekKey = s ? `${s.week.id}:${s.week.bossIndex}` : '';
  useEffect(() => { prevDone.current = null; }, [weekKey]);

  const run = useCallback(async (name, args, ok) => {
    try {
      await store.run(hid, (x) => actions[name](x, args));
      if (ok) ok();
      return true;
    } catch (e) {
      say(e instanceof GameError ? e.message : 'That didn’t save. Check your connection and try again.');
      if (!(e instanceof GameError)) console.error(e);
      return false;
    }
  }, [store, hid, say]);

  if (missing) return <Splash text="This guild isn’t available on this device any more." action={<button className="btn" onClick={onLeave}>Back to start</button>} />;

  const me = s && player && s.members[player] ? { id: player, ...s.members[player] } : null;
  const isAdult = me?.role === 'adult';
  const result = s?.lastResult && s.lastResult.endedAt > seen ? s.lastResult : null;
  const closeReveal = () => { LS.set(`hg:seen:${hid}`, String(result.endedAt)); setSeen(result.endedAt); };

  return (
    <div className="app">
      <div className="stage">
        <canvas ref={canvasRef} aria-label="Your guild village. Tap a building or an empty plot." />
        {s && <Hud s={s} me={me} onWho={() => setModal('who')} onSettings={() => setModal('settings')} />}
        {s && !sel && <div className="hint">Tap a plot to build, or a house to upgrade</div>}
        {s && sel && <BuildSheet s={s} sel={sel} isAdult={isAdult} onClose={() => { setSel(null); villageRef.current?.select(null); }} run={run} village={villageRef.current} say={say} />}
        {s && result && <Reveal s={s} r={result} onClose={closeReveal} village={villageRef.current} />}
      </div>

      {s && (
        <div className="board">
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === 'quests'} onClick={() => setTab('quests')}>Quests</button>
            <button className="tab" role="tab" aria-selected={tab === 'guild'} onClick={() => setTab('guild')}>
              Guild{hitList(s).some((h) => h.state === 'pending' && h.memberId !== player) && <span className="badge">{hitList(s).filter((h) => h.state === 'pending' && h.memberId !== player).length}</span>}
            </button>
            {isAdult ? <button className="btn orange sm" onClick={() => setModal('end')}>{dayIndex() >= 5 ? 'Reveal' : 'End week'}</button> : <span />}
          </div>
          {!me ? (
            <div className="list"><div className="empty"><p>Who’s playing on this device?</p><button className="btn" onClick={() => setModal('who')}>Choose player</button></div></div>
          ) : tab === 'quests' ? (
            <Quests s={s} me={me} isAdult={isAdult} run={run} say={say} onEdit={(q) => setModal({ quest: q })} />
          ) : (
            <GuildTab s={s} me={me} run={run} say={say} />
          )}
        </div>
      )}
      <div className="foot"><span>{store.mode === 'firebase' ? 'Synced across your household' : 'Single-device mode'}</span>{s && <span>Week {String(s.week.id).split('-W')[1]?.split('+')[0]}</span>}</div>

      {modal === 'who' && s && <WhoModal s={s} current={player} onPick={(id) => { setPlayer(id); setModal(null); say(`Playing as ${s.members[id].name}`); }} onClose={() => setModal(null)} />}
      {modal === 'settings' && s && <Settings s={s} me={me} isAdult={isAdult} hid={hid} store={store} run={run} onClose={() => setModal(null)} onLeave={onLeave} />}
      {modal === 'end' && s && <EndWeek s={s} onClose={() => setModal(null)} onConfirm={async () => { setModal(null); await run('endWeek', {}); }} />}
      {modal?.quest !== undefined && s && <QuestEditor s={s} quest={modal.quest} run={run} onClose={() => setModal(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Pill({ k, v, short, bump }) {
  return <span className={`pill${short ? ' short' : ''}${bump ? ' bump' : ''}`} title={k}><span className={`ico ${k}`} />{v}</span>;
}

function Hud({ s, me, onWho, onSettings }) {
  const M = maxHP(s), left = hpLeft(s), boss = bossFor(s.week.bossIndex);
  const prev = useRef(s.res); const [bump, setBump] = useState(null);
  useEffect(() => {
    const k = RESOURCES.find((r) => (s.res[r] || 0) > (prev.current[r] || 0));
    prev.current = s.res; if (k) { setBump(k); const t = setTimeout(() => setBump(null), 450); return () => clearTimeout(t); }
  }, [s.res]);
  const d = dayIndex();
  return (
    <>
      <div className="hud">
        <button className="daychip" onClick={onWho}>
          {me ? <><span className="dot" style={{ background: me.color }} />{me.name}</> : 'Choose player'}
          <small>{DAY_NAMES[d]} · {d < 6 ? `${6 - d} day${6 - d > 1 ? 's' : ''} to Sunday` : 'Reveal tonight'}</small>
        </button>
        <div className="hud-right">
          <div className="res">{RESOURCES.map((k) => <Pill key={k} k={k} v={s.res[k] || 0} bump={bump === k} />)}</div>
          <button className="gear" onClick={onSettings} aria-label="Guild settings">⚙</button>
        </div>
      </div>
      <div className="bossbar">
        <div className="bossname">{boss.name}</div>
        <div className="hp"><i style={{ width: `${M ? (left / M) * 100 : 0}%` }} /></div>
        <div className="hptxt">{M === 0 ? 'Add quests to summon a boss' : left > 0 ? `${left} / ${M} HP` : 'Defeated! Loot on Sunday'}</div>
      </div>
    </>
  );
}

function costPills(s, cost) {
  return <div className="cost">{Object.entries(cost).map(([k, v]) => <Pill key={k} k={k} v={v} short={(s.res[k] || 0) < v} />)}</div>;
}

function BuildSheet({ s, sel, isAdult, onClose, run, village, say }) {
  let body;
  if (sel.startsWith('house:')) {
    const id = sel.slice(6), m = s.members[id]; if (!m) return null;
    const lvl = s.houses?.[id] || 1, cost = houseUpgradeCost(lvl);
    body = <>
      <h3>{m.name}’s house · Level {lvl}</h3>
      <p>{lvl < MAX_LEVEL ? `Upgrade to add a floor${lvl === 1 ? ' and a chimney' : ' and your own flag'}.` : 'Fully upgraded. Show-off rights unlocked.'}</p>
      {lvl < MAX_LEVEL && <>{costPills(s, cost)}<div><button className="btn" disabled={!canAfford(s.res, cost)} onClick={() => run('upgradeHouse', { memberId: id }, () => { village?.celebrateBuild(sel); say(`${m.name}’s house is now level ${lvl + 1}`); })}>Upgrade</button></div></>}
    </>;
  } else {
    const def = BUILDINGS.find((b) => b.id === sel), st = s.buildings[sel]; if (!def || !st) return null;
    if (!st.built) body = <>
      <h3>{def.name}</h3><p>{def.desc}</p>{costPills(s, def.cost)}
      <div><button className="btn" disabled={!canAfford(s.res, def.cost)} onClick={() => run('build', { buildingId: sel }, () => { village?.celebrateBuild(sel); say(`${def.name} built`); })}>{canAfford(s.res, def.cost) ? 'Build' : 'Need more resources'}</button></div>
    </>;
    else if (sel === 'hall') {
      const cost = hallUpgradeCost(st.lvl);
      body = <><h3>Guild Hall · Level {st.lvl}</h3><p>{def.desc}</p>
        {st.lvl < MAX_LEVEL && <>{costPills(s, cost)}<div><button className="btn" disabled={!canAfford(s.res, cost) || !isAdult} onClick={() => run('upgradeHall', {}, () => { village?.celebrateBuild(sel); say(`Guild Hall level ${st.lvl + 1}`); })}>Upgrade</button>{!isAdult && <span className="meta"> An adult upgrades the hall.</span>}</div></>}</>;
    } else if (st.burnt) body = <><h3>{def.name} (burnt)</h3><p>The boss torched it on the way out. Replant it:</p>{costPills(s, REPLANT_COST)}
      <div><button className="btn" disabled={!canAfford(s.res, REPLANT_COST)} onClick={() => run('replant', { buildingId: sel }, () => village?.celebrateBuild(sel))}>Replant</button></div></>;
    else body = <><h3>{def.name}</h3><p>{def.desc}</p></>;
  }
  return <div className="sheet"><button className="x" onClick={onClose} aria-label="Close">×</button>{body}</div>;
}

function Quests({ s, me, isAdult, run, say, onEdit }) {
  const quests = choreList(s);
  if (!quests.length) return <div className="list"><div className="empty"><p>No quests yet, so there's no boss to fight.</p>{isAdult && <button className="btn" onClick={() => onEdit(null)}>Add a quest</button>}</div></div>;
  return (
    <div className="list">
      {quests.map((q) => {
        const left = remaining(s, q), mine = hitList(s).filter((h) => h.choreId === q.id);
        const pending = mine.filter((h) => h.state === 'pending').length, done = mine.length - pending;
        const owner = q.memberId ? s.members[q.memberId] : null;
        return (
          <div className="row" key={q.id}>
            <div className="av" style={{ background: owner?.color || '#c9a982' }}>{owner ? owner.name[0] : '★'}</div>
            <div>
              <b>{q.title}</b>
              <span className="meta">{owner ? owner.name : 'Anyone'} · {q.pts * 10} dmg · drops {q.drop}{q.times > 1 ? ` · ${done + pending}/${q.times} this week` : ''}{q.oneOff ? ' · one-off' : ''}</span>
            </div>
            <div className="row-actions">
              {left > 0 ? <button className="btn orange sm" onClick={() => run('markDone', { choreId: q.id, memberId: me.id }, () => say('Sent to the guild for a quick check'))}>Attack</button>
                : pending ? <span className="tagx wait">Needs a tap</span> : <span className="tagx hit">Done</span>}
              {isAdult && <button className="iconbtn" aria-label={`Edit ${q.title}`} onClick={() => onEdit(q)}>✎</button>}
            </div>
          </div>
        );
      })}
      {isAdult && <button className="btn ghost sm addq" onClick={() => onEdit(null)}>+ Add quest</button>}
    </div>
  );
}

function GuildTab({ s, me, run, say }) {
  const hits = hitList(s), pend = hits.filter((h) => h.state === 'pending');
  const members = memberList(s);
  const dmg = Object.fromEntries(members.map((m) => [m.id, hits.filter((h) => h.memberId === m.id && h.state === 'done').reduce((t, h) => t + h.dmg, 0)]));
  const top = Math.max(1, ...Object.values(dmg));
  return (
    <div className="list">
      <div className="sec">Check a teammate’s quest</div>
      {pend.length ? pend.map((h) => {
        const m = s.members[h.memberId] || { name: 'Someone', color: '#999' }, q = s.chores[h.choreId];
        const mineToCheck = h.memberId !== me.id;
        return (
          <div className="row" key={h.id}>
            <div className="av" style={{ background: m.color }}>{m.name[0]}</div>
            <div><b>{q?.title || 'A quest'}</b><span className="meta">{m.name} says it’s done · {new Date(h.at).toLocaleDateString('en-GB', { weekday: 'short' })}</span></div>
            {mineToCheck
              ? <button className="btn sm" onClick={() => run('approve', { hitId: h.id, approverId: me.id }, () => say(`${m.name} attacks for ${h.dmg}!`))}>Approve</button>
              : <button className="btn ghost sm" onClick={() => run('undoHit', { hitId: h.id, memberId: me.id })}>Take back</button>}
          </div>
        );
      }) : <p className="meta pad">Nothing to check. When someone taps Attack, it shows up here for a teammate.</p>}
      <div className="sec">Damage this week</div>
      {members.map((m) => (
        <div className="row three" key={m.id}>
          <div className="av" style={{ background: m.color }}>{m.name[0]}</div>
          <div><b>{m.name}</b><div className="bar"><i style={{ width: `${(dmg[m.id] / top) * 100}%`, background: m.color }} /></div></div>
          <span className="tagx hit">{dmg[m.id]}</span>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <h2>{title}</h2>{children}
      </div>
    </div>
  );
}

function WhoModal({ s, current, onPick, onClose }) {
  const [asking, setAsking] = useState(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const pick = async (m) => {
    if (m.pinHash && m.id !== current) { setAsking(m); setPin(''); setErr(''); return; }
    onPick(m.id);
  };
  const check = async (e) => { e.preventDefault(); if ((await hashPin(pin)) === asking.pinHash) onPick(asking.id); else setErr('That PIN doesn’t match.'); };
  return (
    <Modal title={asking ? `${asking.name}’s PIN` : 'Who’s playing?'} onClose={onClose}>
      {asking ? (
        <form onSubmit={check} className="stack">
          <input inputMode="numeric" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN" className="pin" />
          {err && <p className="err">{err}</p>}
          <button className="btn">Unlock</button>
        </form>
      ) : (
        <div className="who">
          {memberList(s).map((m) => (
            <button key={m.id} className={`who-btn${m.id === current ? ' on' : ''}`} onClick={() => pick(m)}>
              <span className="av" style={{ background: m.color }}>{m.name[0]}</span><b>{m.name}</b><span className="meta">{m.role === 'kid' ? 'Kid' : 'Adult'}{m.pinHash ? ' · PIN' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function QuestEditor({ s, quest, run, onClose }) {
  const [f, setF] = useState(quest ? { ...quest } : { title: '', pts: 3, times: 1, drop: 'wood', memberId: null, oneOff: false });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async (e) => {
    e.preventDefault();
    const chore = { title: f.title, pts: f.pts, times: f.times, drop: f.drop, memberId: f.memberId || null, oneOff: f.oneOff };
    if (await run(quest ? 'updateChore' : 'addChore', quest ? { id: quest.id, chore } : { chore })) onClose();
  };
  return (
    <Modal title={quest ? 'Edit quest' : 'New quest'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <label htmlFor="qt">Quest</label>
        <input id="qt" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={60} placeholder="e.g. Empty the dishwasher" />
        <label htmlFor="qp">Effort points: {f.pts} ({f.pts * 10} damage)</label>
        <input id="qp" type="range" min="1" max="8" value={f.pts} onChange={(e) => set({ pts: Number(e.target.value) })} />
        <p className="meta">1 = under 5 minutes · 3 = about 15 · 5 = about 30 · 8 = an hour or more</p>
        <div className="grid2">
          <div><label htmlFor="qn">Times a week</label>
            <select id="qn" value={f.times} onChange={(e) => set({ times: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <div><label htmlFor="qd">Drops</label>
            <select id="qd" value={f.drop} onChange={(e) => set({ drop: e.target.value })}>{RESOURCES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
        </div>
        <label htmlFor="qm">Usually done by</label>
        <select id="qm" value={f.memberId || ''} onChange={(e) => set({ memberId: e.target.value || null })}>
          <option value="">Anyone</option>{memberList(s).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label className="check-row"><input type="checkbox" checked={f.oneOff} onChange={(e) => set({ oneOff: e.target.checked })} /><span>One-off: remove it once it's done</span></label>
        <div className="row-inline">
          <button className="btn">{quest ? 'Save' : 'Add quest'}</button>
          {quest && <button type="button" className="btn ghost" onClick={async () => { if (await run('deleteChore', { id: quest.id })) onClose(); }}>Delete</button>}
        </div>
      </form>
    </Modal>
  );
}

function EndWeek({ s, onClose, onConfirm }) {
  const M = maxHP(s), d = Math.min(dealt(s), M), won = M > 0 && d >= M;
  const pending = hitList(s).filter((h) => h.state === 'pending').length;
  return (
    <Modal title={dayIndex() >= 5 ? 'Sunday reveal' : 'End the week early?'} onClose={onClose}>
      <p>{won ? `The boss is beaten. Ending now gives everyone the loot chest.` : `${M - d} HP left. If you end now, the boss escapes and burns a decoration.`}</p>
      {pending > 0 && <p className="err">{pending} quest{pending > 1 ? 's are' : ' is'} still waiting for a teammate’s check and won’t count.</p>}
      {dayIndex() < 5 && <p className="meta">The week also ends on its own when Monday comes.</p>}
      <div className="row-inline"><button className="btn orange" onClick={onConfirm}>{won ? 'Claim the loot' : 'End the week'}</button><button className="btn ghost" onClick={onClose}>Not yet</button></div>
    </Modal>
  );
}

function Reveal({ s, r, onClose, village }) {
  useEffect(() => { if (r.won) village?.confetti(); else if (r.burned) village?.fire(r.burned); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const best = Object.entries(r.perMember || {}).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="reveal">
      <div className="card">
        <h2>{r.won ? 'Victory!' : 'It got away'}</h2>
        <p>{r.won ? `The guild beat ${r.bossName}. Everyone gets the loot chest.` : `${r.bossName} escaped with ${r.hp - r.dealt} HP left.${r.burned ? ' On its way out it torched the flower garden.' : ''} Houses and buildings are safe.`}</p>
        {r.won && <div className="cost center">{Object.entries(WIN_LOOT).map(([k, v]) => <Pill key={k} k={k} v={`+${v}`} />)}</div>}
        <p className="meta">{r.choresDone} of {r.choresPlanned} quests done{best && s.members[best[0]] ? ` · Top damage: ${s.members[best[0]].name} (${best[1]})` : ''}</p>
        <p className="meta">A new boss has arrived: {bossFor(s.week.bossIndex).name}.</p>
        <div><button className="btn" onClick={onClose}>{r.won ? 'To the village' : 'We’ll get it next week'}</button></div>
      </div>
    </div>
  );
}

function Settings({ s, me, isAdult, hid, store, run, onClose, onLeave }) {
  const [view, setView] = useState('main');
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(formatCode(hid)); setCopied(true); } catch { setCopied(false); } };
  if (view === 'history') return <History s={s} onClose={onClose} onBack={() => setView('main')} />;
  if (view === 'members') return <Members s={s} isAdult={isAdult} run={run} onClose={onClose} onBack={() => setView('main')} />;
  return (
    <Modal title={s.name} onClose={onClose}>
      <div className="stack">
        {store.mode === 'firebase' && (
          <div className="codebox">
            <span className="meta">Guild code: share it with your household so they can join on their own phones.</span>
            <div className="row-inline"><code>{formatCode(hid)}</code><button className="btn sm blue" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
          </div>
        )}
        <button className="btn ghost" onClick={() => setView('history')}>Pilot log: weeks so far</button>
        <button className="btn ghost" onClick={() => setView('members')}>Members & PINs</button>
        <button className="btn ghost" onClick={onLeave}>Leave this guild on this device</button>
        {store.mode === 'local' && <p className="meta">Single-device mode: this guild is saved in this browser only. Clearing site data deletes it.</p>}
        {!isAdult && me && <p className="meta">Adults can edit quests and end the week.</p>}
      </div>
    </Modal>
  );
}

function History({ s, onClose, onBack }) {
  const h = [...(s.history || [])].reverse();
  return (
    <Modal title="Pilot log" onClose={onClose}>
      <button className="linkbtn" onClick={onBack}>← Back</button>
      {h.length ? (
        <div className="tablewrap"><table className="log">
          <thead><tr><th>Week</th><th>Boss</th><th>Quests done</th><th>Damage</th><th>Result</th></tr></thead>
          <tbody>{h.map((r) => <tr key={r.endedAt}><td>{String(r.weekId).replace('-W', ' W')}</td><td>{r.bossName}</td><td>{r.choresDone}/{r.choresPlanned}</td><td>{r.dealt}/{r.hp}</td><td>{r.won ? 'Beaten' : 'Escaped'}</td></tr>)}</tbody>
        </table></div>
      ) : <p className="meta">No finished weeks yet. Compare these numbers with your Week 0 baseline from the fridge pilot.</p>}
    </Modal>
  );
}

function Members({ s, isAdult, run, onClose, onBack }) {
  const [name, setName] = useState(''); const [role, setRole] = useState('kid');
  const [pinFor, setPinFor] = useState(null); const [pin, setPin] = useState('');
  return (
    <Modal title="Members" onClose={onClose}>
      <button className="linkbtn" onClick={onBack}>← Back</button>
      <div className="stack">
        {memberList(s).map((m) => (
          <div className="row" key={m.id}>
            <div className="av" style={{ background: m.color }}>{m.name[0]}</div>
            <div><b>{m.name}</b><span className="meta">{m.role === 'kid' ? 'Kid' : 'Adult'} · {m.pinHash ? 'PIN set' : 'No PIN'}</span></div>
            {isAdult && <button className="btn ghost sm" onClick={() => { setPinFor(m.id); setPin(''); }}>{m.pinHash ? 'Change PIN' : 'Set PIN'}</button>}
          </div>
        ))}
        {pinFor && (
          <form className="row-inline" onSubmit={async (e) => { e.preventDefault(); const hash = pin ? await hashPin(pin) : null; if (await run('updateMember', { id: pinFor, patch: { pinHash: hash } })) setPinFor(null); }}>
            <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4–6 digits, blank = none" aria-label="New PIN" />
            <button className="btn sm">Save</button>
          </form>
        )}
        <p className="meta">A PIN stops someone switching into another player on a shared device. It's a family lock, not real security.</p>
        {isAdult && s.memberOrder.length < 6 && (
          <form className="row-inline" onSubmit={async (e) => { e.preventDefault(); if (await run('addMember', { member: { name, role } })) setName(''); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New member" maxLength={20} aria-label="New member name" />
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="kid">Kid</option><option value="adult">Adult</option></select>
            <button className="btn sm" disabled={!name.trim()}>Add</button>
          </form>
        )}
      </div>
    </Modal>
  );
}
