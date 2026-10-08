import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { IFlag, IGeneration } from '~/types';

/** Owner written onto ledger rows of deleted accounts, so usage totals survive without the link. */
export const DELETED_USER_ID = '000000000000000000000000';

export interface UserRetentionResult {
  flagsDeleted: number;
  generationsAnonymized: number;
}

export interface RetentionMethods {
  /**
   * Account deletion for SwatGPT's oversight collections: flags about the user
   * are removed, the user's id is stripped from flags they filed or resolved on
   * others, and their generation rows are re-owned by `DELETED_USER_ID`.
   */
  purgeUserOversight: (userId: string | Types.ObjectId) => Promise<UserRetentionResult>;
}

export function createRetentionMethods(mongoose: typeof import('mongoose')): RetentionMethods {
  function flags(): Model<IFlag> {
    return mongoose.models.Flag as Model<IFlag>;
  }

  function generations(): Model<IGeneration> {
    return mongoose.models.Generation as Model<IGeneration>;
  }

  async function purgeUserOversight(userId: string | Types.ObjectId): Promise<UserRetentionResult> {
    const user = new Types.ObjectId(String(userId));
    const [deleted, , , anonymized] = await Promise.all([
      flags().deleteMany({ user }),
      flags().updateMany({ createdBy: user }, { $unset: { createdBy: 1 } }),
      flags().updateMany({ resolvedBy: user }, { $unset: { resolvedBy: 1 } }),
      generations().updateMany({ user }, { $set: { user: new Types.ObjectId(DELETED_USER_ID) } }),
    ]);
    return {
      flagsDeleted: deleted.deletedCount,
      generationsAnonymized: anonymized.modifiedCount,
    };
  }

  return { purgeUserOversight };
}
