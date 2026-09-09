import type { Model } from 'mongoose';
import type * as t from '~/types';
import flagSchema from '~/schema/flag';

export function createFlagModel(mongoose: typeof import('mongoose')): Model<t.IFlag> {
  return mongoose.models.Flag || mongoose.model<t.IFlag>('Flag', flagSchema);
}
