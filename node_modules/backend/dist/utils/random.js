export function randomIntInclusive(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error("min/max must be finite");
    }
    const minInt = Math.ceil(min);
    const maxInt = Math.floor(max);
    if (maxInt < minInt) {
        throw new Error("max must be >= min");
    }
    return Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;
}
export function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
