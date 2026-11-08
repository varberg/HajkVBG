import { cleanInline } from "../catalog.service.ts";

// Enough for the 12 providers of a home care area, and a cap against a bad infobox
const MAX_LINKS = 20;
const MAX_URL_LENGTH = 2000;

const HTML_LINK =
  /<a\b[^>]*?\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
// Markdown links, with an optional title, as in `[Plan](https://a/{namn}.pdf "PDF")`
const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const PLACEHOLDER = /{([^{}]*)}/g;

/** A link of an infobox, with placeholders for the values of a feature. */
interface LinkTemplate {
  text: string;
  url: string;
}

/** A link as the model sees it. */
export interface FeatureLink {
  text?: string;
  url: string;
}

/**
 * @summary The links of an infobox, such as the document of a plan. Only links
 * whose placeholders are plain fields are kept: one with a condition, a format or
 * a plugin in it depends on the client to be right.
 */
function linkTemplates(infobox: string): LinkTemplate[] {
  return [
    ...[...infobox.matchAll(HTML_LINK)].map(([, , url, text]) => ({
      text,
      url: url.replaceAll("&amp;", "&").trim(),
    })),
    ...[...infobox.matchAll(MARKDOWN_LINK)].map(([, text, url]) => ({
      text,
      url,
    })),
  ].filter(
    ({ text, url }) =>
      !`${text}${url}`.includes("{{") &&
      [...url.matchAll(PLACEHOLDER)].every(([, name]) =>
        /^[\p{L}\p{N}_.-]+$/u.test(name.trim())
      )
  );
}

/**
 * @summary Put the values of a feature into a template, as the infobox does.
 * @returns The text, or null if a field is empty or not one the model may read
 */
function fill(
  template: string,
  properties: Record<string, unknown>,
  fields: ReadonlySet<string>
): string | null {
  let missing = false;
  const text = template.replace(PLACEHOLDER, (_, name: string) => {
    const field = name.trim();
    const value = properties[field];
    const text =
      value === null || value === undefined ? "" : String(value).trim();
    if (!fields.has(field) || text === "") {
      missing = true;
    }
    return text;
  });
  return missing ? null : text;
}

/** @summary A web address that can go into a Markdown link, or null. */
function webUrl(text: string): string | null {
  if (!URL.canParse(text)) {
    return null;
  }
  const { protocol, href } = new URL(text);
  const url = href.replaceAll("(", "%28").replaceAll(")", "%29");
  return /^https?:$/.test(protocol) && url.length <= MAX_URL_LENGTH
    ? url
    : null;
}

/**
 * @summary The links the infobox of a feature has, such as to a document.
 * @param fields The fields the model may read, which a link can't go beyond.
 */
export function featureLinks(
  infobox: string | null,
  properties: Record<string, unknown>,
  fields: readonly string[]
): FeatureLink[] {
  if (!infobox) {
    return [];
  }
  const allowed = new Set(fields);
  const links = new Map<string, FeatureLink>();

  for (const template of linkTemplates(infobox)) {
    const filled = fill(template.url, properties, allowed);
    const url = filled === null ? null : webUrl(filled);
    if (url === null || links.has(url)) {
      continue;
    }
    const text = cleanInline(fill(template.text, properties, allowed) ?? "");
    links.set(url, text ? { text, url } : { url });
    if (links.size === MAX_LINKS) {
      break;
    }
  }
  return [...links.values()];
}
