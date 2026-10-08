# SwatGPT backups (eagle)

This directory holds nightly logical backups of everything stateful in the eagle stack, a weekly
automated restore test, metrics, and alert rules. It is repo-only: **nothing here is installed on
eagle yet**. The setup steps below change production and need the usual plan-and-approve first.

| What | How | File in each backup |
|---|---|---|
| MongoDB (conversations, messages, users, `conversation.viewed` audit log, usage ledger, flags) | `mongodump --archive --gzip` in `chat-mongodb` (all databases) | `mongo.archive.gz` |
| Postgres `swatgpt` (Dash MCP observations) | `pg_dump -Fc` in the `swatgpt-postgres` service, checked with `pg_restore --list` | `postgres.dump` |
| Qdrant KB index | Snapshot API on the collection behind the `kb` alias. The download is checked against the server's sha256 and the server-side copy is deleted afterwards | `qdrant.snapshot`, `qdrant.collection` |
| LibreChat files | `tar` of `/app/uploads`, `/app/client/public/images` and `/app/data` from the `api` container | `files.tar.gz` |

**Not in the backup: `/srv/SwatGPT/.env`.** It holds every secret, including `CREDS_KEY` and
`CREDS_IV`, which encrypt credentials stored in MongoDB (user-provided keys, MCP OAuth tokens).
A Mongo restore onto a host with a different `.env` loses those fields. Keep a current copy of
`.env` in Bitwarden and restore it before the data. `librechat.yaml` and the rest of the config
are in git.

Meilisearch is not backed up. It is a derived index of MongoDB, and LibreChat rebuilds it.
Qdrant can also be rebuilt by re-running `ingest/ingest.py`. The snapshot just makes a restore
take minutes instead of a re-scrape.

Each run writes to `$BACKUP_ROOT/.tmp-<name>.XXXXXX`, writes `MANIFEST` and `SHA256SUMS`, fsyncs,
then renames the directory to `$BACKUP_ROOT/<YYYY-MM-DDTHHMMSSZ>` (UTC) and moves the `latest`
symlink atomically. A failed or killed run never publishes a partial directory and never prunes.
The next run deletes any leftover `.tmp-*` directory. Files are mode 0600 (`umask 077`) because
they contain every conversation and `/app/data` credentials.

| File | Purpose |
|---|---|
| `backup.sh` | The backup run. Exits non-zero on any failure |
| `verify.sh` | Restore test: loads a backup into throwaway `mongo`/`postgres`/`qdrant` containers and checks data came back |
| `lib.sh` | Shared helpers (config defaults, lock, atomic textfile writes) |
| `backup.env.example` | Configuration, installed as `/etc/swatgpt-backup.env` |
| `systemd/` | `swatgpt-backup.{service,timer}` (nightly 03:30 ET) and `swatgpt-backup-verify.{service,timer}` (Sundays 05:00 ET) |
| `alerts.yml` | Reference copy of the `swatgpt-backup` rule group. The live copy is in `monitoring/prometheus/swatgpt-alerts.yml`; `monitoring/tests/hardening.test.mjs` keeps the two identical |
| `test/` | End-to-end tests against a throwaway compose project (`test/run.sh`) |

## Where backups go

The target is a **dedicated second virtual disk on eagle**: `scsi1`, 30 GB on `local-zfs`,
ext4, mounted at `/srv/backup`.

- **Not the root disk.** That disk is 50 GB and about 80% full, so it is the disk most likely to
  fail us. `backup.sh` refuses to write to the root filesystem unless `BACKUP_ALLOW_ROOTFS=1`.
- **Not goose and not hdd-pool.** That is the standing rule in `context/infrastructure.md` and
  `context/rag.md`. `local-zfs` is nest's SSD pool and has room (about 1.67 TB).
- **Off-host copy via PBS on ibis.** A disk on nest does not survive losing nest. The second disk
  is a normal VM disk, so eagle's PBS job on `ibis` copies it off-host with the rest of VM 111.
  Two things make this work. First, the job must include VM 111, which is still an open item
  (`context/launch-todo.md`, `context/eagle.md`). Second, `scsi1` must not be marked
  `backup=0`. Logical dumps in PBS also give a clean restore point that does not depend on a
  crash-consistent snapshot of live WiredTiger/Postgres files.

