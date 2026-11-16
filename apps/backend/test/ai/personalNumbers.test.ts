import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { maskPersonalNumbers } from "../../server/apis/v2/services/ai/personalNumbers.ts";

describe("maskPersonalNumbers", () => {
  for (const [input, expected] of [
    ["19791027-5934", "xxxxxxxx-xxxx"],
    ["791027-5934", "xxxxxx-xxxx"],
    ["7910275934", "xxxxxxxxxx"],
    ["197910275934", "xxxxxxxxxxxx"],
    // Over 100 years old
    ["191027+5934", "xxxxxx+xxxx"],
    ["791027 5934", "xxxxxx xxxx"],
    // A coordination number adds 60 to the day
    ["791087-5934", "xxxxxx-xxxx"],
    ["20051231-1234", "xxxxxxxx-xxxx"],
  ]) {
    test(`masks ${input}`, () => {
      assert.equal(maskPersonalNumbers(input), expected);
    });
  }

  test("masks numbers within a text, and keeps the rest", () => {
    assert.equal(
      maskPersonalNumbers("Jag (19791027-5934) och 7910275934, hjälp!"),
      "Jag (xxxxxxxx-xxxx) och xxxxxxxxxx, hjälp!"
    );
  });

  for (const input of [
    "6340123",
    "125000.5",
    "6340123 125000",
    "1234567890123",
    "791327-5934",
    "791000-5934",
    "791032-5934",
    "79102-5934",
    "791027-593",
    "Getakärr 4:12",
    "2024-10-27",
  ]) {
    test(`leaves ${input} alone`, () => {
      assert.equal(maskPersonalNumbers(input), input);
    });
  }
});
