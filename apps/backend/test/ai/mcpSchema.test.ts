import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  UnsupportedSchemaError,
  stripOmitted,
  toRegistrySchema,
} from "../../server/apis/v2/services/ai/mcp/mcpSchema.ts";
import { validateInput } from "../../server/apis/v2/services/ai/tools.ts";
import type { JsonSchema } from "../../server/apis/v2/services/ai/tools.ts";

/** The tool list of the routing server, as `tools/list` gave it. */
const routingTools = (): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> =>
  JSON.parse(
    fs.readFileSync(new URL("./routing-tools.json", import.meta.url), "utf-8")
  ).tools;

const schemaOf = (name: string) =>
  routingTools().find((tool) => tool.name === name)!.inputSchema;

/**
 * The server's AvoidArea takes free-form GeoJSON, which the subset can't hold,
 * so it always needs a replacement, as routingTools.ts gives it.
 */
const AREA: JsonSchema = {
  type: "object",
  properties: { feature_id: { type: "string" } },
  required: ["feature_id"],
  additionalProperties: false,
};

const convert = (
  schema: unknown,
  replacements: Record<string, JsonSchema> = {}
) => toRegistrySchema(schema, { AvoidArea: AREA, ...replacements });

// What the providers' strict modes reject, see JsonSchema in tools.ts
const FORBIDDEN = [
  "$ref",
  "$defs",
  "anyOf",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "default",
  "title",
];

function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (typeof value === "object" && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      keysOf(inner, keys);
    }
  }
  return keys;
}

describe("toRegistrySchema", () => {
  test("converts every routing tool to the strict subset", () => {
    for (const tool of routingTools()) {
      const schema = convert(tool.inputSchema);
      const keys = keysOf(schema);
      for (const word of FORBIDDEN) {
        assert.ok(!keys.has(word), `${tool.name} still has ${word}`);
      }
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties ?? {}));
    }
  });

  test("can't convert the server's AvoidArea without a replacement", () => {
    assert.throws(
      () => toRegistrySchema(schemaOf("route")),
      UnsupportedSchemaError
    );
  });

  test("inlines $defs and makes optional properties nullable", () => {
    const schema = convert(schemaOf("route"));
    const origin = schema.properties!.origin;
    assert.equal(origin.type, "object");
    assert.deepEqual(origin.required, ["x", "y", "srid", "label"]);
    assert.deepEqual(origin.properties!.srid.type, ["integer", "null"]);
    assert.deepEqual(origin.properties!.label.type, ["string", "null"]);
    assert.deepEqual(schema.properties!.mode.enum, [
      "car",
      "bike",
      "walk",
      "transit",
      null,
    ]);
  });

  test("puts a replacement in place of a $def, as the same object", () => {
    const location: JsonSchema = { type: "object", properties: {} };
    const schema = convert(schemaOf("multi_stop_route"), {
      Point: location,
    });
    assert.equal(schema.properties!.stops.items, location);
    assert.equal(schema.properties!.avoid.items, AREA);
  });

  test("accepts a valid call and rejects a bad one", () => {
    const schema = convert(schemaOf("reachable_within"));
    const origin = { x: 12.25, y: 57.1, srid: null, label: "Station" };
    assert.equal(
      validateInput(schema, {
        origin,
        minutes: [5, 10],
        mode: null,
        avoid: null,
      }),
      null
    );
    assert.match(
      validateInput(schema, {
        origin,
        minutes: "ten",
        mode: "car",
        avoid: null,
      })!,
      /minutes/
    );
  });

  test("refuses what the subset can't express", () => {
    const unsupported = [
      { type: "object", properties: { a: { oneOf: [{ type: "string" }] } } },
      {
        type: "object",
        properties: {
          a: { anyOf: [{ type: "string" }, { type: "integer" }] },
        },
      },
      {
        type: "object",
        properties: { a: { type: "object", additionalProperties: {} } },
      },
      { type: "string" },
    ];
    for (const schema of unsupported) {
      assert.throws(() => toRegistrySchema(schema), UnsupportedSchemaError);
    }
  });
});

describe("stripOmitted", () => {
  test("leaves out optional nulls, also inside $defs", () => {
    const args = {
      origin: { x: 1, y: 2, srid: 3007, label: null },
      destination: { x: 3, y: 4, srid: 4326, label: "Skola" },
      mode: null,
    };
    assert.deepEqual(stripOmitted(args, schemaOf("route")), {
      origin: { x: 1, y: 2, srid: 3007 },
      destination: { x: 3, y: 4, srid: 4326, label: "Skola" },
    });
  });

  test("keeps the nulls of required properties", () => {
    const schema = {
      type: "object",
      properties: { a: { anyOf: [{ type: "string" }, { type: "null" }] } },
      required: ["a"],
    };
    assert.deepEqual(stripOmitted({ a: null }, schema), { a: null });
  });
});
