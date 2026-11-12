/**
 * The language of the map's data and of its users: how names sort and match.
 * Stop words for the keyword search are in search/keywordIndex.ts.
 */
export const LOCALE = "sv";

/** Sorts names as people in {@link LOCALE} expect, such as å, ä, ö last. */
export const collator = new Intl.Collator(LOCALE);
