export function toUtcDateKey(d) {
    const year = d.getUTCFullYear();
    const month = `${d.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${d.getUTCDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}
export function startOfUtcDay(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
export function addUtcDays(d, days) {
    const copy = new Date(d.getTime());
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
}
