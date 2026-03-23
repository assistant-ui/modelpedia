#!/bin/bash

# Clean script for modelpedia monorepo
# Removes all build artifacts and dependencies while preserving .env files

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Check for --force flag to skip confirmation
if [[ "$1" != "--force" && "$1" != "-f" ]]; then
    echo "This will remove all build artifacts, node_modules, and caches."
    echo "Root: $ROOT_DIR"
    echo ""
    read -p "Are you sure? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    echo ""
fi

echo "Cleaning modelpedia monorepo..."
echo "Root: $ROOT_DIR"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for removed items
removed_count=0

remove_dirs() {
    local pattern="$1"

    while IFS= read -r -d '' dir; do
        if [[ -d "$dir" ]]; then
            echo -e "${RED}Removing${NC} $dir"
            rm -rf "$dir"
            ((removed_count++))
        fi
    done < <(find . -type d -name "$pattern" -print0 2>/dev/null)
}

remove_files() {
    local pattern="$1"

    while IFS= read -r -d '' file; do
        if [[ -f "$file" ]]; then
            echo -e "${RED}Removing${NC} $file"
            rm -f "$file"
            ((removed_count++))
        fi
    done < <(find . -type f -name "$pattern" -print0 2>/dev/null)
}

echo -e "${YELLOW}=== Removing node_modules ===${NC}"
remove_dirs "node_modules"

echo ""
echo -e "${YELLOW}=== Removing build outputs ===${NC}"
remove_dirs "dist"
remove_dirs ".next"
remove_dirs ".output"
remove_dirs "out"
remove_dirs "build"

echo ""
echo -e "${YELLOW}=== Removing cache directories ===${NC}"
remove_dirs ".turbo"
remove_dirs ".vercel"
remove_dirs ".cache"

echo ""
echo -e "${YELLOW}=== Removing generated/cache files ===${NC}"
remove_files "next-env.d.ts"
remove_files "tsconfig.tsbuildinfo"
remove_files ".pnpm-debug.log*"
remove_files "npm-debug.log*"
remove_files ".DS_Store"

echo ""
echo -e "${GREEN}=== Clean complete ===${NC}"
echo -e "Removed ${removed_count} items"
echo ""
echo -e "${YELLOW}Note:${NC} .env files have been preserved"
echo -e "Run ${GREEN}pnpm install${NC} to restore dependencies"
echo -e "Run ${GREEN}pnpm build${NC} to rebuild packages"
