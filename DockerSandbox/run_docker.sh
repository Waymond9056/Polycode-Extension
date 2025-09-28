#!/bin/sh
# Arguments: [1] - Name of the Docker container
#            [2] - Path to the file to run   
docker run --mount type=bind,source=./src/,target=/app "$1" "$2"