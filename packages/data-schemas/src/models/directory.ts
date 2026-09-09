import { Model } from 'mongoose';
import type { IDirectoryEntry } from '~/types';
import directorySchema from '~/schema/directory';

export function createDirectoryEntryModel(
  mongoose: typeof import('mongoose'),
): Model<IDirectoryEntry> {
  return (
    mongoose.models.DirectoryEntry ||
    mongoose.model<IDirectoryEntry>('DirectoryEntry', directorySchema)
  );
}
