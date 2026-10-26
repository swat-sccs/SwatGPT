import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const root = fileURLToPath(new URL('../../', import.meta.url));
const yaml = createRequire(path.join(root, 'package.json'))('js-yaml');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => yaml.load(read(file));

const GULL = '130.58.218.21';
const TOKEN = 'a'.repeat(64);

/** Applies compose's override semantics for the keys these files use. */
function mergeService(base = {}, override = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value) && Array.isArray(base[key]) && key !== 'command') {
      merged[key] = [...base[key], ...value];
    } else if (value && typeof value === 'object' && !Array.isArray(value) && base[key]) {
      merged[key] = { ...base[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function composeServices() {
  const base = load('docker-compose.yml').services;
  const override = load('docker-compose.override.yml').services;
  const names = new Set([...Object.keys(base), ...Object.keys(override)]);
  return Object.fromEntries(
    [...names].map((name) => [name, mergeService(base[name], override[name])]),
  );
}

/** Resolves `${VAR:-default}` / `${VAR}` with the given environment (compose defaults otherwise). */
function interpolate(value, env = {}) {
  return String(value).replace(
    /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g,
    (_, name, fallback) => env[name] ?? fallback ?? '',
  );
}

function publishedPorts(service, env) {
  return (service.ports ?? []).map((spec) => {
    const parts = interpolate(spec, env).split(':');
    return parts.length === 3
      ? { bind: parts[0], host: Number(parts[1]), container: Number(parts[2]) }
      : { bind: '0.0.0.0', host: Number(parts[0]), container: Number(parts[1]) };
  });
}

function environment(service) {
  const env = service.environment ?? {};
  if (!Array.isArray(env)) return env;
  return Object.fromEntries(
    env.map((entry) => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]),
  );
}

function hardenPorts(name) {
  const match = read('monitoring/eagle-harden.sh').match(new RegExp(`^${name}="([^"]*)"`, 'm'));
  assert.ok(match, `${name} not found in eagle-harden.sh`);
  return match[1].split(/\s+/).filter(Boolean).map(Number);
}

test('admin panel binds to loopback and its image is pinned by digest', () => {
  const panel = composeServices()['admin-panel'];
  const image = interpolate(panel.image);
  assert.match(image, /@sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(image, /:latest$/);
  const ports = publishedPorts(panel);
  assert.ok(ports.length > 0);
  for (const port of ports) assert.equal(port.bind, '127.0.0.1');
});

test('every compose service rotates its json-file logs', () => {
  for (const [name, service] of Object.entries(composeServices())) {
    assert.equal(service.logging?.driver, 'json-file', `${name} has no json-file logging`);
    assert.ok(service.logging.options?.['max-size'], `${name} has no max-size`);
    assert.ok(
      Number(interpolate(service.logging.options?.['max-file'])) > 0,
      `${name} has no max-file`,
    );
  }
});

test('swatgpt-mcp is locked down and resource-limited', () => {
  const mcp = composeServices()['swatgpt-mcp'];
  assert.equal(mcp.read_only, true);
  assert.ok(
    mcp.tmpfs.some((mount) => mount.startsWith('/tmp')),
    'healthcheck needs a writable /tmp',
  );
  assert.deepEqual(mcp.cap_drop, ['ALL']);
  assert.ok(mcp.security_opt.includes('no-new-privileges:true'));
  assert.ok(Number(mcp.pids_limit) > 0);
  assert.ok(Number(interpolate(mcp.cpus)) > 0);
  const memMb = Number(interpolate(mcp.mem_limit).replace(/m$/, ''));
  const heapMb = Number(
    interpolate(environment(mcp).NODE_OPTIONS).match(/--max-old-space-size=(\d+)/)?.[1],
  );
  assert.ok(memMb > 0 && heapMb > 0 && heapMb < memMb, 'V8 heap must stay below the cgroup limit');
});

test('Dash MCP metrics are published on the exporter address and accept the scrape Host header', () => {
  const mcp = composeServices()['swatgpt-mcp'];
  const ports = publishedPorts(mcp);
  assert.deepEqual(ports, [{ bind: '130.58.218.151', host: 3001, container: 3000 }]);
  const target = read('monitoring/prometheus/swatgpt-jobs.yml').match(/"([a-z.]+):3001"/)?.[1];
  assert.ok(target, 'swatgpt_mcp scrape target missing');
  const allowed = interpolate(environment(mcp).MCP_ALLOWED_HOSTS).split(',');
  assert.ok(
    allowed.includes(target),
    `${target} must be in MCP_ALLOWED_HOSTS or the scrape gets 403`,
  );
  assert.ok(allowed.includes('swatgpt-mcp'), 'LibreChat reaches Dash MCP as swatgpt-mcp');
});

test('every non-loopback published port is covered by an eagle-harden.sh rule', () => {
  const covered = new Set([...hardenPorts('GULL_ONLY_PORTS'), ...hardenPorts('CAMPUS_ONLY_PORTS')]);
  for (const [name, service] of Object.entries(composeServices())) {
    for (const port of publishedPorts(service, { PORT: '3080' })) {
      if (port.bind === '127.0.0.1') continue;
      assert.ok(
        covered.has(port.host),
        `${name} publishes ${port.bind}:${port.host} with no firewall rule`,
      );
    }
  }
  for (const port of [3080, 3001, 9100, 8080])
    assert.ok(hardenPorts('GULL_ONLY_PORTS').includes(port), `${port} must be gull-only`);
});

test('retrieval failure alert ignores empty results and needs minimum volume', () => {
  const rules = load('monitoring/prometheus/swatgpt-alerts.yml').groups.flatMap(
    (group) => group.rules,
  );
  const rule = rules.find((candidate) => candidate.alert === 'SwatGPTRetrievalFailureRatioHigh');
  assert.ok(rule, 'SwatGPTRetrievalFailureRatioHigh missing');
  assert.doesNotMatch(rule.expr, /result!="hit"/);
  const numerator = rule.expr.match(/sum\(rate\(rag_retrieval_total\{[^}]*\}\[10m\]\)\)/)[0];
  assert.match(numerator, /result=~"timeout\|error"/);
  const floor = Number(
    rule.expr.match(/sum\(increase\(rag_retrieval_total\{[^}]*\}\[10m\]\)\) >= (\d+)/)?.[1],
  );
  assert.ok(floor >= 5, 'one off-topic message at 2am must not be able to page');
});

test('node_exporter reads the backup textfile directory through the rootfs mount', () => {
  const exporter = composeServices()['node-exporter'];
  const rootfs = exporter.volumes.find((volume) => volume.split(':')[1] === '/rootfs');
  assert.equal(rootfs, '/:/rootfs:ro');
  const flag = exporter.command.find((arg) => arg.startsWith('--collector.textfile.directory='));
  assert.equal(
    flag,
    '--collector.textfile.directory=/rootfs/var/lib/node_exporter/textfile_collector',
  );
  const textfileDir = read('ops/backup/lib.sh').match(/TEXTFILE_DIR=([^}]+)\}/)?.[1];
  assert.equal(`/rootfs${textfileDir}`, flag.split('=')[1]);
});

