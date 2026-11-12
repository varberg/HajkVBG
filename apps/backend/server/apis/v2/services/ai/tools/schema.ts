import type {
  JsonSchema,
  Tool,
  ToolContext,
  ToolDefinition,
  ToolOutput,
} from "./types.ts";

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return Number.isInteger(value) ? "integer" : typeof value;
};

/**
 * @summary Check a value against a tool schema.
 * @description Strict mode makes the providers follow the schema, but the input
 * still comes from a model, and not every provider or gateway enforces it.
 * @returns What is wrong, or null if the value is valid
 */
export function validateInput(
  schema: JsonSchema,
  value: unknown,
  path = "input"
): string | null {
  const actual = typeOf(value);
  const types = [schema.type].flat();
  // An integer is a number too
  if (
    !types.includes(actual) &&
    !(actual === "integer" && types.includes("number"))
  ) {
    return `${path} must be of type ${[schema.type].flat().join(" or ")}.`;
  }
  if (schema.enum !== undefined && !schema.enum.includes(value as string)) {
    return `${path} must be one of: ${schema.enum.join(", ")}.`;
  }
  if (actual === "array" && schema.items !== undefined) {
    for (const [index, item] of (value as unknown[]).entries()) {
      const problem = validateInput(schema.items, item, `${path}[${index}]`);
      if (problem !== null) return problem;
    }
  }
  if (actual === "object" && schema.properties !== undefined) {
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object)) {
      if (schema.properties[key] === undefined) {
        return `${path}.${key} is not a known property.`;
      }
    }
    for (const [key, property] of Object.entries(schema.properties)) {
      if (!(key in object)) return `${path}.${key} is missing.`;
      const problem = validateInput(property, object[key], `${path}.${key}`);
      if (problem !== null) return problem;
    }
  }
  return null;
}

export const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const nullableEnum = (
  values: string[],
  description: string
): JsonSchema => ({
  type: ["string", "null"],
  enum: [...values, null],
  description,
});

export const idList = (description: string): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  description,
});

export const nullable = (schema: JsonSchema): JsonSchema => ({
  ...schema,
  type: [schema.type as string, "null"],
});

// Required and not nullable, as nullable inputs count against Claude's limit
export const offsetSchema: JsonSchema = {
  type: "integer",
  description: "How many items to skip, to fetch a later page. 0 is the first.",
};

/** Type the input of a tool's run, which validateInput has checked. */
export function define<Input>(
  tool: ToolDefinition & {
    run(input: Input, context: ToolContext): Promise<ToolOutput> | ToolOutput;
  }
): Tool {
  return tool as Tool;
}
