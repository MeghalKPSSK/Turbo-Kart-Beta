import { useState } from 'react';
import { CAREER_TIERS, EVENT_TYPES, DRIVING_STYLES, eventLaps, tierStars, tierUnlocked, totalStars, trackById, trialTargets, vehicleById } from '../game/data/career';
import { SetupHeader, Stars, Wallet } from '../components/Chrome';
import { pad2 } from '../utils/format';

// What three stars take, in words, for the launch bar.
function goalLine(item) {
    switch (item.type) {
        case 'timeTrial': { const [one, two, three] = trialTargets(item); return `★ ${one}s · ★★ ${two}s · ★★★ ${three}s`; }
        case 'drift': return `★ ${item.targets[0]} · ★★ ${item.targets[1]} · ★★★ ${item.targets[2]} drift points`;
        case 'takedown': return `★ ${item.targets[0]} · ★★ ${item.targets[1]} · ★★★ ${item.targets[2]} takedowns in ${item.timeLimit || 120}s`;
        case 'pursuit': return '★ finish · ★★ one wreck · ★★★ no wrecks';
        case 'duel': return '★ finish · ★★ within 3s · ★★★ win';
        case 'elimination': return '★ last four · ★★ last two · ★★★ last one running';
        default: return '★ third · ★★ second · ★★★ win';
    }
}

export default function CareerScreen({ profile, selectedId, onSelect, onBack, onBuild }) {
    const stars = profile.stars;
    const total = totalStars(stars);
    const firstOpen = CAREER_TIERS.reduce((last, tier, index) => (tierUnlocked(index, stars) ? index : last), 0);
    const selectedTier = CAREER_TIERS.findIndex((tier) => tier.events.some((item) => item.id === selectedId));
    const [tierIndex, setTierIndex] = useState(selectedTier >= 0 ? selectedTier : firstOpen);
    const tier = CAREER_TIERS[tierIndex];
    const open = tierUnlocked(tierIndex, stars);
    const beaten = profile.bosses.includes(tier.id);
    const boss = tier.crew.boss;
    const selected = tier.events.find((item) => item.id === selectedId) || null;

    return (
        <section className="setup-screen career-screen">
            <SetupHeader back="LEAGUE" onBack={onBack} eyebrow={`CAREER · ${total} OF ${CAREER_TIERS.length * 18} STARS`} title="ROAD TO THE CROWN"><Wallet profile={profile} /></SetupHeader>
            <div className="tier-tabs">
                {CAREER_TIERS.map((item, index) => {
                    const unlocked = tierUnlocked(index, stars);
                    return (
                        <button key={item.id} className={`${index === tierIndex ? 'active' : ''} ${unlocked ? '' : 'locked'}`} onClick={() => setTierIndex(index)}>
                            <small>TIER {pad2(index + 1)}</small><b>{item.name}</b>
                            <span>{unlocked ? `${tierStars(index, stars)} / 18 ★` : `NEEDS ${item.requires} ★`}</span>
                        </button>
                    );
                })}
            </div>
            <div className="story-intro crew-intro" style={{ '--crew': tier.crew.colour }}>
                <div><span>RIVAL CREW · {tier.crew.name}</span><h2>{beaten ? `${boss.name} is beaten` : `Boss: ${boss.name}`}</h2><p>{open ? tier.story : `Earn ${tier.requires - total} more star${tier.requires - total === 1 ? '' : 's'} to open this tier.`}</p></div>
                <b>{DRIVING_STYLES[boss.style].label}<small>{vehicleById(boss.vehicleId).name.toUpperCase()} · {beaten ? 'IN YOUR GARAGE' : 'YOURS IF YOU WIN'}</small></b>
            </div>
            <div className="story-grid event-grid">
                {tier.events.map((item, index) => {
                    const track = trackById(item.trackId);
                    const earned = stars[item.id] || 0;
                    return (
                        <button key={item.id} className={`story-card ${item.id === selectedId ? 'selected' : ''} ${open ? '' : 'locked'}`} disabled={!open} onClick={() => onSelect(item.id)} style={{ '--course-tone': track.tone, '--course-sky': track.sky }}>
                            <div className="story-card-art"><div className="course-art-ridge" /><div className="course-art-road" /><span>EVENT {pad2(index + 1)} · {EVENT_TYPES[item.type].label}</span><b><Stars count={earned} /></b></div>
                            <div className="story-card-copy"><small>{track.name} · {track.biome}</small><strong>{item.name}</strong><p>{item.brief}</p><div><span>{item.type === 'takedown' ? `${item.timeLimit || 120} SECONDS` : item.type === 'elimination' ? 'LAST ONE RUNNING' : `${eventLaps(item)} LAPS`}</span><span>{earned === 3 ? 'MASTERED' : earned ? 'CLEARED' : 'NEW'}</span></div></div>
                        </button>
                    );
                })}
            </div>
            <div className="story-launch">
                <div><span>{selected ? `${EVENT_TYPES[selected.type].label} · ${EVENT_TYPES[selected.type].rule}` : 'CHOOSE AN EVENT'}</span><b>{selected ? `${selected.name} · ${goalLine(selected)}` : 'Stars open the next tier. Beat the boss to take their machine.'}</b></div>
                <button className="button-primary" disabled={!selected || !open} onClick={onBuild}>BUILD YOUR RIDE <span>↗</span></button>
            </div>
        </section>
    );
}
