import type { Model } from 'mongoose';
import type { IGeneration } from '~/types';

/**
 * Owned by the usage-ledger work (Layer B). Implement the data access for
 * generations here: the insert used by the chat path and the aggregations that
 * back `/api/admin/usage`.
 */
export interface GenerationMethods {
  createGeneration: (
    input: Omit<IGeneration, keyof import('mongoose').Document | 'createdAt' | 'updatedAt'>,
  ) => Promise<IGeneration>;
}

export function createGenerationMethods(mongoose: typeof import('mongoose')): GenerationMethods {
  function model(): Model<IGeneration> {
    return mongoose.models.Generation as Model<IGeneration>;
  }

  async function createGeneration(
    input: Omit<IGeneration, keyof import('mongoose').Document | 'createdAt' | 'updatedAt'>,
  ): Promise<IGeneration> {
    return model().create(input);
  }

  return { createGeneration };
}
