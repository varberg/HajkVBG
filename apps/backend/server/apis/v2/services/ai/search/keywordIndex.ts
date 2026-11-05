import type { Catalog } from "../catalog.service.ts";

const SEARCH_FIELDS = [
  "caption",
  "groupPath",
  "text",
  "owner",
  "contentTag",
  "subLayers",
];

// For a user who reaches a layer outside the tree, and so must not get a match
// on its group. `text` holds the inherited group info, `ownText` doesn't.
const OWN_VIEW_FIELDS = [
  "caption",
  "ownText",
  "owner",
  "contentTag",
  "subLayers",
];

// The Snowball list for Swedish, and the words people use to ask for a layer.
// Without this "Var finns ..." matches every layer with Varberg in it, as "var"
// is also a prefix. Only left out of queries, so the index still holds them.
const STOP_WORDS = new Set(
  `alla allt att av blev bli blir blivit de dem den denna deras dess dessa det
  detta dig din dina ditt du där då efter ej eller en er era ert ett från för
  ha hade han hans har henne hennes hon honom hur här i icke ingen inom inte
  jag ju kan kunde man med mellan men mig min mina mitt mot mycket ni nu när
  någon något några och om oss på samma sedan sig sin sina sitta själv skulle
  som så sådan sådana sådant till under upp ut utan vad var vara varför varit
  varje vars vart vem vi vid vilka vilkas vilken vilket vår våra vårt än är åt
  över
  finns få får kanske måste ska snälla tack vill visa`.split(/\s+/)
);

const queryTerms = (query: string): string[] =>
  query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * @summary Remove stop words from a query, unless nothing else would remain.
 */
export function withoutStopWords(query: string): string {
  const terms = queryTerms(query);
  const kept = terms.filter((term) => !STOP_WORDS.has(term));
  return (kept.length > 0 ? kept : terms).join(" ");
}

export interface KeywordScope {
  isAllowed(id: string): boolean;
  /** Allowed layers that may only match on their own fields. */
  ownView: ReadonlySet<string>;
}

export interface KeywordIndex {
  /**
   * @param match "any" finds layers with any word of the query, "all" only
   * those with every word
   * @returns Layer ids, best match first. Scope is applied before the limit.
   */
  search(
    query: string,
    limit: number,
    scope: KeywordScope,
    match?: "any" | "all"
  ): string[];
}

/**
 * @summary Build the keyword index for a raw catalog. The index holds every
 * layer, so all searches must go through a scope.
 */
export async function buildKeywordIndex(
  catalog: Catalog
): Promise<KeywordIndex> {
  // Loaded here, so that installs with the chat disabled never load the package
  const { default: MiniSearch } = await import("minisearch");

  const index = new MiniSearch({
    fields: [...SEARCH_FIELDS, "ownText"],
    searchOptions: {
      fields: SEARCH_FIELDS,
      boost: { caption: 3, groupPath: 2 },
      prefix: (term) => term.length > 2,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
    },
  });

  index.addAll(
    catalog.records.map((record) => ({
      id: record.id,
      caption: record.caption,
      groupPath: record.groupPath.join(" "),
      text: record.text,
      ownText: catalog.ownTextById.get(record.id),
      owner: record.owner,
      contentTag: record.contentTag,
      subLayers: record.subLayers.map((sub) => sub.caption).join(" "),
    }))
  );

  return {
    search(query, limit, { isAllowed, ownView }, match = "any") {
      const terms = withoutStopWords(query);
      const combineWith = match === "all" ? "AND" : "OR";
      const hits = index.search(terms, {
        combineWith,
        filter: ({ id }) => isAllowed(id) && !ownView.has(id),
      });
      const ownViewHits =
        ownView.size === 0
          ? []
          : index.search(terms, {
              combineWith,
              fields: OWN_VIEW_FIELDS,
              filter: ({ id }) => ownView.has(id),
            });

      return [...hits, ...ownViewHits]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((hit) => String(hit.id));
    },
  };
}
