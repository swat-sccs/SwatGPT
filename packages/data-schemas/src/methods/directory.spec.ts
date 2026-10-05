import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { DirectoryEntry, IDirectoryEntry } from '~/types';
import { createDirectoryMethods, type DirectoryMethods } from './directory';
import { createModels } from '~/models';

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let DirectoryEntryModel: mongoose.Model<IDirectoryEntry>;
let methods: DirectoryMethods;

const jane: DirectoryEntry = {
  uid: 'jdoe1',
  firstName: 'Jane',
  lastName: 'Doe',
  gradYear: 2027,
  dorm: 'Willets',
  room: '214',
  dormHidden: false,
};
const john: DirectoryEntry = {
  uid: 'jroe1',
  firstName: 'John',
  lastName: 'Roe',
  gradYear: 2028,
  dormHidden: true,
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  createModels(mongoose);
  DirectoryEntryModel = mongoose.models.DirectoryEntry as mongoose.Model<IDirectoryEntry>;
  methods = createDirectoryMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
  await DirectoryEntryModel.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await DirectoryEntryModel.deleteMany({});
});

describe('replaceDirectory', () => {
  it('publishes a snapshot and lists it without internal fields', async () => {
    const result = await methods.replaceDirectory([jane, john]);
    expect(result.inserted).toBe(2);
    expect(result.removed).toBe(0);

    const listed = await methods.listDirectory();
    expect(listed).toHaveLength(2);
    const listedJane = listed.find((entry) => entry.uid === 'jdoe1');
    expect(listedJane).toEqual(jane);
    expect(listedJane).not.toHaveProperty('snapshot');
    expect(listedJane).not.toHaveProperty('_id');
  });

  it('removes the previous snapshot on the next publish', async () => {
    await methods.replaceDirectory([jane, john]);
    const moved = { ...jane, dorm: 'Wharton', room: 'A12' };
    const result = await methods.replaceDirectory([moved]);
    expect(result.inserted).toBe(1);
    expect(result.removed).toBe(2);

    const listed = await methods.listDirectory();
    expect(listed).toEqual([moved]);
  });

  it('rolls back a partial snapshot so opted-out students from the old one disappear on the next publish', async () => {
    const optedOut: DirectoryEntry = {
      ...john,
      uid: 'optout1',
      firstName: 'Opted',
      lastName: 'Out',
    };
    await methods.replaceDirectory([jane, optedOut]);
    const [oldSnapshot] = await DirectoryEntryModel.distinct('snapshot');

    const moved = { ...jane, dorm: 'Wharton', room: 'A12' };
    await expect(methods.replaceDirectory([moved, john, { ...john }])).rejects.toThrow();

    const snapshots = await DirectoryEntryModel.distinct('snapshot');
    expect(snapshots).toEqual([oldSnapshot]);
    const afterFailure = await methods.listDirectory();
    expect(afterFailure.map((entry) => entry.uid).sort()).toEqual(['jdoe1', 'optout1']);
    expect(afterFailure.find((entry) => entry.uid === 'jdoe1')).toEqual(jane);

    const result = await methods.replaceDirectory([moved, john]);
    expect(result.removed).toBe(2);
    const listed = await methods.listDirectory();
    expect(listed.map((entry) => entry.uid).sort()).toEqual(['jdoe1', 'jroe1']);
    expect(await DirectoryEntryModel.distinct('snapshot')).toEqual([result.snapshot]);
  });

  it('never rolls back the live snapshot when a failed publish lands in the same millisecond', async () => {
    const clock = jest
      .spyOn(Date.prototype, 'toISOString')
      .mockReturnValue('2026-10-05T00:00:00.000Z');
    try {
      const published = await methods.replaceDirectory([jane, john]);
      await expect(methods.replaceDirectory([jane, { ...jane }])).rejects.toThrow();
      expect(await DirectoryEntryModel.distinct('snapshot')).toEqual([published.snapshot]);
      const listed = await methods.listDirectory();
      expect(listed.map((entry) => entry.uid).sort()).toEqual(['jdoe1', 'jroe1']);
    } finally {
      clock.mockRestore();
    }
  });

  it('sweeps leftover rows from earlier snapshots on a successful publish', async () => {
    await DirectoryEntryModel.insertMany([
      { ...jane, snapshot: '2026-01-01T00:00:00.000Z' },
      { ...john, uid: 'gone1', snapshot: '2026-01-02T00:00:00.000Z' },
    ]);
    const result = await methods.replaceDirectory([john]);
    expect(result.removed).toBe(2);
    expect(await methods.listDirectory()).toEqual([john]);
  });

  it('refuses to publish an empty snapshot', async () => {
    await methods.replaceDirectory([jane]);
    await expect(methods.replaceDirectory([])).rejects.toThrow('empty directory snapshot');
    expect(await methods.listDirectory()).toHaveLength(1);
  });
});

describe('listDirectory', () => {
  it('prefers the newest snapshot when two overlap', async () => {
    await DirectoryEntryModel.insertMany([
      { ...jane, snapshot: '2026-01-01T00:00:00.000Z' },
      { ...jane, dorm: 'Mertz', room: '101', snapshot: '2026-02-01T00:00:00.000Z' },
    ]);
    const listed = await methods.listDirectory();
    expect(listed).toHaveLength(1);
    expect(listed[0].dorm).toBe('Mertz');
  });
});
