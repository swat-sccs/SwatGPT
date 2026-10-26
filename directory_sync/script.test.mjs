import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

const CYGNET_ENV = {
  DB_HOST: '130.58.64.142',
  DB_USER: 'its_reader',
  DB_PASS: 'its-secret-pass',
  DB_NAME: 'student_data',
  MYSQL_USER: 'cygnet',
  MYSQL_PASSWORD: 'overlay-secret-pass',
  MYSQL_DATABASE: 'cygnet',
};

/**
 * Stands in for the docker CLI: answers the calls export.sh makes, records
 * every argv, and snapshots the --env-file (contents and mode) at create time.
 */
const DOCKER_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_DIR/argv"
case "$1 $2" in
  "service inspect") cat "$STUB_DIR/cygnet.env" ;;
  "info --format") echo gull ;;
  "service create")
    prev=
    for arg in "$@"; do
      if [[ $prev == --env-file ]]; then
        echo "$arg" > "$STUB_DIR/envfile.path"
        stat -c %a "$arg" > "$STUB_DIR/envfile.mode"
        cp "$arg" "$STUB_DIR/envfile.copy"
      fi
      prev=$arg
    done
    echo '[]' > "$OUT_DIR/directory.json"
    ;;
  "service ps")
    if [[ " $* " == *" -q "* ]]; then echo task1; else echo "Complete 1 second ago"; fi
    ;;
  "inspect --format") echo 0 ;;
esac
exit 0
`;

/**
 * Stands in for ssh and scp on gull: records every argv and the script piped to
 * `bash -s`. With STUB_EXEC=1 it also runs that script locally against a fake
 * $HOME and the docker stub, which captures what reaches the api container.
 */
const SSH_STUB = `#!/usr/bin/env bash
printf '%s\\n' "ssh $*" >> "$STUB_DIR/argv"
if [[ "\${*: -2}" == "bash -s" ]]; then
  cat > "$STUB_DIR/remote.sh"
  [[ "\${STUB_EXEC:-}" == 1 ]] || exit 0
  cd "$HOME" && exec bash "$STUB_DIR/remote.sh"
fi
[[ "\${STUB_EXEC:-}" == 1 ]] || exit 0
cd "$HOME" && exec bash -c "\${*: -1}"
`;

const SCP_STUB = `#!/usr/bin/env bash
printf '%s\\n' "scp $*" >> "$STUB_DIR/argv"
[[ "\${STUB_EXEC:-}" == 1 ]] || exit 0
src=\${*: -2:1}; dst=\${*: -1}
cp "$src" "$HOME/\${dst#*:}"
`;

const DOCKER_SYNC_STUB = `
case "$1 $2 $3" in
  "compose exec -T")
    case "$*" in
      *"cat > "*) cat > "$STUB_DIR/container.json" ;;
      *import-directory*) cp "$STUB_DIR/container.json" "$STUB_DIR/imported.json" ;;
    esac
    ;;
