import test from "node:test";
import assert from "node:assert/strict";
import {
  createMathQuestion,
  createMemorySequence,
  isBetterScore,
  pickDifferentIndex,
} from "../src/games/gameLogic.js";

test("score comparison supports lower and higher modes", () => {
  assert.equal(isBetterScore("lower", undefined, 300), true);
  assert.equal(isBetterScore("lower", 300, 250), true);
  assert.equal(isBetterScore("lower", 250, 300), false);
  assert.equal(isBetterScore("higher", 4, 5), true);
  assert.equal(isBetterScore("higher", 5, 4), false);
  assert.equal(isBetterScore("higher", 5, Number.NaN), false);
});

test("memory sequence stays within the requested grid", () => {
  const values = [0, 0.2, 0.999, 0.5];
  let index = 0;
  const sequence = createMemorySequence(4, 9, () => values[index++]);
  assert.deepEqual(sequence, [0, 1, 8, 4]);
});

test("memory sequence rejects invalid dimensions", () => {
  assert.throws(() => createMemorySequence(0), RangeError);
  assert.throws(() => createMemorySequence(3, 1), RangeError);
});

test("different index never repeats the previous cell", () => {
  for (const random of [0, 0.25, 0.5, 0.999]) {
    const next = pickDifferentIndex(7, 16, () => random);
    assert.notEqual(next, 7);
    assert.ok(next >= 0 && next < 16);
  }
});

test("math question has one correct answer and unique options", () => {
  const randomValues = [0.1, 0.4, 0.2, 0.7, 0.3, 0.9, 0.5, 0.8];
  let index = 0;
  const question = createMathQuestion(() => randomValues[index++ % randomValues.length]);

  assert.match(question.prompt, /^\d+ [+\u2212×] \d+$/);
  assert.equal(question.options.length, 4);
  assert.equal(new Set(question.options).size, 4);
  assert.equal(question.options.filter((option) => option === question.answer).length, 1);
});

test("subtraction questions never produce negative answers", () => {
  const values = [0.5, 0.1, 0.999, 0.2, 0.4, 0.6, 0.8];
  let index = 0;
  const question = createMathQuestion(() => values[index++ % values.length]);
  assert.ok(question.answer >= 0);
});
