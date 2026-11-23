# Observabilité — Prometheus, Loki, Grafana

```
            ┌──────────── réseau Docker du projet ────────────┐
 server ──► stdout JSON (pino) ──► Alloy ──► Loki ─┐
   └─ :9464/metrics ◄─┐                            ├─► Grafana ◄── nginx (grafana.azasante.com)
 node-exporter :9100 ◄┤                            │   127.0.0.1:3002
 cadvisor      :8080 ◄┼── Prometheus (alertes.yml) ┘
 postgres-exp. :9187 ◄┘
            └──────────────────────────────────────────────────┘
```

| Service | Rôle | Exposé |
|---|---|---|
| `prometheus` | Collecte et stocke les métriques, évalue les règles d'alerte | non |
| `loki` | Stocke les logs (rétention 30 j par défaut) | non |
| `alloy` | Lit les logs de tous les conteneurs compose et les pousse dans Loki | non |
| `grafana` | Tableaux de bord, exploration des logs, alertes | `127.0.0.1:3002` |
| `node-exporter` | CPU, mémoire, disque, réseau du VPS | non |
| `cadvisor` | CPU, mémoire, réseau par conteneur | non |
| `postgres-exporter` | Connexions, transactions, taille de la base | non |

## Démarrage

1. Ajouter dans `.env` :

   ```ini
   # ── Observabilité ──
   GRAFANA_ADMIN_PASSWORD=<mot de passe fort>
   GRAFANA_ROOT_URL=https://grafana.azasante.com   # http://localhost:3002 en local
   GRAFANA_COOKIE_SECURE=true                      # false en local (http)
   # Facultatif :
   # GRAFANA_ADMIN_USER=admin
   # LOKI_RETENTION=720h        # durée de conservation des logs
   # PROMETHEUS_RETENTION=30d   # durée de conservation des métriques
   # LOG_LEVEL=info             # debug | info | warn | error (logs de l'API)
   # POSTGRES_EXPORTER_USER / POSTGRES_EXPORTER_PASSWORD (voir plus bas)
   ```

2. Lancer :

   ```bash
   # Prod (VPS)
   docker compose -f docker-compose.yaml -f docker-compose.observabilite.yaml up -d --build
   # Dev local
   docker compose -f docker-compose.yaml -f docker-compose.dev.yaml -f docker-compose.observabilite.yaml up --build
   ```

3. Exposer Grafana sur le VPS : le bloc `grafana.azasante.com` est dans
   `nginx/reverse-proxy.conf`. Créer l'enregistrement DNS, recharger nginx puis
   `certbot --nginx -d grafana.azasante.com`.
   Sans DNS, passer par un tunnel SSH : `ssh -L 3002:127.0.0.1:3002 <vps>` puis
   ouvrir http://localhost:3002.

4. Dans Grafana, dossier **APS Santé** :
   - **APS Santé — API** : trafic, codes, latence p50/p95/p99 par route, erreurs 4xx/5xx,
     CPU/mémoire/boucle d'événements Node.js, logs d'erreurs et recherche dans les logs ;
   - **APS Santé — Infrastructure** : VPS, conteneurs, PostgreSQL, logs par service.

## Côté API (server/)

- `src/lib/logger.js` : logger `pino`, une ligne JSON par événement. Les `console.*`
  existants y sont redirigés automatiquement (désactivable : `LOG_CONSOLE_NATIF=true`).
- `src/lib/metriques.js` : middleware monté en tête de `index.js`. Il :
  - attribue un `request_id` (renvoyé dans l'en-tête `X-Request-Id`, ajouté à
    toutes les lignes de log écrites pendant la requête) ;
  - mesure `http_request_duration_seconds{method,route,status_code}` et
    `http_requests_in_flight` ;
  - écrit une ligne d'accès (`type: "acces"`) **sans** query string, en-têtes ni corps.
- `/metrics` est servi sur un port interne séparé (`METRICS_PORT`, 9464), jamais
  publié : il n'est donc pas joignable via `api.azasante.com`. `METRICS_ACTIVES=false`
  le coupe.

Retrouver tout le parcours d'une requête dans Grafana → Explore → Loki :

```logql
{service="server"} | request_id="<valeur de X-Request-Id>"
```

Autres requêtes utiles :

```logql
{service="server", level="error"}                         # toutes les erreurs
{service="server"} |= "[scheduler]" | level=~"error|warn"  # échecs des jobs planifiés
{service="server", type="acces"} | json | duration_ms > 2000  # requêtes lentes
```

## Alertes

Les règles sont dans `prometheus/alertes.yml` (API injoignable, 5xx > 5 %, p95 > 2 s,
boucle d'événements, redémarrages, PostgreSQL, disque, mémoire, CPU). Elles sont visibles
dans Grafana → Alerting → Alert rules, mais **aucune notification n'est envoyée** pour
l'instant : il faut soit ajouter un Alertmanager, soit créer un point de contact Grafana
(e-mail via le SMTP existant, webhook…) et recréer les règles en alertes Grafana.

## Données personnelles

Les logs d'une plateforme de santé peuvent contenir des données personnelles
(identifiants, numéros, adresses IP). En conséquence :

- ne jamais journaliser de corps de requête, PIN, mot de passe, jeton ou contenu médical ;
  les clés `password`, `pin`, `token`, `authorization`, `cookie`… sont masquées par
  le logger si un objet en contient ;
- la rétention Loki est courte (30 j) ;
- Grafana n'a ni inscription ni accès anonyme ; donner des comptes nominatifs.

## PostgreSQL : compte de supervision dédié (recommandé)

Par défaut l'exporteur utilise `POSTGRES_USER`. Pour un compte en lecture seule :

```sql
CREATE ROLE supervision WITH LOGIN PASSWORD '<mot de passe>';
GRANT pg_monitor TO supervision;
```

puis `POSTGRES_EXPORTER_USER=supervision` et `POSTGRES_EXPORTER_PASSWORD=...` dans `.env`.

## Limites connues

- **Docker Desktop (Windows)** : node-exporter et cAdvisor mesurent la VM de Docker,
  pas le PC ; cAdvisor peut ne pas démarrer. Ce n'est pas bloquant pour le reste.
- nginx tourne sur l'hôte (hors Docker) : ses logs et métriques ne sont pas collectés.
  À ajouter : `stub_status` + `nginx-prometheus-exporter`, et une source fichier
  `/var/log/nginx/*.log` dans Alloy.
- Jitsi (`jitsi-host/`) tourne dans un autre projet compose : ses conteneurs sont
  quand même vus par Alloy (même démon Docker), mais ses métriques ne sont pas collectées.
