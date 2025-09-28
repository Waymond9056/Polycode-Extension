#!/bin/sh
# Arguments: [1] - Name of the Docker container

cd "$(dirname "${BASH_SOURCE[0]}")"
docker build -t "$1" .