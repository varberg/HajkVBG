import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { featureLinks } from "../../server/apis/v2/services/ai/features/featureLinks.ts";

const PLAN_INFOBOX =
  '<table><tr><td>PDF</td><td> <a href="https://karta.example.com/dokument/detaljplaner/{namn}.pdf" target="_blank">Länk</a></td></tr></table>';

describe("featureLinks", () => {
  test("fills a link of an HTML infobox", () => {
    assert.deepEqual(featureLinks(PLAN_INFOBOX, { namn: "L89" }, ["namn"]), [
      {
        text: "Länk",
        url: "https://karta.example.com/dokument/detaljplaner/L89.pdf",
      },
    ]);
  });

  test("fills a Markdown link, and its text", () => {
    assert.deepEqual(
      featureLinks(
        '[Plan {namn}](https://a.example.com/?id={id}&x=1 "Titel"){target=_blank}',
        { namn: "L89", id: 7 },
        ["namn", "id"]
      ),
      [{ text: "Plan L89", url: "https://a.example.com/?id=7&x=1" }]
    );
  });

  test("encodes what can't go in a URL or a Markdown link", () => {
    const [link] = featureLinks(
      '<a href="https://a.example.com/{namn}.pdf">PDF</a>',
      { namn: "Åkerö (del) 1" },
      ["namn"]
    );
    assert.equal(
      link.url,
      "https://a.example.com/%C3%85ker%C3%B6%20%28del%29%201.pdf"
    );
  });

  test("decodes &amp; in an HTML href", () => {
    const [link] = featureLinks(
      '<a href="https://a.example.com/?a={namn}&amp;b=2">x</a>',
      { namn: "1" },
      ["namn"]
    );
    assert.equal(link.url, "https://a.example.com/?a=1&b=2");
  });

  test("takes a whole URL from a field", () => {
    assert.deepEqual(
      featureLinks("<a href='{url}'></a>", { url: "https://b.example.com/x" }, [
        "url",
      ]),
      [{ url: "https://b.example.com/x" }]
    );
  });

  test("leaves out a link with an empty value", () => {
    assert.deepEqual(featureLinks(PLAN_INFOBOX, { namn: " " }, ["namn"]), []);
    assert.deepEqual(featureLinks(PLAN_INFOBOX, {}, ["namn"]), []);
  });

  test("leaves out a link with a field the model may not read", () => {
    assert.deepEqual(featureLinks(PLAN_INFOBOX, { namn: "L89" }, []), []);
  });

  test("leaves out what isn't a web address", () => {
    const links = (url: string) =>
      featureLinks(`<a href="${url}">x</a>`, { v: "javascript:alert(1)" }, [
        "v",
      ]);
    assert.deepEqual(links("{v}"), []);
    assert.deepEqual(links("mailto:a@example.com"), []);
    assert.deepEqual(links("/relative/{v}"), []);
  });

  test("leaves out a link with a format, a plugin or a condition", () => {
    const props = { a: "1" };
    for (const href of [
      "https://a.example.com/{a|date}",
      "https://a.example.com/{a@@documenthandler}",
      "https://a.example.com/{{if a}}{a}{{/if}}",
    ]) {
      assert.deepEqual(
        featureLinks(`<a href="${href}">x</a>`, props, ["a"]),
        []
      );
    }
  });

  test("keeps the links of every provider in an area", () => {
    const infobox = Array.from(
      { length: 12 },
      (_, i) => `<a href="{u${i}}">{n${i}}</a>`
    ).join("");
    const props = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        [`u${i}`, `https://a.example.com/${i}`],
        [`n${i}`, `Utförare ${i}`],
      ]).flat()
    );
    const links = featureLinks(infobox, props, Object.keys(props));
    assert.equal(links.length, 12);
    assert.deepEqual(links[11], {
      text: "Utförare 11",
      url: "https://a.example.com/11",
    });
  });

  test("gives each URL once", () => {
    const infobox = `${PLAN_INFOBOX}${PLAN_INFOBOX}`;
    assert.equal(featureLinks(infobox, { namn: "L89" }, ["namn"]).length, 1);
  });

  test("handles an infobox without links", () => {
    assert.deepEqual(featureLinks(null, {}, []), []);
    assert.deepEqual(featureLinks("{namn}", { namn: "a" }, ["namn"]), []);
  });
});
