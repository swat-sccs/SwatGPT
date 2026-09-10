const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { execFileSync } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

const script = path.resolve(__dirname, '..', 'import-directory.js');

const snapshot = [
  {
    uid: 'JDoe1',
    firstName: 'Jane',
    lastName: 'Doe',
    gradYear: 2027,
    dorm: 'WILLET',
    room: '214',
    showProfile: true,
    showDorm: true,
  },
  {
    uid: 'jroe1',
    firstName: 'John',
    lastName: 'Roe',
    gradYear: 2028,
    dorm: 'Mertz',
    room: '101',
    showProfile: true,
    showDorm: false,
  },
  {
    uid: 'hidden1',
    firstName: 'Hidden',
    lastName: 'Student',
    gradYear: 2029,
    dorm: 'Mertz',
    room: '102',
    showProfile: false,
    showDorm: true,
  },
  {
    uid: 'offcampus1',
    firstName: 'Off',
    lastName: 'Campus',
    gradYear: 2026,
    dorm: '',
    room: '',
    showProfile: true,
    showDorm: true,
  },
];

let mongoServer;
let workdir;

function runImport(file, mongoUri) {
  return execFileSync(process.execPath, [script, file], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env, MONGO_URI: mongoUri, NODE_ENV: 'test' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'directory-import-'));
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  fs.rmSync(workdir, { recursive: true, force: true });
});

describe('import-directory CLI', () => {
  it('publishes a snapshot honoring the Cygnet privacy flags', async () => {
    const file = path.join(workdir, 'snapshot.json');
    fs.writeFileSync(file, JSON.stringify(snapshot));

    const output = runImport(file, mongoServer.getUri());
    expect(output).toContain('Read 4 rows, 2 publishable entries');
    expect(output).toMatch(/Published snapshot .*: inserted 2, removed 0 old rows/);

    const rows = await mongoose.connection.db
      .collection('directoryentries')
      .find({}, { projection: { _id: 0, uid: 1, dorm: 1, room: 1, dormHidden: 1, snapshot: 1 } })
      .sort({ uid: 1 })
      .toArray();
    expect(rows).toEqual([
      { uid: 'jdoe1', dorm: 'Willets', room: '214', dormHidden: false, snapshot: rows[0].snapshot },
      { uid: 'jroe1', dormHidden: true, snapshot: rows[0].snapshot },
    ]);
  });

  it('replaces the previous snapshot on the next import', async () => {
    const file = path.join(workdir, 'next.json');
    fs.writeFileSync(file, JSON.stringify(snapshot.slice(0, 1)));

    const output = runImport(file, mongoServer.getUri());
    expect(output).toMatch(/inserted 1, removed 2 old rows/);

    const uids = await mongoose.connection.db.collection('directoryentries').distinct('uid');
    expect(uids).toEqual(['jdoe1']);
  });

  it('refuses an empty snapshot and leaves the directory untouched', async () => {
    const file = path.join(workdir, 'empty.json');
    fs.writeFileSync(file, '[]');

    expect(() => runImport(file, mongoServer.getUri())).toThrow(/refusing to publish/);
    const count = await mongoose.connection.db.collection('directoryentries').countDocuments();
    expect(count).toBe(1);
  });
});
