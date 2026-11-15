// Counts the downloads of the race being set up, so the loading screen can show how far
// along it is. Loads that are already cached count as done at once.

let total = 0;
let done = 0;
let listener = null;

const notify = () => listener?.(total ? done / total : 0);

export const loadProgress = {
    begin(onChange) {
        total = 0;
        done = 0;
        listener = onChange;
        notify();
    },
    end() {
        listener = null;
    },
    // Wraps a load. Returns the same promise, so errors still reach the caller.
    track(promise) {
        total += 1;
        notify();
        const settle = () => { done += 1; notify(); };
        promise.then(settle, settle);
        return promise;
    }
};