Sizing: data is about 1.1 GB today. Mongo and Qdrant compress well. 14 daily plus 8 weekly
copies come to about 22 copies, roughly 10 to 15 GB. `backup.sh` refuses to start with less than
`BACKUP_MIN_FREE_MB` (2 GiB) free. The Qdrant snapshot is staged briefly inside the
`qdrant-data` volume on the root disk (tens of MB) before download, then deleted.

## Setup on eagle (needs approval; not done)

1. **Add the disk** (nest, Proxmox UI or shell):
   `qm set 111 --scsi1 local-zfs:30,discard=on,iothread=1,ssd=1`
2. **Format and mount it** (eagle):

   ```sh
   lsblk                                  # the new disk, e.g. /dev/sdb, with no partitions
   sudo mkfs.ext4 -L swatgpt-backup /dev/sdb
   sudo mkdir -p /srv/backup
   echo 'LABEL=swatgpt-backup /srv/backup ext4 defaults,nofail,x-systemd.device-timeout=10s 0 2' | sudo tee -a /etc/fstab
   sudo mount /srv/backup && findmnt /srv/backup
   sudo install -d -m 0700 /srv/backup/swatgpt
   sudo install -d -m 0755 /var/lib/node_exporter/textfile_collector
   ```

3. **node_exporter's textfile collector.** The `node-exporter` service in
   `docker-compose.override.yml` already has
   `--collector.textfile.directory=/rootfs/var/lib/node_exporter/textfile_collector` (`/` is
   mounted at `/rootfs`), so the deploy that carries it recreates node-exporter. Until step 2
   creates the directory, node_exporter only reports `node_textfile_scrape_error 1`.

4. **Configure and install the units:**

   ```sh
   cd /srv/SwatGPT
   sudo install -m 0600 ops/backup/backup.env.example /etc/swatgpt-backup.env   # then edit if needed
   sudo install -m 0644 ops/backup/systemd/swatgpt-backup*.{service,timer} /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl start swatgpt-backup.service && journalctl -u swatgpt-backup.service -n 50
   sudo systemctl start swatgpt-backup-verify.service && journalctl -u swatgpt-backup-verify.service -n 50
   sudo systemctl enable --now swatgpt-backup.timer swatgpt-backup-verify.timer
   cat /var/lib/node_exporter/textfile_collector/swatgpt_backup*.prom
   curl -s localhost:9100/metrics | grep '^swatgpt_backup_'
   ```

   The units run as root (Docker access means root anyway) and point at the scripts in the
   deploy tree, `/srv/SwatGPT` (the working directory of `.github/workflows/production.yml`;
   `context/deployment.md` still says `~/SwatGPT`, so confirm with
   `docker compose ls` and fix `COMPOSE_DIR` and the unit paths if it differs). A deploy (`git reset --hard`) updates them in place. Only run `daemon-reload` and
   reinstall the files when `systemd/` itself changes.

5. **Alerts on gull.** The `swatgpt-backup` group is already in
   `monitoring/prometheus/swatgpt-alerts.yml`. Copy that file to `/srv/monitor/prometheus/config/`
   on gull (or rerun `monitoring/gull-install.sh`) and force-update Prometheus, after step 4, so
   `SwatGPTBackupMetricsMissing` does not fire for a backup that was never installed. No new
   scrape job is needed: the metrics come out of the existing `eagle` job on `:9100`.
   `gull-install.sh` never overwrites gull's `alertmanager.yml` (it holds the webhook), so copy the
   `SwatGPTBackupStale` -> `SwatGPTBackupRunFailed` inhibit rule from
   `monitoring/alertmanager/alertmanager.yml` into it by hand and force-update Alertmanager.

6. **Confirm PBS.** In the Proxmox UI, check that VM 111 is in a scheduled `ibis` job and that
   `scsi1` is included. Do one PBS file-level restore of `/srv/backup/swatgpt/latest/MANIFEST`.
   Then tick the PBS items in `context/launch-todo.md`, `context/deployment.md` and
   `context/eagle.md`.

## Metrics and alerts

`backup.sh` writes `swatgpt_backup.prom` on every exit, success or failure. A trap does it, so a
crash, a `die`, or SIGTERM from the systemd timeout is still recorded:

