import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { backupPath, formatSize, isRecent, listBackups } from "../src/lib/backups";

test("liste des sauvegardes", async () => {
  assert.equal(await listBackups("/dossier/inexistant"), null);
  const dir = await mkdtemp(path.join(tmpdir(), "sauv-"));
  await writeFile(path.join(dir, "crm-2026-11-21.dump"), "a");
  await writeFile(path.join(dir, "crm-2026-11-22.dump"), "bb");
  await writeFile(path.join(dir, "crm-2026-11-23.dump.tmp"), "en cours");
  await writeFile(path.join(dir, "crm-2026-11-20.dump"), ""); // vide : ignorée
  await writeFile(path.join(dir, "autre.txt"), "x");
  const list = (await listBackups(dir))!;
  assert.deepEqual(list.map((f) => f.name), ["crm-2026-11-22.dump", "crm-2026-11-21.dump"]);
  assert.ok(isRecent(list));
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  await utimes(path.join(dir, "crm-2026-11-22.dump"), old, old);
  assert.ok(!isRecent((await listBackups(dir))!));
  assert.ok(!isRecent([]));
});

test("noms de fichiers sûrs", () => {
  assert.equal(backupPath("crm-2026-11-22.dump", "/b"), "/b/crm-2026-11-22.dump");
  assert.equal(backupPath("../etc/passwd", "/b"), null);
  assert.equal(backupPath("crm-2026-11-22.dump/../../x", "/b"), null);
  assert.equal(formatSize(500), "1 Ko");
  assert.equal(formatSize(3 * 1024 * 1024 + 300000).replace(/\s/g, " "), "3,3 Mo");
});
