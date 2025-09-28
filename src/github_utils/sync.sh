#!/bin/bash

# GitHub Sync Script for Polycode Extension
# This script handles syncing changes from GitHub with proper error handling

set -e  # Exit on any error

echo "=== Starting GitHub Sync Process ==="

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Check if we have uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Warning: You have uncommitted changes. Stashing them..."
    git stash push -m "Auto-stash before sync $(date)"
fi

# Fetch latest changes from remote
echo "Fetching latest changes from remote..."
git fetch origin

# Check if remote branch exists
if ! git show-ref --verify --quiet refs/remotes/origin/"$CURRENT_BRANCH"; then
    echo "Remote branch origin/$CURRENT_BRANCH does not exist. Creating it..."
    git push -u origin "$CURRENT_BRANCH"
    echo "=== Sync Process Completed (New Branch Created) ==="
    exit 0
fi

# Get the commit hash before reset
BEFORE_COMMIT=$(git rev-parse HEAD)
echo "Current commit before sync: $BEFORE_COMMIT"

# Reset to match remote branch
echo "Resetting to match remote branch origin/$CURRENT_BRANCH..."
git reset --hard origin/"$CURRENT_BRANCH"

# Get the commit hash after reset
AFTER_COMMIT=$(git rev-parse HEAD)
echo "Current commit after sync: $AFTER_COMMIT"

# Check if there were any changes
if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
    echo "No new changes to sync"
else
    echo "Successfully synced new changes"
fi

# Try to apply stashed changes if any
if git stash list | grep -q "Auto-stash before sync"; then
    echo "Attempting to apply stashed changes..."
    if git stash pop; then
        echo "Successfully applied stashed changes"
    else
        echo "Warning: Could not apply stashed changes. They are still in stash."
        echo "You can manually apply them with: git stash pop"
    fi
fi

echo "=== GitHub Sync Process Completed Successfully ==="
