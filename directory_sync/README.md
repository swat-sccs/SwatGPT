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
| `sync.sh` | gull | `export.sh`, then `scp` to eagle and `npm run import-directory` inside the LibreChat container |
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

## One-time setup on gull

```sh
git clone --filter=blob:none --sparse git@github.com:swat-sccs/SwatGPT.git ~/SwatGPT
git -C ~/SwatGPT sparse-checkout set directory_sync
ssh -o BatchMode=yes aidahxr@130.58.218.151 hostname   # must print "eagle" without a prompt
```

Manual run, which is also the first-time publish after sign-off:

```sh
~/SwatGPT/directory_sync/sync.sh
```

Export only, leaving `out/directory.json` behind for inspection (delete it afterwards, it
contains every student's room):

```sh
~/SwatGPT/directory_sync/export.sh
```

## Schedule

User crontab on gull (`crontab -e`), daily at 06:10:

```cron
10 6 * * * git -C $HOME/SwatGPT pull -q && $HOME/SwatGPT/directory_sync/sync.sh >> $HOME/.local/state/swatgpt-directory-sync.log 2>&1
```

Create the log directory once with `mkdir -p ~/.local/state`. The app refreshes its in-memory
index within a minute when the directory was empty and within 15 minutes otherwise, so no
restart follows a publish.

## Checking it worked

On eagle:

```sh
cd ~/SwatGPT && docker compose exec -T mongodb mongosh --quiet LibreChat \
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

Overrides for `export.sh` and `sync.sh`: `OUT_DIR`, `CYGNET_NETWORK`, `CYGNET_SERVICE`,
`OVERLAY_HOST`, `IMAGE`, `TIMEOUT_S`, `EAGLE`, `EAGLE_REPO`, `REMOTE_FILE`.