test('the swatgpt-backup group gull loads matches the ops/backup reference copy', () => {
  const live = load('monitoring/prometheus/swatgpt-alerts.yml').groups.find(
    (group) => group.name === 'swatgpt-backup',
  );
  assert.ok(live, 'swatgpt-backup group missing from swatgpt-alerts.yml');
  assert.deepEqual(load('ops/backup/alerts.yml').groups, [live]);
});

test('alert names agree across rules, Alertmanager inhibitions, and the README table', () => {
  const names = new Set(
    load('monitoring/prometheus/swatgpt-alerts.yml').groups.flatMap((group) =>
      group.rules.map((rule) => rule.alert),
    ),
  );
  const matchers = load('monitoring/alertmanager/alertmanager.yml').inhibit_rules.flatMap(
    (rule) => [...rule.source_matchers, ...rule.target_matchers],
  );
  for (const matcher of matchers) {
    const [, op, value] = matcher.match(/^alertname\s*(=~|=)\s*(.+)$/);
    const pattern = new RegExp(
      `^(?:${op === '=' ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : value})$`,
    );
    assert.ok(
      [...names].some((name) => pattern.test(name)),
      `inhibit matcher ${matcher} matches no rule`,
    );
  }
  const documented = new Set(
    [...read('monitoring/README.md').matchAll(/^\| `(SwatGPT\w+)` \|/gm)].map((m) => m[1]),
  );
  assert.deepEqual([...documented].sort(), [...names].sort());
});

