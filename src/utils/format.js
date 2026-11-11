export function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '--:--.-';
    const minutes = Math.floor(seconds / 60);
    const remaining = (seconds % 60).toFixed(1).padStart(4, '0');
    return `${String(minutes).padStart(2, '0')}:${remaining}`;
}

export const pad2 = (value) => String(value).padStart(2, '0');

export function ordinal(place) {
    const suffix = place === 1 ? 'ST' : place === 2 ? 'ND' : place === 3 ? 'RD' : 'TH';
    return `${place}${suffix}`;
}
