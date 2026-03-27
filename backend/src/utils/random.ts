export function randomIntInclusive(min: number, max: number): number {
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

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