/** GitHub's heading slug: lowercase, drop punctuation other than hyphens, spaces to hyphens. */
function headingSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

test('every alert has a runbook_url that resolves to a heading in monitoring/README.md', () => {
  const readme = read('monitoring/README.md');
  const anchors = new Set([...readme.matchAll(/^#{1,6} (.+)$/gm)].map((m) => headingSlug(m[1])));
  const rules = load('monitoring/prometheus/swatgpt-alerts.yml').groups.flatMap(
    (group) => group.rules,
  );
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    const url = rule.annotations?.runbook_url;
    assert.ok(url, `${rule.alert} has no runbook_url`);
    const [page, anchor] = url.split('#');
    assert.equal(
      page,
      'https://github.com/swat-sccs/SwatGPT/blob/main/monitoring/README.md',
      rule.alert,
    );
    assert.equal(
      anchor,
      rule.alert.toLowerCase(),
      `${rule.alert} runbook anchor must be its own name`,
    );
    assert.ok(
      anchors.has(anchor),
      `${rule.alert}: no "### ${rule.alert}" heading in monitoring/README.md`,
    );
  }
});

test('Alertmanager titles come from group labels and messages print the runbook', () => {
  const config = load('monitoring/alertmanager/alertmanager.yml');
  assert.ok(config.route.group_by.includes('alertname'));
  for (const label of ['kind', 'domain'])
    assert.ok(config.route.group_by.includes(label), `group_by must include ${label}`);
  for (const receiver of config.receivers) {
    for (const discord of receiver.discord_configs ?? []) {
      assert.match(discord.title, /\.GroupLabels\.alertname/);
      assert.doesNotMatch(discord.title, /CommonAnnotations\.summary/);
      assert.match(discord.message, /\.Annotations\.runbook_url/);
    }
  }
});

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swatgpt-hardening-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(dir, 'calls.log');
  const stub = (name, body = '') =>
    fs.writeFileSync(
      path.join(bin, name),
      `#!/bin/bash\nprintf '%s\\n' "${name} $*" >> "${log}"\n${body}\n`,
      { mode: 0o755 },
    );
  stub('id', 'echo 0');
  stub('apt-get');
  stub('netfilter-persistent');
  stub('sleep');
  stub('chown');
  stub('iptables', 'case "$1" in -C|-D) exit 1;; esac');
  stub('sudo', 'while [ "${1:-}" = -u ]; do shift 2; done; exec "$@"');
  stub(
    'docker',
    `case "$*" in
      *"compose exec"*) grep '^AUDIT_LOG_FAIL_CLOSED=' .env;;
      *wget*) echo '{"data":{"activeTargets":[],"groups":[]}}';;
      *"ps -q"*) echo cid;;
    esac`,
  );
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
  const run = (script, env, input = '', args = []) =>
    spawnSync('bash', [path.join(root, script), ...args], {
      input,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
    });
  return { dir, calls, run };
}

function hardenSandbox(envFile) {
  const box = sandbox();
  const repo = path.join(box.dir, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, '.env'), envFile);
  return {
    ...box,
    repo,
    harden: () => box.run('monitoring/eagle-harden.sh', { SWATGPT_REPO: repo }),
  };
}

test('eagle-harden.sh forces AUDIT_LOG_FAIL_CLOSED=true in place and recreates api', () => {
  const box = hardenSandbox('PORT=3080\nAUDIT_LOG_FAIL_CLOSED=false\nOTHER=1\n');
  const envPath = path.join(box.repo, '.env');
  const inode = fs.statSync(envPath).ino;
  const result = box.harden();
  assert.equal(result.status, 0, result.stderr);
  const env = fs.readFileSync(envPath, 'utf8');
  assert.equal(env, 'PORT=3080\nAUDIT_LOG_FAIL_CLOSED=true\nOTHER=1\n');
  assert.equal(fs.statSync(envPath).ino, inode, '.env must keep its inode and mode');
  assert.match(result.stdout, /WARNING: AUDIT_LOG_FAIL_CLOSED was 'false'/);
  assert.match(box.calls(), /^docker compose up -d --force-recreate --no-deps api$/m);
  assert.match(result.stdout, /api container sees: AUDIT_LOG_FAIL_CLOSED=true/);
});

