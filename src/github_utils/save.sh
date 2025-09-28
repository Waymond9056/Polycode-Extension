#!/bin/bash

# GitHub Save Script for Polycode Extension
# This script handles saving changes to GitHub with proper error handling

set -e  # Exit on any error

echo "=== Starting GitHub Save Process ==="

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Check if we have changes to commit
if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit"
    exit 0
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Create a temporary branch for saving
TEMP_BRANCH="Saving-$(date +%s)"
echo "Creating temporary branch: $TEMP_BRANCH"

# Stash any uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Stashing uncommitted changes..."
    git stash push -m "Auto-stash before save"
fi

# Create and checkout temporary branch
git checkout -b "$TEMP_BRANCH"

# Apply stashed changes if any
if git stash list | grep -q "Auto-stash before save"; then
    echo "Applying stashed changes..."
    git stash pop
fi

# Add all changes
echo "Adding all changes..."
git add .

# Commit changes
COMMIT_MESSAGE="${1:-Auto-save from Polycode}"
echo "Committing with message: $COMMIT_MESSAGE"
git commit -m "$COMMIT_MESSAGE"

# Switch back to original branch
echo "Switching back to $CURRENT_BRANCH"
git checkout "$CURRENT_BRANCH"

# Merge the temporary branch
echo "Merging temporary branch..."
git merge "$TEMP_BRANCH" --no-ff -m "Merge $TEMP_BRANCH"

# Delete temporary branch
echo "Cleaning up temporary branch..."
git branch -d "$TEMP_BRANCH"

# Push to remote
echo "Pushing to remote..."
git push origin "$CURRENT_BRANCH"

echo "=== GitHub Save Process Completed Successfully ==="
