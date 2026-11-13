# askguenther — privater Saale-Fork

Upstream: [Blumlaut/saale](https://github.com/Blumlaut/saale). Hier liegen nur
Änderungen, die nicht upstream gehören (Branding). Alles andere kommt von oben.

## Remotes

```
origin    https://github.com/Juli04/askguenther   (privat)
upstream  https://github.com/Blumlaut/saale
```

## Branches

| Branch | Zweck |
| --- | --- |
| `main` | Spiegel von `upstream/main`. **Nie drauf committen**, nur fast-forward. |
| `custom` | Deine Änderungen. Wird gebaut und ausgeliefert. |

## Upstream-Update

```bash
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main
git checkout custom && git rebase main
git push origin custom --force-with-lease   # Force, weil rebased
```

Der Push löst `.github/workflows/build.yml` aus. Nach ~20–30 Minuten liegen drei
Images in GHCR, getaggt mit `custom-<app-version>-<sha>`:

```
ghcr.io/juli04/askguenther:custom-2026.11.8-a1b2c3d
ghcr.io/juli04/askguenther-worker:custom-2026.11.8-a1b2c3d
ghcr.io/juli04/askguenther-sandbox:custom-2026.11.8-a1b2c3d
```

## Ausrollen

Auf dem Server (Compose-Override setzt `image:` auf die Fork-Images):

```bash
cd /home/agent/saale
# FORK_TAG in .env auf den neuen Tag setzen
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml pull
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d
```

Rollback ist derselbe Befehl mit dem alten Tag.

## Private Registry

Das Repo ist privat, also sind es die Packages auch. Der Server braucht einmalig
einen Token mit `read:packages`:

```bash
echo "$TOKEN" | docker login ghcr.io -u Juli04 --password-stdin
```

## Automatik

Zwei Teile, die zusammenspielen:

**1. `update.yml` — täglich 05:41 UTC (nach dem Upstream-Release)**

- `custom` liegt schon auf `upstream/main` → nichts passiert.
- Rebase sauber → `custom` wird gepusht und der Build gestartet.
- Rebase konfliktet → **nichts wird gepusht**, ein Issue mit den Dateien und
  Reproduktionsbefehlen wird angelegt (Label `update`). Kein Autofix: der
  Branch wird ausgerollt, eine falsche Auflösung ginge also direkt nach
  Produktion.

**2. `saale-autodeploy.timer` — alle 15 Minuten auf dem Server**

- Fragt GHCR nach dem neuesten `custom-*`-Tag (Token: `/root/.secrets/ghcr.token`).
- Neu → DB-Dump nach `/home/agent/backups/` (die letzten fünf bleiben),
  Images ziehen, `FORK_TAG` setzen, `up -d`.
- Danach Health-Check (`saale-web` healthy + HTTP 307 auf `127.0.0.1:3630`).
- Schlägt das fehl → automatischer Rückroll auf den vorherigen Tag.
- Verlauf: `journalctl -u saale-autodeploy.service`, dazu
  `/var/lib/saale-autodeploy/history.log`.

Manuell bleibt alles möglich: `FORK_TAG` setzen und
`docker compose -f docker-compose.prod.yml -f docker-compose.override.yml -f docker-compose.fork.yml up -d`.
Der Timer sieht den Unterschied und tut nichts, wenn der Tag stimmt.

**Konflikt auflösen** (der einzige Fall, der einen Menschen braucht):

```bash
git fetch upstream
git checkout custom && git rebase upstream/main
# Konflikte lösen, Tests laufen lassen
pnpm exec tsc --noEmit && pnpm exec vitest run
git push --force-with-lease origin custom   # startet den Build
```



## Etwas an upstream anbieten

Private Repos können keine PRs an öffentliche Repos stellen - GitHub erlaubt
keine privaten Forks. Deshalb zweigt man die öffentliche Änderung von
`upstream/main` ab und pusht sie in ein *öffentliches* Repo (Fork oder eigenes):

```bash
git fetch upstream
git checkout -b feat/xyz upstream/main
git cherry-pick <sha> [<sha>…]
git push <public-remote> feat/xyz
gh pr create --repo Blumlaut/saale --head <dein-account>:feat/xyz
```

Damit das sauber bleibt: private Commits dürfen nie Voraussetzung für einen
öffentlichen sein, und Branding-Commits bleiben getrennt von Feature-Commits.

## Was wohin gehört

- **Upstream:** Features, Bugfixes, generische Verbesserungen.
- **Fork:** Branding (Theme, Wortmarke, Texte), Instanz-spezifisches.
- **Server (`.env`/Override):** Zugangsdaten, Domains, Ports — nichts davon im Repo.
