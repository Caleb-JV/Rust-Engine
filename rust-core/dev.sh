#!/bin/bash

# 🦀 Rust Development Server with Hot Reload
# Watches Rust files and rebuilds WASM automatically

set -e

# macOS environment setup for Rust compilation
export LIBRARY_PATH="$LIBRARY_PATH:$(xcrun --show-sdk-path)/usr/lib"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🦀 Starting Rust Development Server...${NC}"
echo -e "${YELLOW}📁 Watching: rust-core/src/**/*.rs${NC}"
echo -e "${YELLOW}🎯 Target: WebAssembly (wasm32-unknown-unknown)${NC}"
echo ""

# Function to build WASM
build_wasm() {
    echo -e "${YELLOW}⚡ Rust files changed - rebuilding WASM...${NC}"
    
    # Build WASM with wasm-pack
    if wasm-pack build --target web --out-dir ../client/src/wasm/package --out-name rust_core; then
        echo -e "${GREEN}✅ WASM build successful!${NC}"
        
        # WASM file will be handled by the bundler automatically
        echo -e "${GREEN}📦 WASM file ready for bundler${NC}"
        
        echo -e "${GREEN}🔄 Client will hot-reload automatically${NC}"
    else
        echo -e "${RED}❌ WASM build failed${NC}"
    fi
    echo ""
}

# Initial build
echo -e "${BLUE}🔨 Initial WASM build...${NC}"
build_wasm

# Use fswatch if available, otherwise fallback to simple polling
if command -v fswatch &> /dev/null; then
    echo -e "${GREEN}🔄 Using fswatch for file watching${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    
    # Use fswatch - efficient file system events
    fswatch -o src/ | while read f; do
        build_wasm
    done
else
    echo -e "${BLUE}🔄 Using polling-based file watcher${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""

    # Simple polling fallback
    last_mod_time=$(find src -name "*.rs" -exec stat -f "%m" {} \; | sort -n | tail -1)

    while true; do
        sleep 2
        current_mod_time=$(find src -name "*.rs" -exec stat -f "%m" {} \; | sort -n | tail -1)
        
        if [ "$current_mod_time" != "$last_mod_time" ]; then
            build_wasm
            last_mod_time=$current_mod_time
        fi
    done
fi