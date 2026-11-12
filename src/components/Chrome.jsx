// Small pieces of screen furniture shared by the menu screens.
import { driverLevel } from '../game/data/career';

export function CreditChip({ credits }) {
    return <span className="credit-chip"><i>¢</i>{credits.toLocaleString()}</span>;
}

export function Wallet({ profile }) {
    const { level, progress } = driverLevel(profile.xp);
    return (
        <div className="garage-wallet">
            <span className="level-chip" title="Driver level"><small>LEVEL</small><b>{level}</b><i><em style={{ width: `${Math.round(progress * 100)}%` }} /></i></span>
            <CreditChip credits={profile.credits} />
        </div>
    );
}

export function Stars({ count, of = 3 }) {
    return <span className="stars" aria-label={`${count} of ${of} stars`}>{Array.from({ length: of }, (_, index) => <i key={index} className={index < count ? 'on' : ''}>★</i>)}</span>;
}

export function SetupHeader({ back, onBack, eyebrow, title, children }) {
    return (
        <header className="setup-header">
            <button className="back-link" onClick={onBack}>← {back}</button>
            <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
            {children}
        </header>
    );
}
