import { CAREER_TIERS, CUPS, CUP_POINTS, cupUnlocked, trackById } from '../game/data/career';
import { cupTable } from '../state/profile';
import { SetupHeader, Wallet } from '../components/Chrome';
import { ordinal } from '../utils/format';

export function CupStandings({ table, limit = 9 }) {
    return (
        <ol className="cup-table">
            {table.slice(0, limit).map((row, index) => <li key={row.name} className={row.isPlayer ? 'me' : ''}><i>{index + 1}</i><span>{row.name}</span><b>{row.score}</b></li>)}
        </ol>
    );
}

export default function CupsScreen({ profile, onBack, onStart, onContinue, onAbandon }) {
    const active = profile.activeCup;
    const activeCup = active ? CUPS.find((cup) => cup.id === active.id) : null;
    return (
        <section className="setup-screen cups-screen">
            <SetupHeader back="LEAGUE" onBack={onBack} eyebrow={`TOURNAMENTS · POINTS ${CUP_POINTS.slice(0, 8).join(' · ')}`} title="THE CUPS"><Wallet profile={profile} /></SetupHeader>
            {activeCup && (
                <div className="story-intro cup-active">
                    <div><span>CUP IN PROGRESS · ROUND {active.round + 1} OF {activeCup.tracks.length}</span><h2>{activeCup.name}</h2><p>Next round: {trackById(activeCup.tracks[active.round]).name}. Your points carry over between rounds.</p>
                        <div className="cup-actions"><button className="button-primary" onClick={onContinue}>RACE ROUND {active.round + 1} <span>↗</span></button><button className="button-secondary" onClick={onAbandon}>ABANDON CUP</button></div>
                    </div>
                    {active.round > 0 && <CupStandings table={cupTable(active.points)} limit={5} />}
                </div>
            )}
            <div className="course-grid cup-grid">
                {CUPS.map((cup) => {
                    const open = cupUnlocked(cup, profile.stars);
                    const best = profile.cups[cup.id];
                    const tone = trackById(cup.tracks[0]);
                    return (
                        <div key={cup.id} className={`course-card cup-card ${open ? '' : 'locked'}`} style={{ '--course-tone': tone.tone, '--course-sky': tone.sky }}>
                            <div className="course-card-art"><div className="course-art-ridge" /><div className="course-art-road" /><span className="course-number">{cup.tracks.length} ROUNDS</span><span className="course-grade">{best ? `BEST ${ordinal(best)}` : open ? 'OPEN' : 'LOCKED'}</span></div>
                            <div className="course-info"><small>{CAREER_TIERS[cup.tier].name} TIER · ¢{cup.prize.toLocaleString()} TO THE WINNER</small><b>{cup.name}</b><p>{cup.blurb}</p>
                                <ul className="cup-rounds">{cup.tracks.map((id, index) => <li key={`${id}-${index}`}>{trackById(id).name}</li>)}</ul>
                                <button className="button-secondary" disabled={!open || Boolean(active)} onClick={() => onStart(cup.id)}>{open ? (active ? 'FINISH YOUR CUP FIRST' : 'ENTER CUP') : `OPENS AT ${CAREER_TIERS[cup.tier].name} TIER`}</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