| Metric | Meaning |
|---|---|
| `swatgpt_backup_last_success_timestamp` | `completed_epoch` of the newest complete backup on disk (0 if none). It comes from the backups themselves, not from the previous metrics file |
| `swatgpt_backup_last_run_timestamp`, `_last_run_success`, `_last_run_duration_seconds` | The last attempt |
| `swatgpt_backup_retained_count` | Backups kept after pruning |
| `swatgpt_backup_size_bytes{file}` | Artifact sizes of the newest backup. A sudden drop is worth a look |

`verify.sh` writes `swatgpt_backup_verify.prom`:
`swatgpt_backup_last_verify_success_timestamp`, `_last_verify_run_success`,
`_last_verify_backup_timestamp`, `_last_verify_duration_seconds`.

Alerts (`swatgpt-backup` group in `monitoring/prometheus/swatgpt-alerts.yml`, mirrored in `alerts.yml`):

| Alert | Condition |
|---|---|
| `SwatGPTBackupStale` (critical) | No backup has succeeded in 36h |
| `SwatGPTBackupRunFailed` (warning) | The last run failed |
| `SwatGPTBackupMetricsMissing` (warning) | node_exporter is up but has no backup metrics for 2h (collector flag missing, or the timer never ran) |
| `SwatGPTBackupRestoreTestStale` (warning) | No passing restore test in 8 days |
| `SwatGPTBackupRestoreTestMissing` (warning) | 8 daily backups exist but the restore test has never run (verify timer not enabled) |

## Retention

After each successful run, `backup.sh` keeps:

- the newest backup of each of the newest `KEEP_DAILY` (14) UTC days, and
- the newest backup of each of the newest `KEEP_WEEKLY` (8) ISO weeks,

and deletes every other `YYYY-MM-DDTHHMMSSZ` directory. Anything else under `$BACKUP_ROOT` is
never touched, so a directory you copy aside under another name is safe. Pruning only runs after
a new backup has been published. Repeated failures never eat old backups.

## Restore runbook

Run on the host with the stack (eagle, or gull after the migration), from the checkout:

```sh
cd /srv/SwatGPT
B=/srv/backup/swatgpt/latest               # or a specific /srv/backup/swatgpt/<name>
(cd "$B" && sha256sum --quiet -c SHA256SUMS) && cat "$B/MANIFEST"
ops/backup/verify.sh "$B"                  # optional: prove this backup restores before touching prod
```

For a full rebuild (new VM or lost volumes), put `.env` back first, then build the app image and
start only the data services, so LibreChat never writes into an empty database:

```sh
docker compose build api
docker compose up -d mongodb swatgpt-postgres qdrant
```

Then run each restore below, skipping their `stop`/`up` lines, and finish with `docker compose up -d`.
The files restore uses `docker compose run`, so it needs the image but not a running `api`.

### MongoDB

Stop writers, replace the `LibreChat` database, and start them again. `--drop` replaces each
collection in the archive. Collections created after the backup are left alone.

```sh
docker compose stop api admin-panel
docker compose exec -T mongodb mongorestore --archive --gzip --drop --nsInclude='LibreChat.*' < "$B/mongo.archive.gz"
docker compose exec -T mongodb mongosh --quiet --eval 'const d = db.getSiblingDB("LibreChat"); ["users","conversations","messages"].forEach((c) => print(c, d[c].estimatedDocumentCount()))'
docker compose up -d api admin-panel
```

To restore one collection, use `--nsInclude='LibreChat.<collection>'` instead. To restore into a
side database for inspection without touching live data, add
`--nsFrom='LibreChat.*' --nsTo='restore_check.*'`.

LibreChat syncs Meilisearch from MongoDB on startup. If search still looks stale after the
restore, stop `api` and `meilisearch`, run `docker volume rm swatgpt_meili-data`, and bring both
back up. That only removes the derived search index.

### Postgres (`swatgpt`)

```sh
docker compose stop swatgpt-mcp
docker compose exec -T swatgpt-postgres sh -c \
  'exec pg_restore --clean --if-exists --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$B/postgres.dump"
docker compose up -d swatgpt-mcp
```

The dump is in custom format, so `pg_restore` is required. `psql` cannot read it. Restore with a
Postgres server of the same or a newer major version than the one that took it (17 today).

