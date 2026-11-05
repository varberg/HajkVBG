import type { Embedder } from "../../server/apis/v2/services/ai/search/embedder.ts";

// Words that count as the same meaning, which is what keyword search can't see.
const CONCEPTS = [
  ["översvämning", "skyfall"],
  ["plan", "bebyggelse"],
  ["hemlig"],
  ["egen"],
];

/** One dimension per concept, plus one so that no vector is all zeros. */
export function conceptVector(text: string): Float32Array {
  const lower = text.toLowerCase();
  return Float32Array.from([
    0.01,
    ...CONCEPTS.map((words) => (words.some((w) => lower.includes(w)) ? 1 : 0)),
  ]);
}

export interface FakeEmbedder extends Embedder {
  calls: Array<{ texts: string[]; inputType: string }>;
  fail: (inputType: string, callNumber: number) => boolean;
}

export const fakeEmbedder = (
  id = "fake:model",
  maxBatchTexts = 100
): FakeEmbedder => {
  const embedder: FakeEmbedder = {
    id,
    maxBatchTexts,
    calls: [],
    fail: () => false,
    async embed(texts, inputType) {
      embedder.calls.push({ texts, inputType });
      if (embedder.fail(inputType, embedder.calls.length)) {
        throw new Error("Embedding API is down");
      }
      return texts.map(conceptVector);
    },
  };
  return embedder;
};

export const documentTexts = (embedder: FakeEmbedder): string[] =>
  embedder.calls
    .filter((call) => call.inputType === "document")
    .flatMap((call) => call.texts);
