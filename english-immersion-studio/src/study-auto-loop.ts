import type { StudyModule } from "./study-curriculum";

export type StudyLoopPosition = {
  module: StudyModule;
  index: number;
};

export const studyLoopModuleOrder: StudyModule[] = [
  "words",
  "structures",
  "grammar",
  "phrases",
  "collocations"
];

export function buildStudyLoopSequence(
  counts: Record<StudyModule, number>
): StudyLoopPosition[] {
  return studyLoopModuleOrder.flatMap((module) =>
    Array.from(
      { length: Math.max(0, Math.floor(counts[module])) },
      (_, index) => ({ module, index })
    )
  );
}

export function findStudyLoopOrdinal(
  sequence: StudyLoopPosition[],
  module: StudyModule,
  index: number
): number {
  const ordinal = sequence.findIndex(
    (position) => position.module === module && position.index === index
  );
  return Math.max(0, ordinal);
}

export function nextStudyLoopOrdinal(
  sequenceLength: number,
  ordinal: number
): number {
  if (sequenceLength <= 0) return 0;
  return (ordinal + 1) % sequenceLength;
}
