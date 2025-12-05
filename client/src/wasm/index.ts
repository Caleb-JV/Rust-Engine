// WASM Integration Layer with proper package structure
// This provides a unified API for Rust WASM functions with JavaScript fallbacks

// TypeScript interfaces for the data structures
export interface DataStats {
    count: number;
    sum: number;
    mean: number;
    median: number;
    std_dev: number;
    min: number;
    max: number;
}

export interface ProcessResult {
    stats: DataStats;
    processed_data: number[];
    performance_ms: number;
}

export interface FibonacciResult {
    sequence: number[];
    performance_ms: number;
}

// WASM module state
let wasmModule: any = null;
let wasmInitialized = false;

// JavaScript fallback implementations
const jsImplementations = {
    greet: () => {
        console.log('Hello from JavaScript fallback!');
        return 'Hello from JavaScript fallback!';
    },

    add: (a: number, b: number) => {
        return a + b;
    },

    process_csv_data: (csvContent: string) => {
        const startTime = performance.now();
        const numbers: number[] = [];

        // Simple CSV parsing
        for (const line of csvContent.split('\n')) {
            for (const value of line.split(',')) {
                const num = parseFloat(value.trim());
                if (!isNaN(num)) numbers.push(num);
            }
        }

        if (numbers.length === 0) return null;

        const stats = calculateStats(numbers);
        const processed_data = normalizeData(numbers);

        return {
            stats,
            processed_data,
            performance_ms: performance.now() - startTime,
        };
    },

    process_simple_data: (input: string) => {
        const startTime = performance.now();
        const numbers = input
            .split(',')
            .map((s) => parseFloat(s.trim()))
            .filter((n) => !isNaN(n));

        if (numbers.length === 0) return 'No valid numbers found';

        const stats = calculateStats(numbers);
        const processed_data = normalizeData(numbers);

        return {
            stats,
            processed_data,
            performance_ms: performance.now() - startTime,
        };
    },

    calculate_fibonacci: (n: number) => {
        const result = [];
        let a = 0,
            b = 1;

        for (let i = 0; i < n; i++) {
            result.push(a);
            [a, b] = [b, a + b];
        }

        return result;
    },

    calculate_prime_numbers: (limit: number) => {
        const primes: number[] = [];
        const sieve = new Array(limit + 1).fill(true);
        sieve[0] = sieve[1] = false;

        for (let i = 2; i <= limit; i++) {
            if (sieve[i]) {
                primes.push(i);
                for (let j = i * i; j <= limit; j += i) {
                    sieve[j] = false;
                }
            }
        }

        return primes;
    },

    monte_carlo_pi: (iterations: number) => {
        let inside = 0;
        for (let i = 0; i < iterations; i++) {
            const x = Math.random() * 2 - 1;
            const y = Math.random() * 2 - 1;
            if (x * x + y * y <= 1) inside++;
        }
        return (4 * inside) / iterations;
    },

    matrix_multiply_demo: () => {
        const a = [
            [1, 2, 3],
            [4, 5, 6],
        ];
        const b = [
            [7, 8],
            [9, 10],
            [11, 12],
        ];
        const result = [
            [0, 0],
            [0, 0],
        ];

        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                for (let k = 0; k < 3; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }

        return result;
    },
};

// Helper functions for JavaScript implementations
function calculateStats(data: number[]): DataStats {
    const count = data.length;
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const sorted = [...data].sort((a, b) => a - b);
    const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)];

    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
    const std_dev = Math.sqrt(variance);

    return {
        count,
        sum,
        mean,
        median,
        std_dev,
        min: sorted[0],
        max: sorted[sorted.length - 1],
    };
}

function normalizeData(data: number[]): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;

    if (range === 0) return [...data];

    return data.map((val) => (val - min) / range);
}

// Initialize WASM module (with fallback)
export async function initWasm(): Promise<void> {
    if (wasmInitialized) return;

    try {
        // Import WASM module and binary directly through bundler
        const wasmInit = await import('./package/rust_core.js');
        const wasmBinary = await import('./package/rust_core_bg.wasm?url');

        // Initialize the WASM module with the imported binary (using modern object-based API)
        await wasmInit.default({ module_or_path: wasmBinary.default });

        // Store the module for function calls
        wasmModule = wasmInit;
        wasmInitialized = true;
        console.log('✅ WASM module loaded successfully');
    } catch (error) {
        console.warn('⚠️ WASM not available, using JavaScript fallback:', (error as Error).message || error);
        wasmInitialized = true; // Mark as initialized even with fallback
    }
}

// Unified API functions that work with both WASM and JavaScript
export async function wasmGreet(): Promise<string> {
    await initWasm();
    if (wasmModule?.greet) {
        return wasmModule.greet();
    } else {
        return jsImplementations.greet();
    }
}

export async function wasmAdd(a: number, b: number): Promise<number> {
    await initWasm();
    if (wasmModule?.add) {
        return wasmModule.add(a, b);
    } else {
        return jsImplementations.add(a, b);
    }
}

export async function wasmProcessCsvData(csvContent: string): Promise<any> {
    await initWasm();
    if (wasmModule?.process_csv_data) {
        return wasmModule.process_csv_data(csvContent);
    } else {
        return jsImplementations.process_csv_data(csvContent);
    }
}

export async function wasmProcessSimpleData(input: string): Promise<any> {
    await initWasm();
    if (wasmModule?.process_simple_data) {
        return wasmModule.process_simple_data(input);
    } else {
        return jsImplementations.process_simple_data(input);
    }
}

export async function wasmCalculateFibonacci(n: number): Promise<any> {
    await initWasm();
    if (wasmModule?.calculate_fibonacci) {
        return wasmModule.calculate_fibonacci(n);
    } else {
        return jsImplementations.calculate_fibonacci(n);
    }
}

export async function wasmCalculatePrimes(limit: number): Promise<number[]> {
    await initWasm();
    if (wasmModule?.calculate_prime_numbers) {
        return wasmModule.calculate_prime_numbers(limit);
    } else {
        return jsImplementations.calculate_prime_numbers(limit);
    }
}

export async function wasmMonteCarloPI(iterations: number): Promise<number> {
    await initWasm();
    if (wasmModule?.monte_carlo_pi) {
        return wasmModule.monte_carlo_pi(iterations);
    } else {
        return jsImplementations.monte_carlo_pi(iterations);
    }
}

export async function wasmMatrixMultiplyDemo(): Promise<number[][]> {
    await initWasm();
    if (wasmModule?.matrix_multiply_demo) {
        return wasmModule.matrix_multiply_demo();
    } else {
        return jsImplementations.matrix_multiply_demo();
    }
}

// Data Generator functions
export async function generateSampleData(rowCount: number, seed: bigint = 42n): Promise<any> {
    await initWasm();
    if (!wasmModule?.generate_sample_data) {
        throw new Error('WASM module not loaded. Data generator requires WASM.');
    }
    return wasmModule.generate_sample_data(rowCount, seed);
}

export async function generateAndSeedSampleData(rowCount: number, seed: bigint = 42n): Promise<number> {
    await initWasm();
    if (!wasmModule?.generate_and_seed_sample_data) {
        throw new Error('WASM module not loaded. Data generator requires WASM.');
    }
    return wasmModule.generate_and_seed_sample_data(rowCount, seed);
}
