import { Schema } from 'mongoose';
import type { IDirectoryEntry } from '~/types';

const directorySchema: Schema<IDirectoryEntry> = new Schema<IDirectoryEntry>(
  {
    uid: { type: String, required: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gradYear: { type: Number },
    dorm: { type: String },
    room: { type: String },
    dormHidden: { type: Boolean, default: false },
    snapshot: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

directorySchema.index({ snapshot: 1, uid: 1 }, { unique: true });

export default directorySchema;
