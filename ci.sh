#!/usr/bin/env bash

set -e

# Build
echo "Build the project..."
docker build  \
    --no-cache \
    -t hip/gateway:latest  .


echo
echo "Built"
echo "hip/gateway:latest"

docker push hip/gateway:latest

echo
echo "Pushed to registry"
echo "hip/gateway:latest"