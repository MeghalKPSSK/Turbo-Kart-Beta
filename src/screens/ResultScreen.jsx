import { CreditChip, SetupHeader } from '../components/Chrome';
import { formatTime, pad2 } from '../utils/format';

export default function ResultScreen({ result, profile, onContinue, onRetry, onGarage, onHome }) {
    const story = result.mode === 'story';
    const headline = result.position === 1 ? 'THE ROAD BELONGS TO YOU' : result.position <= 3 ? 'PODIUM FINISH' : 'THE NEXT RUN IS YOURS';
    const continueLabel = story ? (result.chapterClear ? (result.chapterFinal ? 'REPLAY CAMPAIGN' : 'NEXT CHAPTER') : 'BACK TO STORY') : 'NEXT EVENT';
    return (
        <section className="result-screen">
            <SetupHeader back="LEAGUE" onBack={onHome} eyebrow={`EVENT COMPLETE · ${result.track.name}`} title="RACE REPORT"><CreditChip credits={profile.credits} /></SetupHeader>
            <div className="result-layout">
                <div className="result-place-panel"><span>FINISH POSITION</span><b>{pad2(result.position)}<i>/{pad2(result.totalRacers)}</i></b><small>{headline}</small></div>
                <div className="result-details">
                    <span className="section-kicker">RACE STATS</span>
                    <div className="result-stat"><span>TIME</span><b>{formatTime(result.time)}</b></div>
                    <div className="result-stat"><span>RACE SCORE</span><b>{(result.score || 0).toLocaleString()}</b></div>
                    <div className="result-stat"><span>ROAD COINS</span><b>{result.coins || 0}</b></div>
                    <div className="result-stat"><span>TAKEDOWNS</span><b>{result.takedowns || 0}</b></div>
                    <div className="result-stat"><span>BEST LAP</span><b>{formatTime(result.bestLap)}</b></div>
                    <div className="result-stat"><span>VEHICLE CONDITION</span><b>{100 - result.damage}%</b></div>
                    {story && (
                        <div className={`chapter-result ${result.chapterClear ? 'clear' : ''}`}>
                            <b>{result.chapterClear ? (result.chapterFinal ? 'CHAMPIONSHIP COMPLETE' : 'CHAPTER CLEARED') : 'CHAPTER NOT CLEARED'}</b>
                            <span>{result.chapterClear ? 'Your result unlocked the next race.' : `Finish ${result.chapter.goal === 1 ? '1st' : `in the top ${result.chapter.goal}`} to advance.`}</span>
                        </div>
                    )}
                    <div className="result-reward"><span>{story ? 'CHAPTER PAYOUT' : 'RACE PAYOUT'} · COINS WORTH ¢{(result.coins || 0) * 25}</span><b>+¢{result.credits}</b></div>
                    <button className="button-primary" onClick={onContinue}>{continueLabel} <span>↗</span></button>
                    <button className="button-secondary" onClick={onRetry}>RACE AGAIN</button>
                    <button className="button-secondary" onClick={onGarage}>RETURN TO GARAGE</button>
                </div>
            </div>
        </section>
    );
}
