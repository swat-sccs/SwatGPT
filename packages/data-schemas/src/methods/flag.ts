import type { Model, Types } from 'mongoose';
import type { IFlag, FlagSource } from '~/types';

export interface CreateFlagInput {
  conversationId: string;
  messageId?: string;
  user: string | Types.ObjectId;
  reason: string;
  source: FlagSource;
  createdBy?: string | Types.ObjectId;
  tenantId?: string;
}

/**
 * Owned by the oversight work (Layer C). `createFlag` is also called from the
 * generation write path (Layer B) when keyword screening matches, so keep its
 * signature stable.
 */
export interface FlagMethods {
  createFlag: (input: CreateFlagInput) => Promise<IFlag>;
}

export function createFlagMethods(mongoose: typeof import('mongoose')): FlagMethods {
  function model(): Model<IFlag> {
    return mongoose.models.Flag as Model<IFlag>;
  }

  async function createFlag(input: CreateFlagInput): Promise<IFlag> {
    return model().create(input);
  }

  return { createFlag };
}
