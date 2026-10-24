import { memo } from 'react';
import './RaceHUD.css';

function formatGap(gap) {
    if (gap === 0) return '';
    return `${gap > 0 ? '▲' : '▼'} ${Math.abs(gap)}m`;
}

function Minimap({ path, dots }) {
    if (!path?.length) return null;
    const points = path.map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 100).toFixed(1)}`).join(' ');
    return (
        <div className="hud-minimap" aria-label="Track map">
            <svg viewBox="0 0 100 100">
                <polyline className="hud-minimap-road" points={`${points} ${points.split(' ')[0]}`} />
                <polyline className="hud-minimap-line" points={`${points} ${points.split(' ')[0]}`} />
                <circle className="hud-minimap-start" cx={path[0][0] * 100} cy={path[0][1] * 100} r="2.2" />
                {dots?.filter((d) => !d.isPlayer).map((d, index) => (
                    <circle key={index} className={`hud-dot rival ${d.wrecked ? 'wrecked' : ''}`} cx={d.pos[0] * 100} cy={d.pos[1] * 100} r="2.4" />
                ))}
                {dots?.filter((d) => d.isPlayer).map((d, index) => (
                    <circle key={`p${index}`} className="hud-dot player" cx={d.pos[0] * 100} cy={d.pos[1] * 100} r="3.6" />
                ))}
            </svg>
        </div>
    );
}

function NitroBar({ value, active }) {
    const segments = 20;
    const lit = Math.round((value / 100) * segments);
    return (
        <div className={`hud-nitro ${active ? 'active' : ''}`}>
            <div className="hud-nitro-label"><span>{active ? 'NITRO · BLUE FLAME' : 'NITRO'}</span><b>{value}%</b></div>
            <div className="hud-nitro-bar">
                {Array.from({ length: segments }, (_, i) => <i key={i} className={i < lit ? 'on' : ''} />)}
            </div>
        </div>
    );
}

function RaceHUD({ hud, vehicle, eventLabel, eventTitle, minimapPath, onPause }) {
    const rows = hud.leaderboard || [];
    const playerIndex = rows.findIndex((row) => row.isPlayer);
    const visible = rows.slice(0, 5);
    if (playerIndex >= 5) visible.push(rows[playerIndex]);
    const speedClass = hud.nitroActive ? 'nitro' : hud.speed > 220 ? 'fast' : '';
    return (
        <>
            <div className={`fx-nitro-lines ${hud.nitroActive ? 'on' : ''}`} />
            <div className={`fx-nitro-vignette ${hud.nitroActive ? 'on' : ''}`} />
            <div className="fx-damage" style={{ opacity: Math.min(0.85, hud.damageFlash || 0) }} />
            {hud.wrongWay && <div className="fx-wrong-way" />}

            <header className="race-topline">
                <div className="race-event-label"><span>{eventLabel}</span><b>{eventTitle}</b></div>
                <div className="race-lap-pill">LAP <b>{hud.lap}</b><i>/</i>{hud.totalLaps}</div>
                <div className="race-score-pill"><small>SCORE</small><b>{(hud.score || 0).toLocaleString()}</b></div>
                <div className={`race-coin-pill ${hud.toast?.kind === 'coin' ? 'pop' : ''}`}><i>◈</i><b>{hud.coins || 0}</b><small>COINS</small></div>
                <div className="race-place"><b>{String(hud.position).padStart(2, '0')}</b><span> / {hud.totalRacers}<small>POSITION</small></span></div>
                <button className="race-pause" onClick={onPause} aria-label="Pause">Ⅱ</button>
            </header>

            {hud.wrongWay && (
                <div className="hud-wrong-way" role="alert">
                    <div className="hud-wrong-arrow">↶</div>
                    <b>WRONG WAY</b>
                    <span>{hud.reversing ? 'You are reversing against the race direction' : 'Turn around - the race goes the other way'}</span>
                </div>
            )}

            <div className="race-toast" aria-live="polite">{hud.toast && <span className={`toast-${hud.toast.kind}`}>{hud.toast.text}</span>}</div>
            {hud.banner && (
                <div className={`hud-banner ${hud.banner.kind}`}><b>{hud.banner.text}</b><span>{hud.banner.sub}</span></div>
            )}
            {hud.airtime && <div className="hud-air">AIRBORNE · {hud.airTime.toFixed(1)}s · STEER TO BARREL ROLL</div>}

            <aside className="hud-leaderboard">
                {visible.map((row) => (
                    <div key={`${row.place}-${row.name}`} className={`row ${row.isPlayer ? 'me' : ''} ${row.wrecked ? 'wrecked' : ''}`}>
                        <b>{row.place}</b><span>{row.name}</span><small>{row.isPlayer ? '' : formatGap(row.gap)}</small>
                    </div>
                ))}
            </aside>
            <Minimap path={minimapPath} dots={hud.dots} />

            <div className="race-bottom-left">
                <span>ROAD LEAGUE / {vehicle.type}</span>
                <b>{vehicle.name}</b>
                <div className={`race-driving-state ${hud.wrongWay ? 'wrong-way' : ''}`}>
                    <i />{hud.wrongWay ? 'WRONG DIRECTION' : hud.recovering ? 'WRECKED · RECOVERING' : hud.airtime ? 'AIRBORNE' : hud.drifting ? 'DRIFTING' : hud.reversing ? 'REVERSING' : 'RACING LINE'}
                </div>
                <div className="hud-condition"><span>CONDITION</span><i><em style={{ width: `${100 - hud.damage}%` }} className={hud.damage > 65 ? 'low' : ''} /></i><b>{100 - hud.damage}%</b></div>
            </div>

            <div className="race-controls-hint">
                <kbd>W</kbd><span>ACCEL</span><kbd>S</kbd><span>BRAKE / REVERSE</span><kbd>A</kbd><kbd>D</kbd><span>STEER</span>
                <kbd>SHIFT</kbd><span>NITRO</span><kbd>SPACE</kbd><span>DRIFT</span><kbd>R</kbd><span>RESET</span>
            </div>

            <div className={`hud-dash ${speedClass}`}>
                <div className="hud-speed"><strong>{hud.speed}</strong><span>KM/H</span><em className="hud-gear">{hud.gear}</em></div>
                <div className="hud-rpm"><i style={{ width: `${Math.round((hud.rpm || 0) * 100)}%` }} /></div>
                <NitroBar value={hud.boost} active={hud.nitroActive} />
                {hud.drifting && <div className="hud-drift"><span>DRIFT</span><i style={{ width: `${Math.round((hud.driftCharge || 0) * 100)}%` }} /></div>}
            </div>
            <div className="race-progress-track"><i style={{ width: `${Math.min(100, (hud.progress || 0) * 100)}%` }} /></div>
        </>
    );
}

export default memo(RaceHUD);
