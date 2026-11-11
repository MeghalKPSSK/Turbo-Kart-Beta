import './TouchControls.css';

// On-screen driving buttons for phones and tablets. Each button holds its action for as long
// as a finger stays on it; pointer capture keeps it held if the finger slides off the edge.
function TouchButton({ action, label, className = '', press }) {
    const down = (event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        press(action, true);
    };
    const up = (event) => {
        event.preventDefault();
        press(action, false);
    };
    return (
        <button
            type="button"
            className={`touch-button ${className}`}
            aria-label={label}
            onPointerDown={down}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            onContextMenu={(event) => event.preventDefault()}
        >{label}</button>
    );
}

export default function TouchControls({ press }) {
    return (
        <div className="touch-controls">
            <div className="touch-cluster touch-steer">
                <TouchButton action="left" label="◀" className="steer" press={press} />
                <TouchButton action="right" label="▶" className="steer" press={press} />
            </div>
            <div className="touch-cluster touch-pedals">
                <TouchButton action="drift" label="DRIFT" className="small" press={press} />
                <TouchButton action="boost" label="NITRO" className="small nitro" press={press} />
                <TouchButton action="brake" label="BRAKE" className="pedal brake" press={press} />
                <TouchButton action="accelerate" label="GAS" className="pedal gas" press={press} />
            </div>
            <TouchButton action="reset" label="RESET" className="touch-reset" press={press} />
        </div>
    );
}