test('eagle-harden.sh appends the flag once and leaves an existing true alone', () => {
  const box = hardenSandbox('PORT=3080\n');
  assert.equal(box.harden().status, 0);
  assert.equal(box.harden().status, 0);
  const lines = fs
    .readFileSync(path.join(box.repo, '.env'), 'utf8')
    .match(/^AUDIT_LOG_FAIL_CLOSED=.*$/gm);
  assert.deepEqual(lines, ['AUDIT_LOG_FAIL_CLOSED=true']);
});

test('eagle-harden.sh restricts published host ports with conntrack, not container ports', () => {
  const box = hardenSandbox('AUDIT_LOG_FAIL_CLOSED=true\n');
  const result = box.harden();
  assert.equal(result.status, 0, result.stderr);
  const calls = box.calls();
  for (const port of [3080, 3001, 9100, 8080]) {
    assert.ok(
      calls.includes(
        `iptables -A SWATGPT-INGRESS -p tcp -m conntrack --ctorigdstport ${port} --ctdir ORIGINAL ! -s ${GULL} -j DROP`,
      ),
      `missing gull-only rule for ${port}`,
    );
  }
  assert.ok(
    calls.includes('-m conntrack --ctorigdstport 3000 --ctdir ORIGINAL ! -s 130.58.0.0/16 -j DROP'),
  );
  assert.ok(calls.includes('iptables -I DOCKER-USER 1 -i enp6s18 -j SWATGPT-INGRESS'));
  assert.doesNotMatch(
    calls,
    /^iptables -[AI] .*--dport/m,
    '--dport sees the DNATed container port',
  );
  const flush = calls.indexOf('iptables -F SWATGPT-INGRESS');
  const lastAppend = calls.lastIndexOf('iptables -A SWATGPT-INGRESS -j RETURN');
  assert.ok(flush >= 0 && lastAppend > flush, 'chain is rebuilt from scratch, RETURN last');
  assert.ok(calls.indexOf('netfilter-persistent save') > lastAppend);
});

test('eagle-harden.sh warns when IPv6 publishes bypass the IPv4 rules', () => {
  const quiet = hardenSandbox('AUDIT_LOG_FAIL_CLOSED=true\n');
  fs.writeFileSync(path.join(quiet.dir, 'bin', 'ip'), '#!/bin/bash\n', { mode: 0o755 });
  const without = quiet.harden();
  assert.equal(without.status, 0, without.stderr);
  assert.doesNotMatch(without.stdout, /IPv6/);

  const box = hardenSandbox('AUDIT_LOG_FAIL_CLOSED=true\n');
  fs.writeFileSync(
    path.join(box.dir, 'bin', 'ip'),
    '#!/bin/bash\necho "2: enp6s18    inet6 2001:db8::151/64 scope global"\n',
    { mode: 0o755 },
  );
  const result = box.harden();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /WARNING: enp6s18 has a global IPv6 address/);
});

const SCRATCH_JOB = '  - job_name: scratch\n    static_configs:\n        - targets: []\n';

function gullSandbox({ stack = 'services:\n  alertmanager:\n    image: x\n' } = {}) {
  const box = sandbox();
  const monitor = path.join(box.dir, 'monitor');
  const config = path.join(monitor, 'prometheus/config');
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(path.join(monitor, 'alertmanager/config'), { recursive: true });
  const jobs = ['vllm', 'tei', 'eagle', 'swatgpt_app']
    .map((job) => `  - job_name: ${job}\n    static_configs:\n      - targets: ["x:1"]\n`)
    .join('\n');
  fs.writeFileSync(
    path.join(config, 'prometheus.yml'),
    `global:\n  scrape_interval: 15s\nalerting:\n  alertmanagers:\n    - static_configs:\n        - targets: []\nscrape_configs:\n${jobs}${SCRATCH_JOB}`,
  );
  fs.writeFileSync(path.join(monitor, 'prometheus/docker-compose.yml'), stack);
  fs.writeFileSync(
    path.join(monitor, 'alertmanager/config/alertmanager.yml'),
    'inhibit_rules:\n  - target_matchers: ["alertname = SwatGPTRetrievalNonHitRatioHigh"]\n',
  );
  const install = (input, args = [], env = {}) =>
    box.run('monitoring/gull-install.sh', { GULL_MONITOR_ROOT: monitor, ...env }, input, args);
  return { ...box, config, install };
}

