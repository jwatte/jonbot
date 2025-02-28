#!/usr/bin/env bash
set -eu

IMAGE_NAME=jonbot
KUBE_KIND=deployment
KUBE_NAME=jonbot
KUBE_NAMESPACE=jonbot
KUBE_CLUSTER=dev-infra

GCLOUD_PROJECT="dev-infra-422317"
GCLOUD_URL="us-west1-docker.pkg.dev/${GCLOUD_PROJECT}/reve-containers"

gcloud config set project "${GCLOUD_PROJECT}"
gcloud auth configure-docker us-west1-docker.pkg.dev
pnpm build
docker build --platform linux/amd64 -t "${IMAGE_NAME}" . --progress=plain
docker tag "${IMAGE_NAME}:latest" "${GCLOUD_URL}/${IMAGE_NAME}:latest"
TIMESTAMP=$(date '+%Y%m%d%H%M%S')
docker tag "${IMAGE_NAME}:latest" "${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
echo "pushing Docker image (quietly) as ${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
docker push "${GCLOUD_URL}/${IMAGE_NAME}:latest" --quiet
docker push "${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}" --quiet

echo "To deploy to your cluster in GCP, run:"
echo "    kubectl-cluster.sh ${KUBE_CLUSTER} set image -n ${KUBE_NAMESPACE} ${KUBE_KIND}/${KUBE_NAME} ${IMAGE_NAME}=${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
