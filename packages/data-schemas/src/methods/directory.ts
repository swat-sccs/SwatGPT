import type { Model } from 'mongoose';
import type { DirectoryEntry, DirectoryReplaceResult, IDirectoryEntry } from '~/types';

const ENTRY_PROJECTION = {
  _id: 0,
  uid: 1,
  firstName: 1,
  lastName: 1,
  gradYear: 1,
  dorm: 1,
  room: 1,
  dormHidden: 1,
  snapshot: 1,
} as const;

type StoredEntry = DirectoryEntry & { snapshot: string };

function stripSnapshot({ snapshot: _snapshot, ...entry }: StoredEntry): DirectoryEntry {
  return entry;
}

/** Keeps one row per uid, preferring the newest snapshot when a swap is mid-flight. */
function latestPerUid(rows: StoredEntry[]): DirectoryEntry[] {
  const byUid = new Map<string, StoredEntry>();
  for (const row of rows) {
    const existing = byUid.get(row.uid);
    if (!existing || existing.snapshot < row.snapshot) {
      byUid.set(row.uid, row);
    }
  }
  return Array.from(byUid.values(), stripSnapshot);
}

export function createDirectoryMethods(mongoose: typeof import('mongoose')): {
  listDirectory: () => Promise<DirectoryEntry[]>;
  replaceDirectory: (entries: DirectoryEntry[]) => Promise<DirectoryReplaceResult>;
} {
  const getModel = (): Model<IDirectoryEntry> =>
    mongoose.models.DirectoryEntry as Model<IDirectoryEntry>;

  async function listDirectory(): Promise<DirectoryEntry[]> {
    const rows = (await getModel().find({}, ENTRY_PROJECTION).lean()) as StoredEntry[];
    return latestPerUid(rows);
  }

  /**
   * Publishes a full directory snapshot: inserts the new rows under a fresh
   * snapshot id, then removes every older snapshot. Readers that overlap the
   * swap see both and dedupe to the newest, so there is never an empty window.
   */
  async function replaceDirectory(entries: DirectoryEntry[]): Promise<DirectoryReplaceResult> {
    if (entries.length === 0) {
      throw new Error('[replaceDirectory] refusing to publish an empty directory snapshot');
    }
    const snapshot = new Date().toISOString();
    const inserted = await getModel().insertMany(
      entries.map((entry) => ({ ...entry, snapshot })),
      { ordered: false },
    );
    const { deletedCount } = await getModel().deleteMany({ snapshot: { $ne: snapshot } });
    return { snapshot, inserted: inserted.length, removed: deletedCount };
  }

  return { listDirectory, replaceDirectory };
}

export type DirectoryMethods = ReturnType<typeof createDirectoryMethods>;