test('gull-install.sh refuses the metrics secret as an argument', () => {
  const box = gullSandbox();
  const result = box.install('', [TOKEN]);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(box.config, 'swatgpt_metrics_token')), false);
  assert.equal(box.install('short\n').status === 0, false, 'short secrets are rejected');
});

test('gull-install.sh reads the secret from stdin and writes the token file 640 without a window', () => {
  const box = gullSandbox();
  const result = box.install(`${TOKEN}\n`);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const tokenFile = path.join(box.config, 'swatgpt_metrics_token');
  assert.equal(fs.readFileSync(tokenFile, 'utf8'), TOKEN);
  assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o640);
  assert.match(
    box.calls(),
    /^chown root:docker .*\.swatgpt_metrics_token\.\w+$/m,
    'ownership is set before the move',
  );
  assert.doesNotMatch(box.calls(), new RegExp(TOKEN), 'the secret never reaches a command line');
  assert.match(result.stdout, /WARNING: .*SwatGPTRetrievalNonHitRatioHigh/);
  assert.match(result.stdout, /WARNING: .*predates the backup alerts/);
});

test('gull-install.sh stays quiet once gull has the backup inhibit rule', () => {
  const box = gullSandbox();
  const config = path.join(box.dir, 'monitor/alertmanager/config/alertmanager.yml');
  fs.copyFileSync(path.join(root, 'monitoring/alertmanager/alertmanager.yml'), config);
  const result = box.install(`${TOKEN}\n`);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.doesNotMatch(result.stdout, /WARNING: .*alertmanager\.yml/);
});

test('gull-install.sh accepts METRICS_SECRET_FILE and appends only missing scrape jobs', () => {
  const box = gullSandbox();
  const secret = path.join(box.dir, 'secret');
  fs.writeFileSync(secret, `${TOKEN}\n`, { mode: 0o600 });
  for (let i = 0; i < 2; i++) {
    const result = box.install('', [], { METRICS_SECRET_FILE: secret });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  }
  const prom = fs.readFileSync(path.join(box.config, 'prometheus.yml'), 'utf8');
  const count = (job) => prom.split(`job_name: ${job}\n`).length - 1;
  for (const job of ['vllm', 'tei', 'eagle', 'swatgpt_app', 'swatgpt_mcp'])
    assert.equal(count(job), 1, job);
  assert.match(
    prom,
    /- job_name: swatgpt_mcp\n {4}static_configs:\n {6}- targets: \["eagle\.sccs\.swarthmore\.edu:3001"\]/,
  );
  assert.doesNotMatch(prom, /swatgpt_readyz/);
  assert.equal(fs.readFileSync(path.join(box.config, 'swatgpt_metrics_token'), 'utf8'), TOKEN);
});

test('gull-install.sh fills only the alertmanager target list and validates with the stack image', () => {
  const stack =
    'services:\n  prometheus:\n    image: prom/prometheus:v2.53.0\n  alertmanager:\n    image: x\n';
  const box = gullSandbox({ stack });
  const result = box.install(`${TOKEN}\n`);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const prom = fs.readFileSync(path.join(box.config, 'prometheus.yml'), 'utf8');
  assert.match(
    prom,
    /alerting:\n {2}alertmanagers:\n {4}- static_configs:\n {8}- targets: \["alertmanager:9093"\]/,
  );
  assert.match(prom, /job_name: scratch\n {4}static_configs:\n {8}- targets: \[\]\n/);
  assert.match(
    box.calls(),
    /^docker run --rm -v \S+ --entrypoint promtool prom\/prometheus:v2\.53\.0 check config/m,
  );
  assert.doesNotMatch(box.calls(), /prom\/prometheus:latest/);
});

test('gull-install.sh falls back to a pinned promtool when the stack lists no prometheus image', () => {
  const box = gullSandbox();
  assert.equal(box.install(`${TOKEN}\n`).status, 0);
  assert.match(box.calls(), /--entrypoint promtool prom\/prometheus:v3\.5\.0 check config/m);
});
