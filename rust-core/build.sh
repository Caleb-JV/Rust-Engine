#!/bin/bash
set -e

# Note: macOS linking fix is now set globally in shell profile

echo "🦀 Building Rust WebAssembly module..."

# Ensure we're in the rust-core directory
cd "$(dirname "$0")"

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack is not installed. Installing..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build the WebAssembly module
echo "🔨 Running wasm-pack build..."
# Build optimized WASM
wasm-pack build --target web --out-dir ../client/src/wasm/package --release

echo "✅ WASM build complete! Output saved to ../client/src/wasm"

# List generated files
echo "📦 Generated files:"
ls -la ../client/src/wasm/

echo "🎉 Ready to use in your React application!"