import type { JsonSchema } from "../tools.ts";

type Node = Record<string, unknown>;

/** A schema that can't be expressed in the registry subset. */
export class UnsupportedSchemaError extends Error {}

const DEF_PREFIX = "#/$defs/";

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredOf = (node: Node): string[] =>
  Array.isArray(node.required) ? (node.required as string[]) : [];

function resolveRef(node: Node, defs: Node): { name: string; def: Node } {
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith(DEF_PREFIX)) {
    throw new UnsupportedSchemaError(`Unsupported $ref ${String(ref)}.`);
  }
  const name = ref.slice(DEF_PREFIX.length);
  const def = defs[name];
  if (!isNode(def)) {
    throw new UnsupportedSchemaError(`Unknown $ref ${ref}.`);
  }
  return { name, def };
}

/** The non-null branch of `anyOf [T, null]`, or null if it's another anyOf. */
function nullableBranch(node: Node): Node | null {
  const branches = node.anyOf;
  if (!Array.isArray(branches) || branches.length !== 2) {
    return null;
  }
  const others = branches.filter((b) => !(isNode(b) && b.type === "null"));
  return others.length === 1 && isNode(others[0]) ? others[0] : null;
}

function makeNullable(schema: JsonSchema): JsonSchema {
  const types = [schema.type].flat();
  if (types.includes("null")) {
    return schema;
  }
  return {
    ...schema,
    type: [...types, "null"],
    ...(schema.enum === undefined ? {} : { enum: [...schema.enum, null] }),
  };
}

function convert(
  node: Node,
  defs: Node,
  replacements: Record<string, JsonSchema>
): JsonSchema {
  for (const key of ["oneOf", "allOf", "not", "patternProperties", "if"]) {
    if (key in node) {
      throw new UnsupportedSchemaError(`Unsupported keyword ${key}.`);
    }
  }

  if ("$ref" in node) {
    const { name, def } = resolveRef(node, defs);
    // The same object every time, so that callers can recognise it
    return replacements[name] ?? convert(def, defs, replacements);
  }

  if ("anyOf" in node) {
    const branch = nullableBranch(node);
    if (branch === null) {
      throw new UnsupportedSchemaError("Unsupported anyOf.");
    }
    const inner = makeNullable(convert(branch, defs, replacements));
    return typeof node.description === "string"
      ? { ...inner, description: node.description }
      : inner;
  }

  const type = node.type;
  if (typeof type !== "string" && !Array.isArray(type)) {
    throw new UnsupportedSchemaError("A schema without a type.");
  }
  const schema: JsonSchema = { type: type as string | string[] };
  if (typeof node.description === "string") {
    schema.description = node.description;
  }
  if (Array.isArray(node.enum)) {
    schema.enum = node.enum as Array<string | null>;
  }

  const types = [type].flat();
  if (types.includes("array")) {
    if (!isNode(node.items)) {
      throw new UnsupportedSchemaError("An array without items.");
    }
    schema.items = convert(node.items, defs, replacements);
  }
  if (types.includes("object")) {
    if (isNode(node.additionalProperties)) {
      throw new UnsupportedSchemaError("An object used as a map.");
    }
    const properties = isNode(node.properties) ? node.properties : {};
    const required = requiredOf(node);
    schema.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        if (!isNode(value)) {
          throw new UnsupportedSchemaError(`Property ${key} has no schema.`);
        }
        const converted = convert(value, defs, replacements);
        // Strict mode wants every property, so optional ones take null instead
        return [
          key,
          required.includes(key) ? converted : makeNullable(converted),
        ];
      })
    );
    schema.required = Object.keys(properties);
    schema.additionalProperties = false;
  }
  return schema;
}

/**
 * @summary Turn an MCP input schema into the subset the providers' strict modes
 * accept, see JsonSchema in tools.ts. Bounds and defaults are dropped, and the
 * server still checks them. Optional properties become nullable, and
 * `stripOmitted` turns their nulls back into absent values.
 * @param replacements Schemas that take the place of `$defs` by name. They are
 * used as they are, so the same object can be recognised later.
 * @throws {UnsupportedSchemaError} If the schema uses anything else
 */
export function toRegistrySchema(
  inputSchema: unknown,
  replacements: Record<string, JsonSchema> = {}
): JsonSchema {
  if (!isNode(inputSchema)) {
    throw new UnsupportedSchemaError("The input schema isn't an object.");
  }
  const defs = isNode(inputSchema.$defs) ? inputSchema.$defs : {};
  const schema = convert(inputSchema, defs, replacements);
  if (schema.type !== "object") {
    throw new UnsupportedSchemaError("The input schema isn't an object.");
  }
  return schema;
}

function strip(value: unknown, node: Node, defs: Node): unknown {
  if ("$ref" in node) {
    return strip(value, resolveRef(node, defs).def, defs);
  }
  const branch = nullableBranch(node);
  if (branch !== null) {
    return value === null ? null : strip(value, branch, defs);
  }
  if (Array.isArray(value) && isNode(node.items)) {
    return value.map((item) => strip(item, node.items as Node, defs));
  }
  if (isNode(value) && isNode(node.properties)) {
    const properties = node.properties;
    const required = requiredOf(node);
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => !(v === null && !required.includes(key)))
        .map(([key, v]) => [
          key,
          isNode(properties[key]) ? strip(v, properties[key], defs) : v,
        ])
    );
  }
  return value;
}

/**
 * @summary Leave out the optional properties that the model set to null, so
 * that the server uses its defaults.
 * @param inputSchema The original MCP schema, not the converted one
 */
export function stripOmitted(
  args: Record<string, unknown>,
  inputSchema: unknown
): Record<string, unknown> {
  if (!isNode(inputSchema)) {
    return args;
  }
  const defs = isNode(inputSchema.$defs) ? inputSchema.$defs : {};
  return strip(args, inputSchema, defs) as Record<string, unknown>;
}
