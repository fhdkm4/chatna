const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 4000;
const MS_PER_CHAR = 35;
const JITTER_MS = 500;

export function calculateTypingDelay(text: string): number {
  const baseDelay = Math.min(text.length * MS_PER_CHAR, MAX_DELAY_MS);
  const jitter = Math.random() * JITTER_MS - JITTER_MS / 2;
  return Math.max(MIN_DELAY_MS, Math.round(baseDelay + jitter));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function simulateTypingDelay(text: string): Promise<void> {
  const delay = calculateTypingDelay(text);
  await sleep(delay);
}
