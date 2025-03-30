#!/usr/bin/env bash
set -eu

IMAGE_NAME=jonbot
KUBE_KIND=statefulset
KUBE_NAME=jonbot
KUBE_NAMESPACE=jonbot
KUBE_CLUSTER=dev-infra-2

GCLOUD_PROJECT="dev-infra-422317"
GCLOUD_URL="us-west1-docker.pkg.dev/${GCLOUD_PROJECT}/reve-containers"

# Check if Docker BuildKit is enabled
if [[ -z "${DOCKER_BUILDKIT:-}" ]]; then
    export DOCKER_BUILDKIT=1
fi

echo "Setting up GCloud authentication..."
gcloud config set project "${GCLOUD_PROJECT}"
gcloud auth configure-docker us-west1-docker.pkg.dev

# Build the TypeScript code
echo "Building application code..."
pnpm build

# Make sure the script is executable
chmod +x entrypoint.sh

# Determine host architecture
HOST_ARCH=$(uname -m)
echo "Host architecture: ${HOST_ARCH}"

# For M1/M2/M3 Mac (arm64), we need to use buildx for cross-platform build
if [[ "${HOST_ARCH}" == "arm64" ]]; then
    echo "Detected arm64 architecture, using Docker buildx for cross-platform build"
    
    # Check if buildx is available
    if ! docker buildx version &>/dev/null; then
        echo "Docker buildx is not available. Please install it first."
        echo "See: https://docs.docker.com/buildx/working-with-buildx/"
        exit 1
    fi
    
    # Check if we have the right builder
    if ! docker buildx ls | grep -q "linux/amd64"; then
        echo "Setting up new buildx builder with amd64 support..."
        docker buildx create --name amd64builder --use
    fi
    
    # Generate timestamp for image tag
    TIMESTAMP=$(date '+%Y%m%d%H%M%S')
    
    echo "Building multi-platform image using buildx..."
    docker buildx build \
        --platform linux/amd64 \
        --tag "${GCLOUD_URL}/${IMAGE_NAME}:latest" \
        --tag "${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}" \
        --push \
        . --progress=plain
    
    echo "Image successfully built and pushed as ${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
else
    # Traditional approach for amd64 hosts
    echo "Building image for linux/amd64..."
    docker build --platform linux/amd64 -t "${IMAGE_NAME}" . --progress=plain
    
    # Tag and push the image
    TIMESTAMP=$(date '+%Y%m%d%H%M%S')
    docker tag "${IMAGE_NAME}:latest" "${GCLOUD_URL}/${IMAGE_NAME}:latest"
    docker tag "${IMAGE_NAME}:latest" "${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
    
    echo "Pushing Docker image as ${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
    docker push "${GCLOUD_URL}/${IMAGE_NAME}:latest" --quiet
    docker push "${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}" --quiet
fi

echo "To deploy to your cluster in GCP, run:"
echo "    kubectl-cluster.sh ${KUBE_CLUSTER} set image -n ${KUBE_NAMESPACE} ${KUBE_KIND}/${KUBE_NAME} ${IMAGE_NAME}=${GCLOUD_URL}/${IMAGE_NAME}:${TIMESTAMP}"
