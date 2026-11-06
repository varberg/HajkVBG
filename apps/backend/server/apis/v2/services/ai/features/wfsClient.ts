import log4js from "log4js";

import { ToolError } from "../toolSupport.ts";
import type { Feature } from "./geojson.ts";
import { buildGetFeature } from "./wfsQuery.ts";
import type { GetFeatureOptions, QueryTarget } from "./wfsQuery.ts";

const logger = log4js.getLogger("service.ai.wfs");

// 250 features is about 1 MB at most, so this only stops a source gone wrong
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
// Enough to tell what went wrong, without filling the log
const MAX_LOGGED_CHARS = 500;

/** What the client needs to know about a source. */
export interface WfsTarget extends QueryTarget {
  url: string;
}

export interface WfsResult {
  features: Feature[];
  /** All matches, however many were returned. */
  total: number;
}

interface WfsClientOptions {
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
}

/**
 * The only error of a failed request. Its message is safe to show to the model:
 * URLs and what GeoServer said go to the log, and nowhere else.
 */
export class WfsError extends ToolError {
  constructor() {
    super("The source can't be reached right now.");
  }
}

async function readText(response: Response): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) {
      throw new Error(`The response is over ${MAX_RESPONSE_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseResult(text: string): WfsResult {
  const { features, numberMatched } = JSON.parse(text);
  if (!Array.isArray(features) || !Number.isInteger(numberMatched)) {
    throw new Error("The response isn't a feature collection.");
  }
  return { features, total: numberMatched };
}

/**
 * @summary Sends GetFeature requests to WFS sources.
 * @description The sources are public, and a redirect means that one has ended
 * up behind a login, so it's an error. Always asks for JSON, which all sources
 * give, also those set to GML3. A count of 0 gives the number of matches:
 * `resultType="hits"` answers in XML, whatever format is asked for.
 */
export class WfsClient {
  #timeoutMs: number;
  #fetch: typeof globalThis.fetch;

  constructor({ timeoutMs, fetch = globalThis.fetch }: WfsClientOptions) {
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetch;
  }

  /**
   * @param signal Aborts with the turn
   * @throws {WfsError} If the source doesn't give a usable answer
   * @throws The reason of the signal, if it has aborted
   */
  async query(
    target: WfsTarget,
    options: GetFeatureOptions,
    signal: AbortSignal
  ): Promise<WfsResult> {
    try {
      const response = await this.#fetch(target.url, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: buildGetFeature(target, options),
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.#timeoutMs)]),
      });
      const text = await readText(response);
      const type = response.headers.get("content-type") ?? "";

      if (!response.ok || !type.includes("json")) {
        throw new Error(
          `Status ${response.status}, ${type}: ${text.slice(0, MAX_LOGGED_CHARS)}`
        );
      }
      return parseResult(text);
    } catch (error) {
      signal.throwIfAborted();
      logger.warn(
        `WFS request to ${target.url} failed: ${(error as Error).message}`
      );
      throw new WfsError();
    }
  }
}
