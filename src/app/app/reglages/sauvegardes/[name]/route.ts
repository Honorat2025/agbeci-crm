import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { backupPath } from "@/lib/backups";
import { isLoggedIn } from "@/lib/session";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await isLoggedIn())) return new Response("Non autorisé", { status: 401 });
  const { name } = await params;
  const file = backupPath(name);
  if (!file) return new Response("Introuvable", { status: 404 });
  try {
    const s = await stat(file);
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(s.size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