### Qdrant (`kb`)

Upload the snapshot into a collection of the original name, then point the `kb` alias at it.
Retrieval fails open while `kb` is missing (chat works without KB context).

```sh
C=$(cat "$B/qdrant.collection")
curl -fsS -X POST "http://127.0.0.1:6333/collections/$C/snapshots/upload?priority=snapshot&wait=true" \
  -F "snapshot=@$B/qdrant.snapshot"
curl -fsS -X POST http://127.0.0.1:6333/collections/aliases -H 'content-type: application/json' \
  -d "{\"actions\": [{\"create_alias\": {\"collection_name\": \"$C\", \"alias_name\": \"kb\"}}]}"
curl -fsS http://127.0.0.1:6333/collections/kb | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["points_count"])'
```

`create_alias` moves an existing `kb` alias. If the KB changed since the backup, re-run
`ingest/ingest.py` instead (see `ingest/README.md`). It builds a fresh collection and swaps the
alias itself.

### Uploads, images, `/app/data`

```sh
docker compose stop api
docker compose run --rm --no-deps -T --entrypoint tar api -C /app -xzf - < "$B/files.tar.gz"
docker compose up -d api
```

This extracts over what is there and does not delete newer files. `docker compose run` uses the
same volumes and user as `api`, so the restored files keep UID 1000.

## Restore test procedure

**Automated, weekly:** `swatgpt-backup-verify.timer` runs `verify.sh` against `latest`. The
script:

1. checks `SHA256SUMS`;
2. starts `mongo:8.0.20` and `postgres:17-alpine` with `--network none`, and `qdrant/qdrant:v1.15.1`
   bound to a random 127.0.0.1 port, each with data in a scratch dir under `$BACKUP_ROOT` (not on
   the root disk);
3. runs `mongorestore --stopOnError`, `pg_restore --exit-on-error`, and a Qdrant snapshot upload;
4. fails unless the `LibreChat` database has collections, Postgres has tables, and the
   collection has points, logging per-collection document counts;
5. lists the files archive;
6. removes the containers and the scratch data, and records the metrics.

It shares the backup lock (waiting up to an hour), so it never reads a backup while one is being
written. Under that lock it also removes containers and `.verify-*` scratch dirs left by a
restore test that was killed outright. It never touches the live containers or volumes.

**Manual, once a term and after any change to this directory:**

1. Run `sudo systemctl start swatgpt-backup.service swatgpt-backup-verify.service` and read both
   journals. Compare the logged counts with production:
   `docker compose exec -T mongodb mongosh --quiet --eval 'db.getSiblingDB("LibreChat").conversations.estimatedDocumentCount()'`.
2. Restore one real file from PBS: pick yesterday's `/srv/backup/swatgpt/<name>/postgres.dump`
   in the ibis file-restore UI, then run `ops/backup/verify.sh <that dir>` on the downloaded copy.
3. Write the date and counts in `context/eagle.md` under Operational.

## Tests

`ops/backup/test/run.sh` brings up a throwaway compose project (`swatgpt-fix-backups-it`; same
service names as production, data on tmpfs), seeds it, and checks:

- retention selection;
- the rootfs and free-space guards;
- a happy-path backup: artifacts, checksums, permissions, `latest`, and server-side snapshot cleanup;
- a failure mid-run: non-zero exit, nothing published, no leftover work dir, snapshot still
  deleted, `last_success` unchanged;
- the concurrency lock;
- `verify.sh` cleaning up after a killed run, passing, and failing on a checksum mismatch and on a truncated archive with valid
  checksums;
- every restore command in this runbook.

It needs Docker with the `mongo:8.0.20`, `postgres:16` (override with `TEST_POSTGRES_IMAGE`),
`qdrant/qdrant:v1.15.1` and `alpine` images. Never run it on eagle.

Alert rules have promtool unit tests in `test/alerts.test.yml`, run against the live group in
`monitoring/prometheus/swatgpt-alerts.yml`. From the repo root:
`docker run --rm -v "$PWD:/r:ro" --entrypoint promtool prom/prometheus:v3.5.0 test rules /r/ops/backup/test/alerts.test.yml`.

Lint: `shellcheck -x -P SCRIPTDIR ops/backup/*.sh ops/backup/test/run.sh`.
