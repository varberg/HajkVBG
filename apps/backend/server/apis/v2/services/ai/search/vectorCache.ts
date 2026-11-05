import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import log4js from "log4js";

const logger = log4js.getLogger("service.ai.search");

const FORMAT_VERSION = 1;

/**
 * @summary The cache key of a text. The embedder is part of it, so changing
 * provider or model can never reuse the vectors of another model.
 */
export const vectorKey = (embedderId: string, text: string): string =>
  createHash("sha256").update(`${embedderId}\0${text}`).digest("base64url");

const encode = (vector: Float32Array): string =>
  Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString(
    "base64"
  );

function decode(value: unknown): Float32Array | null {
  if (typeof value !== "string") {
    return null;
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.length % 4 !== 0) {
    return null;
  }
  // Copied, as the Buffer's offset in its pool may not be aligned for floats.
  return new Float32Array(Uint8Array.from(bytes).buffer);
}

/**
 * @summary Vectors of one map on disk, so that only changed layers re-embed.
 * @description The file must stay in a subfolder of App_Data, as every
 * top-level .json file there is listed as a map. A lost or broken file only
 * costs a new embedding run, so problems here are never fatal.
 */
export class VectorCache {
  #filePath: string;
  #vectors: Map<string, Float32Array>;
  #changed = false;

  private constructor(filePath: string, vectors: Map<string, Float32Array>) {
    this.#filePath = filePath;
    this.#vectors = vectors;
  }

  static async load(filePath: string): Promise<VectorCache> {
    const vectors = new Map<string, Float32Array>();
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.version === FORMAT_VERSION) {
        for (const [key, value] of Object.entries(parsed.vectors ?? {})) {
          const vector = decode(value);
          if (vector !== null) {
            vectors.set(key, vector);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn(
          `Ignoring unreadable vector cache ${filePath}: ${(error as Error).message}`
        );
      }
    }
    return new VectorCache(filePath, vectors);
  }

  get(key: string): Float32Array | undefined {
    return this.#vectors.get(key);
  }

  set(key: string, vector: Float32Array): void {
    this.#vectors.set(key, vector);
    this.#changed = true;
  }

  /** @summary Drop everything else, so the file can't grow with every edit. */
  retainOnly(keys: ReadonlySet<string>): void {
    for (const key of this.#vectors.keys()) {
      if (!keys.has(key)) {
        this.#vectors.delete(key);
        this.#changed = true;
      }
    }
  }

  async save(): Promise<void> {
    if (!this.#changed) {
      return;
    }
    const vectors = Object.fromEntries(
      [...this.#vectors].map(([key, vector]) => [key, encode(vector)])
    );
    // Written to the side and renamed, so a crash can't leave half a file.
    const tempPath = `${this.#filePath}.${process.pid}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(this.#filePath), {
        recursive: true,
      });
      await fs.promises.writeFile(
        tempPath,
        JSON.stringify({ version: FORMAT_VERSION, vectors })
      );
      await fs.promises.rename(tempPath, this.#filePath);
      this.#changed = false;
    } catch (error) {
      logger.warn(
        `Could not save vector cache ${this.#filePath}: ${(error as Error).message}`
      );
      await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}
