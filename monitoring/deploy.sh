#!/usr/bin/env bash
# Deploy Loki + Promtail + Grafana to the monitoring namespace
#
# Usage:
#   ./deploy.sh              # Uses 1Password for secrets (requires op CLI)
#   ./deploy.sh --skip-secrets  # Skip secret creation (use existing secrets)
#
# Prerequisite: run setup-gcs.sh once first
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="monitoring"
SKIP_SECRETS=false
OP_VAULT="chipp-deno"
OP_ITEM="grafana-monitoring"
OP_ALERTING_ITEM="grafana-alerting"

for arg in "$@"; do
  case $arg in
    --skip-secrets) SKIP_SECRETS=true ;;
  esac
done

echo "=== Monitoring Stack Deploy ==="

# 1. Namespace
echo "[1/8] Creating namespace..."
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

# 2. Helm repos
echo "[2/8] Adding Helm repos..."
helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
helm repo update grafana

# 3. Loki
echo "[3/8] Installing Loki..."
helm upgrade --install loki grafana/loki \
  --namespace "${NAMESPACE}" \
  --values "${SCRIPT_DIR}/loki/values.yaml" \
  --wait --timeout 10m

# 4. Promtail
echo "[4/8] Installing Promtail..."
helm upgrade --install promtail grafana/promtail \
  --namespace "${NAMESPACE}" \
  --values "${SCRIPT_DIR}/promtail/values.yaml" \
  --wait --timeout 10m

# 5. Grafana secrets from 1Password
echo "[5/8] Deploying Grafana secrets..."
if [ "$SKIP_SECRETS" = true ]; then
  echo "  Skipping secrets (--skip-secrets flag)."
elif ! kubectl get secret grafana-secrets -n "${NAMESPACE}" &>/dev/null; then
  # Check if op CLI is available
  if command -v op &>/dev/null && op whoami &>/dev/null 2>&1; then
    echo "  Pulling secrets from 1Password (vault: ${OP_VAULT}, item: ${OP_ITEM})..."
    python3 "${SCRIPT_DIR}/../scripts/op_to_yaml.py" "${OP_VAULT}" "${OP_ITEM}" grafana-secrets \
      | kubectl apply -n "${NAMESPACE}" -f -
    echo "  Secrets applied from 1Password."
  else
    echo "  WARNING: 1Password CLI not available. Creating placeholder secrets."
    echo "  Add an item '${OP_ITEM}' to vault '${OP_VAULT}' with these CONCEALED fields:"
    echo "    admin-user, admin-password, google-client-id, google-client-secret"
    kubectl create secret generic grafana-secrets \
      --namespace "${NAMESPACE}" \
      --from-literal=admin-user=admin \
      --from-literal=admin-password="$(openssl rand -base64 24)" \
      --from-literal=google-client-id=REPLACE_ME \
      --from-literal=google-client-secret=REPLACE_ME
  fi
else
  echo "  grafana-secrets already exists. To update, delete it first or use 1Password:"
  echo "    kubectl delete secret grafana-secrets -n ${NAMESPACE}"
  echo "    ./deploy.sh"
fi

# 5b. Alerting secrets (webhook URL + API key for Chipp Issues)
echo "[5b/8] Deploying alerting secrets..."
if [ "$SKIP_SECRETS" = true ]; then
  echo "  Skipping alerting secrets (--skip-secrets flag)."
elif ! kubectl get secret grafana-alerting-secrets -n "${NAMESPACE}" &>/dev/null; then
  if command -v op &>/dev/null && op whoami &>/dev/null 2>&1; then
    echo "  Pulling alerting secrets from 1Password (vault: ${OP_VAULT}, item: ${OP_ALERTING_ITEM})..."
    # Read fields from 1Password and create k8s secret with env-var-friendly keys
    WEBHOOK_URL=$(op read "op://${OP_VAULT}/${OP_ALERTING_ITEM}/webhook-url" 2>/dev/null || echo "REPLACE_ME")
    API_KEY=$(op read "op://${OP_VAULT}/${OP_ALERTING_ITEM}/api-key" 2>/dev/null || echo "REPLACE_ME")
    kubectl create secret generic grafana-alerting-secrets \
      --namespace "${NAMESPACE}" \
      --from-literal=CHIPP_ISSUES_WEBHOOK_URL="${WEBHOOK_URL}" \
      --from-literal=CHIPP_ISSUES_API_KEY="${API_KEY}" \
      --dry-run=client -o yaml | kubectl apply -f -
    echo "  Alerting secrets applied from 1Password."
  else
    echo "  WARNING: 1Password CLI not available. Creating placeholder alerting secrets."
    echo "  Add an item '${OP_ALERTING_ITEM}' to vault '${OP_VAULT}' with these CONCEALED fields:"
    echo "    webhook-url, api-key"
    kubectl create secret generic grafana-alerting-secrets \
      --namespace "${NAMESPACE}" \
      --from-literal=CHIPP_ISSUES_WEBHOOK_URL=REPLACE_ME \
      --from-literal=CHIPP_ISSUES_API_KEY=REPLACE_ME
  fi
else
  echo "  grafana-alerting-secrets already exists. To update:"
  echo "    kubectl delete secret grafana-alerting-secrets -n ${NAMESPACE}"
  echo "    ./deploy.sh"
fi

# 6. Dashboard ConfigMaps
echo "[6/8] Creating dashboard ConfigMaps..."
for dashboard in "${SCRIPT_DIR}/grafana/dashboards/"*.json; do
  name="grafana-dashboard-$(basename "${dashboard}" .json)"
  kubectl create configmap "${name}" \
    --namespace "${NAMESPACE}" \
    --from-file="$(basename "${dashboard}")=${dashboard}" \
    --dry-run=client -o yaml | \
    kubectl label --local -f - grafana_dashboard=1 -o yaml | \
    kubectl apply -f -
  echo "  Applied ${name}"
done

# 7. Grafana
echo "[7/8] Installing Grafana..."
helm upgrade --install grafana grafana/grafana \
  --namespace "${NAMESPACE}" \
  --values "${SCRIPT_DIR}/grafana/values.yaml" \
  --wait --timeout 10m

# 8. ManagedCertificate for TLS
echo "[8/8] Applying ManagedCertificate..."
kubectl apply -f - <<'EOF'
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: grafana-tls
  namespace: monitoring
spec:
  domains:
    - grafana.chipp.ai
EOF

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "Verification:"
echo "  kubectl get pods -n ${NAMESPACE}"
echo "  kubectl port-forward -n ${NAMESPACE} svc/grafana 3000:80"
echo "  open http://localhost:3000"
echo ""
echo "Admin password:"
echo "  kubectl get secret grafana-secrets -n ${NAMESPACE} -o jsonpath='{.data.admin-password}' | base64 -d"
echo ""
echo "Alerting:"
echo "  Grafana unified alerting is enabled with 2 alert rules:"
echo "    - NewErrorCategory: 3+ events for any (source, feature, msg) in 15 min"
echo "    - ErrorSpike: 50+ total errors in 5 min"
echo "  Alerts webhook to Chipp Issues at CHIPP_ISSUES_WEBHOOK_URL/api/loki/webhook"