esac
`;

function runSync(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sync-sh-'));
  const bin = join(dir, 'bin');
  const home = join(dir, 'home');
  const repo = join(home, 'deploy');
  spawnSync('mkdir', ['-p', bin, join(dir, 'tmp'), repo]);
  writeFileSync(
    join(bin, 'docker'),
    DOCKER_STUB.replace('case "$1 $2" in', `${DOCKER_SYNC_STUB}case "$1 $2" in`),
  );
  writeFileSync(join(bin, 'ssh'), SSH_STUB);
  writeFileSync(join(bin, 'scp'), SCP_STUB);
  for (const name of ['docker', 'ssh', 'scp']) {
    chmodSync(join(bin, name), 0o755);
  }
  writeFileSync(
    join(dir, 'cygnet.env'),
    Object.entries(CYGNET_ENV)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
  const result = spawnSync('bash', [join(HERE, 'sync.sh')], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      STUB_DIR: dir,
      HOME: home,
      TMPDIR: join(dir, 'tmp'),
      OUT_DIR: join(dir, 'out'),
      EAGLE: 'deploy@eagle.example',
      ...env,
    },
  });
  const read = (name) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : undefined;
  const run = {
    status: result.status,
    stderr: result.stderr,
    argv: read('argv') ?? '',
    remote: read('remote.sh') ?? '',
    imported: read('imported.json'),
    homeLeftovers: existsSync(join(home, '.cache')) ? readdirSync(join(home, '.cache')) : [],
    repo,
  };
  rmSync(dir, { recursive: true, force: true });
  return run;
}

function runExport(env) {
  const dir = mkdtempSync(join(tmpdir(), 'export-sh-'));
  const bin = join(dir, 'bin');
  const temp = join(dir, 'tmp');
  const out = join(dir, 'out');
  spawnSync('mkdir', ['-p', bin, temp]);
  writeFileSync(join(bin, 'docker'), DOCKER_STUB);
  chmodSync(join(bin, 'docker'), 0o755);
  writeFileSync(
    join(dir, 'cygnet.env'),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
  const result = spawnSync('bash', [join(HERE, 'export.sh')], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      STUB_DIR: dir,
      TMPDIR: temp,
      OUT_DIR: out,
    },
  });
  const read = (name) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : undefined;
  const run = {
    status: result.status,
    stderr: result.stderr,
    argv: read('argv') ?? '',
    envFile: read('envfile.copy'),
    envFileMode: read('envfile.mode')?.trim(),
    envFilePath: read('envfile.path')?.trim(),
    leftovers: readdirSync(temp),
  };
  rmSync(dir, { recursive: true, force: true });
  return run;
}

test('passes database credentials through a private env file, never argv', () => {
  const run = runExport(CYGNET_ENV);
  assert.equal(run.status, 0, run.stderr);
  for (const secret of [CYGNET_ENV.DB_PASS, CYGNET_ENV.MYSQL_PASSWORD, CYGNET_ENV.DB_USER]) {
    assert.ok(!run.argv.includes(secret), `docker argv leaked ${secret}`);
  }
  assert.equal(run.envFileMode, '600');
  assert.match(run.envFile, /^ITS_DB_PASS=its-secret-pass$/m);
  assert.match(run.envFile, /^OVERLAY_DB_PASS=overlay-secret-pass$/m);
  assert.match(run.envFile, /^ITS_DB_HOST=130\.58\.64\.142$/m);
  assert.match(run.envFile, /^OVERLAY_DB_NAME=cygnet$/m);
});

test('removes the env file once the service is created', () => {
  const run = runExport(CYGNET_ENV);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.envFilePath);
  assert.deepEqual(run.leftovers, []);
});

test('installs from the lockfile with install scripts disabled', () => {
  const run = runExport(CYGNET_ENV);
  const create = run.argv.split('\n').find((line) => line.startsWith('service create'));
  assert.ok(create);
  assert.match(create, /npm ci --omit=dev --ignore-scripts/);
  assert.match(create, /\/src\/package-lock\.json/);
  assert.doesNotMatch(create, /npm install/);
  assert.match(create, /node:24-alpine@sha256:[0-9a-f]{64}/);
});

test('aborts before creating the service when a credential is missing', () => {
  const { MYSQL_PASSWORD: _omitted, ...partial } = CYGNET_ENV;
  const run = runExport(partial);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Cygnet service has no MYSQL_PASSWORD/);
  assert.ok(!run.argv.includes('service create'));
  assert.deepEqual(run.leftovers, []);
});

test('the lockfile pins every dependency with an integrity hash', () => {
  const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(HERE, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
  const installed = Object.entries(lock.packages).filter(([path]) => path !== '');
  assert.ok(installed.length > 0);
  for (const [path, entry] of installed) {
    assert.match(entry.integrity ?? '', /^sha512-/, `${path} has no integrity hash`);
  }
});

test('sync.sh publishes from the eagle deploy tree by default', () => {
  const run = runSync();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.remote, /^cd "\/srv\/SwatGPT"$/m);
  assert.match(
    run.argv,
    /^scp -q \S+\/directory\.json deploy@eagle\.example:\.cache\/swatgpt-directory\.json$/m,
  );
});

test('sync.sh streams the snapshot into the container instead of docker compose cp', () => {
  const run = runSync();
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.remote, /docker compose cp/);
  assert.match(
    run.remote,
    /^docker compose exec -T api sh -c 'umask 077; cat > "\/tmp\/directory\.json"' < "\$HOME\/\.cache\/swatgpt-directory\.json"$/m,
  );
  assert.match(
    run.remote,
    /^docker compose exec -T api npm run import-directory -- "\/tmp\/directory\.json"$/m,
  );
});

test('sync.sh delivers the exported snapshot to the import and cleans up on eagle', () => {
  const run = runSync({ STUB_EXEC: '1', EAGLE_REPO: 'deploy' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.imported, '[]\n');
  assert.deepEqual(run.homeLeftovers, []);
});
