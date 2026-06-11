#!/usr/bin/env bash
# Exit on error
set -o errexit

# Install Python dependencies
pip install -r requirements.txt

# Create directories
mkdir -p bin/linux

# Download and extract Potrace Linux x86_64 binary
echo "Downloading Potrace binary for Linux..."
curl -k -L -o potrace.tar.gz https://potrace.sourceforge.net/download/1.16/potrace-1.16.linux-x86_64.tar.gz
tar -xzf potrace.tar.gz -C bin/linux --strip-components=1
chmod +x bin/linux/potrace

echo "Build script execution complete."
