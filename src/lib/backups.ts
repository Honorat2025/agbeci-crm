/**
 * Sauvegardes de la base : le service « backup » (voir deploy/docker-compose.hostinger.yml)
 * écrit chaque nuit un fichier crm-AAAA-MM-JJ.dump ; l'application les liste et permet de les télécharger.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export const BACKUP_DIR = process.env.BACKUP_DIR || "/backups";
const NAME = /^crm-\d{4}-\d{2}-\d{2}\.dump$/;

export const isBackupName = (name: string) => NAME.test(name);

export type BackupFile = { name: string; size: number; date: Date };

/** Sauvegardes disponibles, la plus récente en premier. null si le dossier n'existe pas. */
export async function listBackups(dir = BACKUP_DIR): Promise<BackupFile[] | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const files = await Promise.all(
    names.filter(isBackupName).map(async (name) => {
      const s = await stat(path.join(dir, name));
      return { name, size: s.size, date: s.mtime };
    }),
  );
  return files.filter((f) => f.size > 0).sort((a, b) => b.name.localeCompare(a.name));
}

export function backupPath(name: string, dir = BACKUP_DIR): string | null {
  return isBackupName(name) ? path.join(dir, name) : null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/** Vrai si la dernière sauvegarde a moins de 36 heures. */
export function isRecent(files: BackupFile[], now = new Date()): boolean {
  const last = files[0];
  return Boolean(last && now.getTime() - last.date.getTime() < 36 * 3600 * 1000);
}
