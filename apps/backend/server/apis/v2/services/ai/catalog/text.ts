// Text from map configs and layer stores, which can hold HTML

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const decodeEntity = (entity: string, name: string): string => {
  if (name.startsWith("#")) {
    const isHex = name[1] === "x" || name[1] === "X";
    const code = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }
  return HTML_ENTITIES[name.toLowerCase()] ?? entity;
};

/**
 * @summary Turn a config value into plain text. Strips HTML, keeps paragraph
 * breaks, and converts empty values to null.
 */
export function cleanHtml(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\/?[a-z!][^>]*>/gi, " ")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text === "" ? null : text;
}

/**
 * @summary Same as cleanHtml, but always on one line. Used for captions and
 * group names, which end up in lists and in the group tree of the prompt.
 */
export function cleanInline(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : cleanHtml(value);
  return text === null ? null : text.replace(/\s+/g, " ");
}

// The store keeps dates as epoch milliseconds, either as a string or a number.
export function cleanDate(value: unknown): string | null {
  const text = cleanInline(value);
  if (text === null || !/^\d{10,}$/.test(text)) {
    return text;
  }
  const date = new Date(Number(text));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
