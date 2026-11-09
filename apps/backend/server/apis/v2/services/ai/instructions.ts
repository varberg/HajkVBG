import fs from "fs";
import path from "path";
import log4js from "log4js";

import { resolvePathUnder, validateMapName } from "../../utils/safePath.js";

const logger = log4js.getLogger("service.ai.instructions");

/** The folder in App_Data. A folder, so that it's never listed as a map. */
const FOLDER = "ai";
const SHARED_FILE = "instructions.md";

// The text is sent on every turn, so a long one costs on every question
const LONG_INSTRUCTIONS = 10_000;

interface CacheEntry {
  signature: string;
  text: string;
}

export interface InstructionsServiceOptions {
  appDataDir?: string;
}

/**
 * @summary Reads the instructions that an installation adds to the system
 * prompt: `App_Data/ai/instructions.md` for all maps, then
 * `App_Data/ai/<map>.instructions.md` for one map. Both are optional.
 * @description They stay on the server, unlike the map config. Every read
 * compares mtime and size, as in informative/documentCache.js, so an edited
 * file applies to the next new conversation without a restart.
 */
export class InstructionsService {
  #dir: string;
  #cache = new Map<string, CacheEntry>();
  #warned = new Set<string>();

  constructor({ appDataDir }: InstructionsServiceOptions = {}) {
    this.#dir = path.join(
      appDataDir ?? path.join(process.cwd(), "App_Data"),
      FOLDER
    );
  }

  /**
   * @returns The text of the files that exist, shared first, or null if none
   * has any text
   * @throws {InvalidPathError} If the map name isn't valid
   */
  async getInstructions(map: string): Promise<string | null> {
    const safeMap: string = validateMapName(map);
    // Map names can't hold a dot, so the two names never collide
    const files = [SHARED_FILE, `${safeMap}.instructions.md`].map(
      (file): string => resolvePathUnder(this.#dir, file)
    );
    const texts = await Promise.all(files.map((file) => this.#read(file)));
    const text = texts.filter((t) => t !== "").join("\n\n");

    if (text.length > LONG_INSTRUCTIONS) {
      const key = `${safeMap}:${text.length}`;
      if (!this.#warned.has(key)) {
        this.#warned.add(key);
        logger.warn(
          `The AI chat instructions for map "${safeMap}" are ${text.length} characters long. They are sent with every question, so keep them short.`
        );
      }
    }

    return text === "" ? null : text;
  }

  /** @returns The trimmed text, or "" if the file is missing or unreadable */
  async #read(file: string): Promise<string> {
    try {
      const stats = await fs.promises.stat(file);
      const signature = `${stats.mtimeMs}:${stats.size}`;
      const hit = this.#cache.get(file);
      if (hit?.signature === signature) {
        return hit.text;
      }
      const text = (await fs.promises.readFile(file, "utf-8")).trim();
      this.#cache.set(file, { signature, text });
      return text;
    } catch (error) {
      this.#cache.delete(file);
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // A file that can't be read mustn't take the chat down with it
        logger.warn(
          `Could not read the AI chat instructions in "${file}": ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
      return "";
    }
  }
}

export default new InstructionsService();
