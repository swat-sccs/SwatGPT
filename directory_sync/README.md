# Student directory sync

Feeds the "where does `<student>` live" lookup. The app reads the `directoryentries`
collection in MongoDB; this directory produces and publishes the snapshot that fills it.
Nothing here runs automatically until the cron entry below is installed.

**Policy gate:** do not publish the first snapshot until the college has signed off on
answering housing questions to any SCCS login (see `context/launch-todo.md`). Kill switch
once live: `DIRECTORY_LOOKUP_ENABLED=false` in the app's `.env`.

## Pieces

| File | Runs on | Purpose |
|---|---|---|
| `export.mjs` | gull (in a container) | Reads ITS `student_data` and Cygnet's `StudentOverlay`, writes a JSON array |
| `export.sh` | gull | Runs `export.mjs` as a one-shot swarm service on `cygnet_internal` with credentials read from the running `cygnet_cygnet` service; prints the snapshot path |
| `sync.sh` | gull | `export.sh`, then `scp` to eagle, stream the file into the `api` container and run `npm run import-directory` there |
| `../config/import-directory.js` | eagle (app container) | Drops `showProfile: false`, hides dorms for `showDorm: false`, maps ITS dorm codes, replaces the previous snapshot atomically |

Only gull is allowlisted on ITS's database (`130.58.64.142:3306`), gull has no host Node,
and Cygnet's overlay database is reachable only from the non-attachable `cygnet_internal`
overlay network. A swarm service is the one thing that satisfies all three without sudo.

## Snapshot format

```json
[{ "uid": "jdoe1", "firstName": "Jane", "lastName": "Doe", "gradYear": 2027,
   "dorm": "Willets", "room": "214", "showProfile": true, "showDorm": true }]
```

ITS currently stores dorms as display names (`Willets`, `Mertz`); legacy codes such as
`WILLET` are mapped by `dormLabel` either way. The exporter refuses to write a snapshot when
no student has a dorm (ITS blanks the column while reloading housing) and the importer refuses
an empty snapshot, so a bad run never empties the live directory.

The Cygnet overlay is required: it carries each student's `showProfile`/`showDorm` opt-outs.
The exporter fails closed when any `OVERLAY_DB_*` variable is missing, when the overlay query
errors, or when it returns zero rows, rather than exporting everyone as visible. Only an
explicit `1` counts as visible in an overlay flag; students with no overlay row default to
visible, matching Cygnet.

## Running it on gull

`/home/29/aidahxr` is the same NFS home on loon and gull, so the dev checkout at
`~/SwatGPT` is already present on gull; there is nothing to clone. Confirm the app host is
reachable without a prompt:

```sh
ssh -o BatchMode=yes aidahxr@130.58.218.151 hostname   # must print "eagle"
```

Manual run, which is also the first-time publish after sign-off:

```sh
~/SwatGPT/directory_sync/sync.sh
```

Do not run it while a deploy is in progress on eagle (a push to `main` rebuilds and restarts
the app container for about five minutes); the import would land in the old container.

On eagle, `sync.sh` runs `docker compose` from the deploy tree, `/srv/SwatGPT` (override with
`EAGLE_REPO`). The snapshot is written into the container with
`docker compose exec -T api sh -c 'umask 077; cat > /tmp/directory.json'` rather than
`docker compose cp`: `cp` creates the file root-owned and 0600, and the `api` container runs as
the deploy user's uid, so the import would fail with `EACCES`. The copy under `~/.cache` on eagle
and the file inside the container are removed when the remote step exits.

Export only, leaving `out/directory.json` behind for inspection (delete it afterwards, it
contains every student's room and the home directory is shared):

```sh
~/SwatGPT/directory_sync/export.sh
```

## Schedule

User crontab on gull (`crontab -e`), daily at 06:10:

```cron
10 6 * * * $HOME/SwatGPT/directory_sync/sync.sh >> $HOME/.local/state/swatgpt-directory-sync.log 2>&1
```

Create the log directory once with `mkdir -p ~/.local/state`. The scripts run from whatever
is checked out in `~/SwatGPT`, so keep that checkout on `main`. The app refreshes its
in-memory index within a minute when the directory was empty and within 15 minutes
otherwise, so no restart follows a publish.

## Checking it worked

On eagle:

```sh
cd /srv/SwatGPT && docker compose exec -T mongodb mongosh --quiet LibreChat \
  --eval 'db.directoryentries.aggregate([{ $group: { _id: "$snapshot", n: { $sum: 1 } } }])'
docker compose logs api | grep '\[directory\] loaded'
```

Then ask SwatGPT where a consenting student lives.

## Environment for `export.mjs`

| Variable | Source in `export.sh` |
|---|---|
| `ITS_DB_HOST`, `ITS_DB_USER`, `ITS_DB_PASS`, `ITS_DB_NAME` | Cygnet's `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` |
| `OVERLAY_DB_HOST` | `cygnet-db` (service name on `cygnet_internal`) |
| `OVERLAY_DB_USER`, `OVERLAY_DB_PASS`, `OVERLAY_DB_NAME` | Cygnet's `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` |
| `OUTPUT` | Snapshot path, default `./directory.json` |

All `ITS_DB_*` and `OVERLAY_DB_*` variables are required; there is no way to export without
the overlay.

`export.sh` never puts these credentials on the `docker` command line, where any user on gull
could read them from `ps`. It writes them to a `0600` file under `$TMPDIR` (default `/tmp`,
local disk rather than the shared NFS home), passes that with `--env-file`, and deletes it as
soon as the service is created (and on any exit). A missing credential aborts before anything
is written or created.

## Dependencies

`mysql2` is pinned exactly in `package.json` and resolved by the committed
`package-lock.json`. The exporter installs with `npm ci --omit=dev --ignore-scripts`, so a run
that holds the database credentials only ever installs the locked, integrity-checked tree and
runs no install scripts. The `node:24-alpine` image is pinned by digest in `export.sh`. To
upgrade, bump the version in `package.json`, regenerate the lockfile with
`npm install --package-lock-only`, and update the image digest deliberately.

Overrides for `export.sh` and `sync.sh`: `OUT_DIR`, `CYGNET_NETWORK`, `CYGNET_SERVICE`,
`OVERLAY_HOST`, `IMAGE`, `TIMEOUT_S`, `EAGLE`, `EAGLE_REPO`, `REMOTE_FILE`.

## Tests

`export.test.mjs` covers the fail-closed checks and flag parsing with `node:test`. It imports
`export.mjs`, so install dependencies first: `npm ci && node --test export.test.mjs`.

`script.test.mjs` runs `export.sh` against a stub `docker` on `PATH` and checks that no
credential reaches the docker command line, that the env file is private and removed, that a
missing credential aborts, and that the exporter installs from the lockfile. It also runs
`sync.sh` against stub `ssh`/`scp` and checks the deploy-tree default, that the snapshot is
streamed through `exec` rather than `docker compose cp`, and that the exported file is what the
import receives. It needs bash and no dependencies: `node --test script.test.mjs`. `npm test`
runs both.
