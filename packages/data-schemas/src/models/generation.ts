import type { Model } from 'mongoose';
import type * as t from '~/types';
import generationSchema from '~/schema/generation';

export function createGenerationModel(mongoose: typeof import('mongoose')): Model<t.IGeneration> {
  return (
    mongoose.models.Generation || mongoose.model<t.IGeneration>('Generation', generationSchema)
  );
}
