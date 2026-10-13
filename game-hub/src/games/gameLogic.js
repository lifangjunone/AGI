export function isBetterScore(mode, previous, candidate) {
  if (!Number.isFinite(candidate)) return false;
  if (!Number.isFinite(previous)) return true;
  return mode === "higher" ? candidate > previous : candidate < previous;
}

export function createMemorySequence(length, size = 9, random = Math.random) {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError("Sequence length must be a positive integer");
  }
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError("Grid size must be at least 2");
  }

  return Array.from({ length }, () => Math.floor(random() * size));
}

export function pickDifferentIndex(previous, size, random = Math.random) {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError("Size must be at least 2");
  }

  const offset = 1 + Math.floor(random() * (size - 1));
  return (previous + offset) % size;
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createMathQuestion(random = Math.random) {
  const operationIndex = Math.floor(random() * 3);
  let left;
  let right;
  let answer;
  let symbol;

  if (operationIndex === 0) {
    left = 4 + Math.floor(random() * 36);
    right = 3 + Math.floor(random() * 25);
    answer = left + right;
    symbol = "+";
  } else if (operationIndex === 1) {
    left = 14 + Math.floor(random() * 36);
    right = 3 + Math.floor(random() * (left - 2));
    answer = left - right;
    symbol = "−";
  } else {
    left = 2 + Math.floor(random() * 10);
    right = 2 + Math.floor(random() * 9);
    answer = left * right;
    symbol = "×";
  }

  const candidates = new Set([answer]);
  const offsets = [1, -1, 2, -2, 3, -3, 5, -5, 10, -10];
  let cursor = Math.floor(random() * offsets.length);
  while (candidates.size < 4) {
    const candidate = answer + offsets[cursor % offsets.length];
    if (candidate >= 0) candidates.add(candidate);
    cursor += 1;
  }

  return {
    prompt: `${left} ${symbol} ${right}`,
    answer,
    options: shuffle([...candidates], random),
  };
}
