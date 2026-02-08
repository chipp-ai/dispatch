# Monitoring Stack

Loki + Promtail + Grafana on GKE. Persists and queries all application logs from pod stdout.

## Architecture

```
Pod stdout --> Promtail (DaemonSet) --> Loki (monolithic) --> GCS bucket
                                             |
                                        Grafana --> Dashboards + Alerts
```

- **Promtail** DaemonSet scrapes `/var/log/pods/` on every node
- **Loki** single-binary mode, stores chunks in GCS, 30-day retention
- **Grafana** with Google OAuth at `grafana.chipp.ai`
- Everything in `monitoring` namespace

## Prerequisites

1. `gcloud` CLI authenticated with `chippai-398019` project
2. `kubectl` pointed at the `production` cluster
3. `helm` v3+ installed
4. DNS: `grafana.chipp.ai` A record pointing at the GKE ingress IP (Cloudflare DNS-only, no proxy)
5. Google OAuth app created in GCP Console with redirect URI `https://grafana.chipp.ai/login/google`

## Secrets (1Password)

Grafana secrets are managed through 1Password, same pattern as the main app.

### `grafana-monitoring` item

Create an item called `grafana-monitoring` in the `chipp-deno` vault with these **CONCEALED** fields:

| Field | Description |
|-------|-------------|
| `admin-user` | Grafana admin username (e.g. `admin`) |
| `admin-password` | Grafana admin password |
| `google-client-id` | Google OAuth 2.0 client ID |
| `google-client-secret` | Google OAuth 2.0 client secret |

The deploy script and CI workflow both pull from this 1Password item using `scripts/op_to_yaml.py`.

### `grafana-alerting` item

Create an item called `grafana-alerting` in the `chipp-deno` vault with these **CONCEALED** fields:

| Field | Description |
|-------|-------------|
| `webhook-url` | Chipp Issues base URL (e.g. `https://chipp-issues.yourhost`) |
| `api-key` | Bearer token for authenticating to Chipp Issues webhook endpoint |

These are injected as environment variables (`CHIPP_ISSUES_WEBHOOK_URL`, `CHIPP_ISSUES_API_KEY`) into the Grafana pod via the `grafana-alerting-secrets` k8s secret. Grafana's provisioning system substitutes them into the webhook contact point configuration at startup.

## Setup

```bash
# One-time: create GCS bucket, service account, k8s secret
./setup-gcs.sh

# Deploy everything (pulls secrets from 1Password)
./deploy.sh

# Or skip secrets if they already exist in k8s
./deploy.sh --skip-secrets
```

## CI/CD

The workflow at `.github/workflows/monitoring.yml` auto-deploys when files in `monitoring/` change on the `staging` branch. It can also be triggered manually via `workflow_dispatch`.

The workflow:
1. Authenticates to GKE via Workload Identity
2. Pulls secrets from 1Password
3. Runs `deploy.sh --skip-secrets` (secrets handled in step 2)
4. Verifies pod health
5. Notifies Slack

## Accessing Grafana

**Production:** https://grafana.chipp.ai (after DNS + OAuth setup)

**Local port-forward:**
```bash
kubectl port-forward -n monitoring svc/grafana 3000:80
open http://localhost:3000
```

**Admin password:**
```bash
kubectl get secret grafana-secrets -n monitoring -o jsonpath='{.data.admin-password}' | base64 -d
```

## Alerting

Grafana unified alerting sends error alerts to Chipp Issues via webhook for autonomous investigation.

### Alert Rules

| Rule | Query | Threshold | Severity |
|------|-------|-----------|----------|
| New Error Category | `count by (source, feature, msg) (count_over_time({app="chipp-deno", level="error"} \| json [15m]))` | > 3 events | warning |
| Error Spike | `sum(count_over_time({app="chipp-deno", level="error"} [5m]))` | > 50 events | critical |

### Notification Policy

