import { CreditChip, SetupHeader, Stars } from '../components/Chrome';
import { CupStandings } from './CupsScreen';
import { EVENT_TYPES, vehicleById } from '../game/data/career';
import { formatTime, ordinal, pad2 } from '../utils/format';

export default function ResultScreen({ result, profile, onContinue, onRetry, onGarage, onHome }) {
    const { summary } = result;
    const career = summary.mode === 'career';
    const cup = summary.cup;
    const positional = !career || ['race', 'duel', 'elimination'].includes(summary.event.type);
    const headline = result.busted ? 'BUSTED' : result.position === 1 ? 'THE ROAD BELONGS TO YOU' : result.position <= 3 ? 'PODIUM FINISH' : 'THE NEXT RUN IS YOURS';
    const title = career ? summary.event.name.toUpperCase() : cup ? `${cup.cup.name} · ROUND ${cup.round}` : 'RACE REPORT';
    const continueLabel = career ? 'BACK TO CAREER' : cup ? (cup.finished ? 'BACK TO THE CUPS' : `NEXT ROUND: ${cup.round + 1} OF ${cup.cup.tracks.length}`) : 'NEXT EVENT';
    return (
        <section className="result-screen">
            <SetupHeader back="LEAGUE" onBack={onHome} eyebrow={`${career ? EVENT_TYPES[summary.event.type].label : 'EVENT COMPLETE'} · ${result.track.name}`} title={title}><CreditChip credits={profile.credits} /></SetupHeader>
            <div className="result-layout">
                <div className="result-place-panel">
                    {career && <div className="result-stars"><Stars count={summary.stars} /></div>}
                    <span>{positional ? 'FINISH POSITION' : 'RESULT'}</span>
                    {positional ? <b>{pad2(result.position)}<i>/{pad2(result.totalRacers)}</i></b> : <b className="result-metric">{summary.event.type === 'drift' ? result.driftPoints.toLocaleString() : summary.event.type === 'takedown' ? result.takedowns : summary.event.type === 'pursuit' ? (result.busted ? '✕' : '✓') : formatTime(result.time)}</b>}
                    <small>{career ? summary.line : headline}</small>
                </div>
                <div className="result-details">
                    {summary.bossLine && <div className={`boss-line ${result.position === 1 ? 'clear' : ''}`}><b>{summary.bossName}</b><span>“{summary.bossLine}”</span></div>}
                    {summary.wonVehicle && <div className="chapter-result clear"><b>NEW MACHINE</b><span>{vehicleById(summary.wonVehicle).name} is in your garage.</span></div>}
                    {summary.unlockedTier && <div className="chapter-result clear"><b>{summary.unlockedTier.name} TIER OPEN</b><span>The {summary.unlockedTier.crew.name} are waiting.</span></div>}
                    {summary.levelUp && <div className="chapter-result clear"><b>DRIVER LEVEL {summary.levelUp}</b><span>Your name is getting around.</span></div>}
                    {cup && (
                        <div className="cup-result">
                            <span className="section-kicker">{cup.finished ? `FINAL STANDINGS · YOU FINISHED ${ordinal(cup.place)}` : `STANDINGS AFTER ROUND ${cup.round}`}</span>
                            <CupStandings table={cup.table} />
                            {cup.finished && <div className={`chapter-result ${cup.place === 1 ? 'clear' : ''}`}><b>{cup.place === 1 ? 'CUP WON' : cup.place <= 3 ? 'CUP PODIUM' : 'CUP COMPLETE'}</b><span>{cup.prize ? `Prize money ¢${cup.prize.toLocaleString()}.` : 'No prize money below third.'}</span></div>}
                        </div>
                    )}
                    <span className="section-kicker">RACE STATS</span>
                    <div className="result-stat"><span>TIME</span><b>{formatTime(result.time)}</b></div>
                    <div className="result-stat"><span>BEST LAP</span><b>{formatTime(result.bestLap)}</b></div>
                    <div className="result-stat"><span>TAKEDOWNS</span><b>{result.takedowns || 0}</b></div>
                    <div className="result-stat"><span>VEHICLE CONDITION</span><b>{100 - result.damage}%</b></div>
                    <div className="result-stat"><span>RACE SCORE</span><b>{(result.score || 0).toLocaleString()}</b></div>
                    <div className="result-reward"><span>PAYOUT{summary.starBonus ? ` · ¢${summary.starBonus.toLocaleString()} FOR NEW STARS` : ''}{result.coins ? ` · ${result.coins} COINS` : ''}</span><b>+¢{summary.payout.toLocaleString()}</b></div>
                    <button className="button-primary" onClick={onContinue}>{continueLabel} <span>↗</span></button>
                    {!cup && <button className="button-secondary" onClick={onRetry}>{career && summary.stars < 3 ? 'TRY AGAIN FOR MORE STARS' : 'RACE AGAIN'}</button>}
                    <button className="button-secondary" onClick={onGarage}>GARAGE</button>
                </div>
            </div>
        </section>
    );
}
