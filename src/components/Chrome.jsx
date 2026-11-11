// Small pieces of screen furniture shared by the menu screens.

export function CreditChip({ credits }) {
    return <span className="credit-chip"><i>¢</i>{credits.toLocaleString()}</span>;
}

export function Wallet({ profile }) {
    return (
        <div className="garage-wallet">
            <CreditChip credits={profile.credits} />
            <span className="coin-wallet-chip"><i>◈</i>{(profile.roadCoins || 0).toLocaleString()}<small>ROAD COINS</small></span>
        </div>
    );
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
