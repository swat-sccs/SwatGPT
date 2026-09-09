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
