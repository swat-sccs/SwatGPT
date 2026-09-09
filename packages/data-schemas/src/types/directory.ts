import type { Document } from 'mongoose';

/** One on-campus student as published to the directory lookup. */
export interface DirectoryEntry {
  uid: string;
  firstName: string;
  lastName: string;
  gradYear?: number;
  dorm?: string;
  room?: string;
  dormHidden: boolean;
}

export interface IDirectoryEntry extends DirectoryEntry, Document {
  snapshot: string;
}

export interface DirectoryReplaceResult {
  snapshot: string;
  inserted: number;
  removed: number;
}
