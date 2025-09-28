FROM alpine:latest
# Install Java JDK for source code compilation
RUN apk add --no-cache openjdk11

# Install Python and pip
RUN apk add --no-cache python3 py3-pip

# Create a working directory for mounted code
WORKDIR /app

# Create a simple entrypoint script
COPY entrypoint2.sh /entrypoint2.sh
RUN chmod +x /entrypoint2.sh

# Set the entrypoint
ENTRYPOINT ["/entrypoint2.sh"]
