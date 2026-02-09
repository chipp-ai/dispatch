# Kubernetes Deployment Examples

These are example Kubernetes manifests for deploying Dispatch on GKE. They are **not required** -- you can deploy Dispatch however you like (Docker, fly.io, Railway, etc.).

## Usage

1. Replace `YOUR_REGISTRY/dispatch:latest` with your container registry path
2. Replace `YOUR_GCP_PROJECT` with your GCP project ID (if using GKE)
3. Create the required secrets:
   ```bash
   kubectl create secret generic dispatch \
     --from-literal=PG_DATABASE_URL=postgresql://... \
     --from-literal=DISPATCH_PASSWORD=... \
     --from-literal=ANTHROPIC_API_KEY=... \
     --from-literal=GITHUB_TOKEN=...
   ```
4. Apply: `kubectl apply -f charts/`

## Simpler alternatives

For most use cases, `docker-compose.yml` in the project root is sufficient.
