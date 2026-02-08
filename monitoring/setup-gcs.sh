#!/usr/bin/env bash
# One-time setup: GCS bucket + service account for Loki log storage
# Run this once before deploy.sh
set -euo pipefail

PROJECT_ID="chippai-398019"
REGION="us-central1"
BUCKET_NAME="${PROJECT_ID}-loki-logs"
SA_NAME="loki-gcs"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
K8S_NAMESPACE="monitoring"
K8S_SECRET_NAME="loki-gcs-credentials"
KEY_FILE="/tmp/loki-gcs-key.json"

echo "=== Loki GCS Setup ==="
echo "Project:  ${PROJECT_ID}"
echo "Bucket:   ${BUCKET_NAME}"
echo "SA:       ${SA_EMAIL}"
echo ""

# 1. Create GCS bucket with 30-day lifecycle
echo "[1/5] Creating GCS bucket..."
if gsutil ls -b "gs://${BUCKET_NAME}" &>/dev/null; then
  echo "  Bucket already exists, skipping."
else
  gsutil mb -p "${PROJECT_ID}" -l "${REGION}" -b on "gs://${BUCKET_NAME}"
  echo "  Created gs://${BUCKET_NAME}"
fi

echo "[2/5] Setting 30-day lifecycle policy..."
cat > /tmp/loki-lifecycle.json <<'EOF'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 30 }
    }
  ]
}
EOF
gsutil lifecycle set /tmp/loki-lifecycle.json "gs://${BUCKET_NAME}"
rm /tmp/loki-lifecycle.json
echo "  Lifecycle set: objects deleted after 30 days."

# 2. Create service account
echo "[3/5] Creating service account..."
if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "  Service account already exists, skipping."
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="Loki GCS access"
  echo "  Created ${SA_EMAIL}"
fi

# 3. Grant bucket access
echo "[4/5] Granting storage.objectAdmin on bucket..."
gsutil iam ch "serviceAccount:${SA_EMAIL}:roles/storage.objectAdmin" "gs://${BUCKET_NAME}"
echo "  Granted."

# 4. Create key and k8s secret
echo "[5/5] Creating k8s secret..."
kubectl create namespace "${K8S_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

gcloud iam service-accounts keys create "${KEY_FILE}" \
  --iam-account="${SA_EMAIL}" \
  --project="${PROJECT_ID}"

kubectl create secret generic "${K8S_SECRET_NAME}" \
  --namespace="${K8S_NAMESPACE}" \
  --from-file=gcs-key.json="${KEY_FILE}" \
  --dry-run=client -o yaml | kubectl apply -f -

rm -f "${KEY_FILE}"
echo "  Secret ${K8S_SECRET_NAME} created in ${K8S_NAMESPACE} namespace."

echo ""
echo "=== Done ==="
echo "Next: run ./deploy.sh"
