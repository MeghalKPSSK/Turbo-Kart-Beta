import { CreditChip, SetupHeader } from '../components/Chrome';
import { formatTime, ordinal } from '../utils/format';
import { CAREER_TIERS, CUPS, driverLevel, totalStars } from '../game/data/career';

export default function RecordsScreen({ profile, onBack, onRace }) {
    return (
        <section className="setup-screen records-screen">
            <SetupHeader back="LEAGUE" onBack={onBack} eyebrow="YOUR CAREER PROFILE" title="RACE RECORDS"><CreditChip credits={profile.credits} /></SetupHeader>
            <div className="record-grid">
                <div><span>RACES ENTERED</span><b>{profile.races}</b></div>
                <div><span>VICTORIES</span><b>{profile.wins}</b></div>
                <div><span>BEST FINISH</span><b>{profile.races ? ordinal(profile.bestFinish) : '—'}</b></div>
                <div><span>FASTEST FINISH</span><b>{formatTime(profile.bestTime)}</b></div>
                <div><span>CAREER POINTS</span><b>{(profile.totalPoints || 0).toLocaleString()}</b></div>
                <div><span>CAREER STARS</span><b>{totalStars(profile.stars)} / {CAREER_TIERS.length * 18}</b></div>
                <div><span>BOSSES BEATEN</span><b>{profile.bosses.length} / {CAREER_TIERS.length}</b></div>
                <div><span>CUPS WON</span><b>{Object.values(profile.cups).filter((place) => place === 1).length} / {CUPS.length}</b></div>
                <div><span>DRIVER LEVEL</span><b>{driverLevel(profile.xp).level}</b></div>
                <div><span>BEST RACE SCORE</span><b>{(profile.bestScore || 0).toLocaleString()}</b></div>
                <div><span>TAKEDOWNS</span><b>{profile.takedowns || 0}</b></div>
            </div>
            <button className="button-primary records-cta" onClick={onRace}>GET BACK OUT THERE <span>↗</span></button>
        </section>
    );
}
