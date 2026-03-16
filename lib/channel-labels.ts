const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function getChannelLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    return String(index);
  }

  if (index < ALPHABET.length) {
    return ALPHABET[index];
  }

  return `Ch${index + 1}`;
}

export function getChannelLabels(count: number): string[] {
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  return Array.from({ length: safeCount }, (_, index) => getChannelLabel(index));
}
