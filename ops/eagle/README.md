# eagle host configuration

Files here are applied to `eagle` (the SwatGPT app/DB VM, `130.58.218.151`) by hand. Nothing
in this directory runs automatically, and the deploy workflow never touches it. Production
changes on eagle are planned and approved first; run these steps over ssh with sudo.

| File | Installs to | Purpose |
|---|---|---|
| `actions-runner.override.conf` | `/etc/systemd/system/actions.runner.swat-sccs-SwatGPT.eagle.service.d/override.conf` | Start the deploy runner only after the network and SSSD are up, and restart it if it dies |
| `../../monitoring/eagle-harden.sh` | run in place | `AUDIT_LOG_FAIL_CLOSED=true`, DOCKER-USER firewall for published ports |

## 1. GitHub Actions runner drop-in

The runner (`actions.runner.swat-sccs-SwatGPT.eagle`) runs as `aidahxr`, an SSSD account.
Without ordering on `sssd.service` and `nss-user-lookup.target`, a reboot can start the unit
before the user resolves; it fails once and stays dead, and every push to `main` then sits
queued with no error on the eagle side.

```sh
UNIT=actions.runner.swat-sccs-SwatGPT.eagle.service
systemctl cat "$UNIT" >/dev/null                      # confirm the unit name first
sudo install -D -m 644 ops/eagle/actions-runner.override.conf \
  "/etc/systemd/system/$UNIT.d/override.conf"
sudo systemctl daemon-reload
systemctl show "$UNIT" -p After -p Restart -p RestartUSec   # expect sssd.service, on-failure, 30s
sudo systemctl restart "$UNIT"                         # only between deploys: it cancels a running job
systemctl is-active "$UNIT"
```

The drop-in only adds settings; the unit file written by the runner's `svc.sh install` stays
as is, so re-registering the runner does not undo it. To roll back, delete the drop-in and
`daemon-reload`.

## 2. Lock down the deploy tree's `.env`

`/srv/SwatGPT/.env` holds every secret (OpenID client secret, JWT secrets, `METRICS_SECRET`,
`MEILI_MASTER_KEY`, `SWATGPT_POSTGRES_PASSWORD`, `ADMIN_PANEL_SESSION_SECRET`). It is gitignored,
so `git reset --hard` in the deploy workflow never resets its mode; set it once:

```sh
cd /srv/SwatGPT
stat -c '%U:%G %a' .env                  # note the owner: it must be the user compose runs as
sudo chown "$(stat -c %U .)": .env
sudo chmod 600 .env
stat -c '%U:%G %a' .env                  # <runner user>:<group> 600
```

Why the owner matters:

- `docker compose` (run by the Actions runner as the deploy tree's owner) reads `.env` for
  interpolation, so that user must be able to read it.
- The `api` container runs as `${UID}:${GID}` and reads the bind-mounted `/app/.env` at
  startup. `UID`/`GID` in `.env` must equal the file owner's ids, or LibreChat starts without
  its configuration. Check with `id -u "$(stat -c %U .env)"` against `grep '^UID=' .env`.

Verify the app still reads it, then that nobody else can:

```sh
docker compose up -d --force-recreate --no-deps api
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3080/readyz     # 200 after ~60 s
sudo -u nobody cat .env                                                   # Permission denied
```

Editing `.env` later: use an editor or `>>` so the mode is kept. Tools that replace the file
(`sed -i`, some editors' atomic save) also create a new inode, which a running container's file
bind mount does not see; recreate the `api` container afterwards in that case.

## 3. Firewall and audit flag

Run `sudo ./monitoring/eagle-harden.sh` from the deploy tree (see the header of that script and
`monitoring/README.md` A.4). It is idempotent and safe to re-run after changing the port list.
It force-recreates the `api` container, so run it between deploys.
