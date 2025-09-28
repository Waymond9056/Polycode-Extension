#!/bin/sh

# Entrypoint script for multi-language code execution container
# Arguments: [1] - Path to the file to run


# Check if the file exists
if [ ! -f "$1" ]; then
    echo "File not found: $1"
    echo "Available files in /app:"
    find /app -type f \( -name "*.py" -o -name "*.java" -o -name "*.ts" -o -name "*.js" \) 2>/dev/null || echo "No supported files found in /app"
    exit 1
fi

# Get file extension
FILE_EXT="${1##*.}"
FILE_NAME="${1%.*}"

echo "File: $1"
echo "Extension: $FILE_EXT"
echo "----------------------------------------"

# Execute based on file extension
case "$FILE_EXT" in
    "java")
        echo "Compiling Java file..."
        javac "$1"
        if [ $? -eq 0 ]; then
            echo "Running compiled Java file..."
            java "$FILE_NAME"
        else
            echo "Java compilation failed!"
            exit 1
        fi
        ;;
    "py")
        echo "Running Python file..."
        python3 "$1"
        ;;
    *)
        echo "Unsupported file type: $FILE_EXT"
        echo "Supported types: .py, .java, .ts, .js"
        exit 1
        ;;
esac
