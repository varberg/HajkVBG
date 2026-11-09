import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { InstructionsService } from "../../server/apis/v2/services/ai/instructions.ts";

describe("InstructionsService", () => {
  let dir: string;
  let aiDir: string;

  const write = (file: string, content: string) =>
    fs.writeFileSync(path.join(aiDir, file), content);

  const service = () => new InstructionsService({ appDataDir: dir });

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hajk-ai-instructions-"));
    aiDir = path.join(dir, "ai");
  });

  beforeEach(() => {
    fs.rmSync(aiDir, { recursive: true, force: true });
    fs.mkdirSync(aiDir);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("gives null when there are no files", async () => {
    assert.equal(await service().getInstructions("demo"), null);
  });

  test("gives null when the folder is missing", async () => {
    fs.rmSync(aiDir, { recursive: true });
    assert.equal(await service().getInstructions("demo"), null);
  });

  test("reads the shared file for every map", async () => {
    write("instructions.md", "Delad text.\n");
    const instructions = service();
    assert.equal(await instructions.getInstructions("demo"), "Delad text.");
    assert.equal(await instructions.getInstructions("other"), "Delad text.");
  });

  test("reads the file of the map only for that map", async () => {
    write("demo.instructions.md", "Bara demo.");
    const instructions = service();
    assert.equal(await instructions.getInstructions("demo"), "Bara demo.");
    assert.equal(await instructions.getInstructions("other"), null);
  });

  test("puts the shared file first", async () => {
    write("instructions.md", "Delad text.");
    write("demo.instructions.md", "Bara demo.");
    assert.equal(
      await service().getInstructions("demo"),
      "Delad text.\n\nBara demo."
    );
  });

  test("skips a file with only whitespace", async () => {
    write("instructions.md", "  \n\n");
    write("demo.instructions.md", "Bara demo.");
    assert.equal(await service().getInstructions("demo"), "Bara demo.");
  });

  test("reads a file again when it has changed", async () => {
    const instructions = service();
    write("instructions.md", "Gammal.");
    assert.equal(await instructions.getInstructions("demo"), "Gammal.");

    write("instructions.md", "Ny text.");
    // Make sure the mtime differs too, on file systems with coarse times
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(aiDir, "instructions.md"), later, later);
    assert.equal(await instructions.getInstructions("demo"), "Ny text.");

    fs.rmSync(path.join(aiDir, "instructions.md"));
    assert.equal(await instructions.getInstructions("demo"), null);
  });

  test("rejects a map name that isn't one", async () => {
    write("instructions.md", "Delad text.");
    for (const map of ["../ai/instructions", "demo.x", "", "a/b"]) {
      await assert.rejects(service().getInstructions(map), {
        name: "InvalidPathError",
      });
    }
  });

  test("skips a file that can't be read", async () => {
    write("instructions.md", "Delad text.");
    // A folder in place of the file gives EISDIR, not ENOENT
    fs.mkdirSync(path.join(aiDir, "demo.instructions.md"));
    assert.equal(await service().getInstructions("demo"), "Delad text.");
  });
});