- **Group by:** `alertname`, `source`, `feature`
- **Group wait:** 5 minutes (let events accumulate before first send)
- **Group interval:** 1 hour (don't re-send same group within 1h)
- **Repeat interval:** 24 hours (don't repeat same alert within 24h)

### Webhook Payload

Grafana sends to `${CHIPP_ISSUES_WEBHOOK_URL}/api/loki/webhook` with a Bearer token. The payload includes `alerts[]` with `labels` (alertname, source, feature, severity) and `annotations` (summary, description, error_count).

### Configuration

All alerting config is provisioned via the `alerting` key in `grafana/values.yaml`:
- Contact points, notification policies, and alert rules are defined inline
- Secrets (`CHIPP_ISSUES_WEBHOOK_URL`, `CHIPP_ISSUES_API_KEY`) are injected as env vars from the `grafana-alerting-secrets` k8s secret
- Grafana substitutes `${ENV_VAR}` references in provisioning files at startup

### Troubleshooting Alerts

```bash
# Check alert rules are loaded
kubectl port-forward -n monitoring svc/grafana 3000:80
# Then visit http://localhost:3000/alerting/list

# Check Grafana logs for provisioning errors
kubectl logs -n monitoring -l app.kubernetes.io/name=grafana --tail=100 | grep -i alert

# Verify alerting secrets exist
kubectl get secret grafana-alerting-secrets -n monitoring
```

## Dashboards

| Dashboard | Purpose |
|-----------|---------|
| Error Overview | Sentry replacement -- error rates, top errors by source/feature, errors by version |
| Feature Adoption | Source/feature usage heatmaps, integration channel activity, agent loops |
| Billing Health | Webhook events, payment failures, disputes, credit exhaustion, churn |

Dashboards are provisioned from ConfigMaps. To add a new one:

1. Create JSON in `grafana/dashboards/`
2. Run `./deploy.sh` (step 6 applies ConfigMaps)
3. Grafana's sidecar picks it up automatically

## LogQL Reference

### Basic queries

```logql
# All app logs
{app="chipp-deno"} | json

# Errors only
{app="chipp-deno", level="error"} | json

# Specific source
{app="chipp-deno"} | json | source="billing"

# Source + feature
{app="chipp-deno", level="error"} | json | source="billing" | feature="auto-topup"

# Regex match on source
{app="chipp-deno"} | json | source=~"whatsapp.*|slack.*|email.*"
```

### Aggregations

```logql
# Error rate per minute
sum(count_over_time({app="chipp-deno", level="error"} [1m]))

# Errors by source (top 10)
topk(10, sum by (source) (count_over_time({app="chipp-deno", level="error"} | json [1h])))

# Top error messages
topk(10, sum by (msg) (count_over_time({app="chipp-deno", level="error"} | json [1h])))

# Log volume by level
sum by (level) (count_over_time({app="chipp-deno"} [5m]))
```

### Filtering by entity

```logql
# Logs for a specific org
{app="chipp-deno"} | json | orgId="org_abc123"

# Logs for a specific app
{app="chipp-deno"} | json | applicationId="app_xyz789"

# Logs for a specific user
{app="chipp-deno"} | json | userId="user_456"
```

### Useful patterns

```logql
# Catch bad deploys: errors spiking for a new version
sum by (version) (count_over_time({app="chipp-deno", level="error"} | json [5m]))

# Webhook processing time (if logged)
{app="chipp-deno"} | json | source="stripe-webhook" | feature="event-routing"

# All billing activity
{app="chipp-deno"} | json | source=~"billing|stripe-webhook|consumer-billing"
```

## Label Strategy

**Stream labels** (indexed, low cardinality):
- `app` -- `chipp-deno` (from k8s pod label)
- `namespace`, `pod`, `container` -- from k8s metadata
- `level` -- extracted by Promtail (4 values: debug/info/warn/error)

**Extracted at query time** via `| json` (high cardinality, NOT stream labels):
- `source`, `feature`, `msg`, `version`, `env`, `pod`, entity IDs

This keeps Loki's index small while still allowing full-text search on any JSON field.

## Sentry Migration

**Phase A (current):** Both Loki and Sentry receive data. Promtail reads stdout, Sentry gets error/warn via `sendToSentry()` in `lib/logger.ts`.

**Phase B:** Once Grafana alerting is proven, gate `sendToSentry()` behind a flag or remove it.

**Phase C:** Remove `@sentry/deno` dependency entirely.

## Troubleshooting

```bash
# Check all pods are running
kubectl get pods -n monitoring

# Promtail scraping correctly?
kubectl logs -n monitoring -l app.kubernetes.io/name=promtail --tail=50

# Loki receiving data?
kubectl logs -n monitoring -l app.kubernetes.io/name=loki --tail=50

# Test query via Loki API
kubectl port-forward -n monitoring svc/loki-gateway 3100:80
curl -s 'http://localhost:3100/loki/api/v1/query?query={app="chipp-deno"}' | jq .status
```

## Cost

- GCS: ~$0.60/month (1GB/day, 30-day retention)
- Loki pod: ~$5-10/month
- Promtail: negligible (64-128Mi per node)
- Grafana: ~$3-5/month
- **Total: ~$10-20/month** (vs Sentry Team plan at $26+/month)
