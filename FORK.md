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

## Etwas an upstream anbieten

Private Repos können keine PRs an öffentliche Repos stellen — GitHub erlaubt
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
