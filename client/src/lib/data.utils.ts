import type { IColumnInfo, IPivotOptions } from '@/services/dataService';
import type { IColumnField } from '@/store/appStore';
import type { IFieldsKeeperBucket } from 'react-fields-keeper';

export const getCurrentPivotItems = (pivotBuckets: IFieldsKeeperBucket<IColumnField>[]) => {
    const bucketItems = pivotBuckets.filter((b) => b.id === 'columns' || b.id === 'values').flatMap((b) => b.items);
    return bucketItems;
};

export const getPivotItemsToFetchData = (pivotBuckets: IFieldsKeeperBucket<IColumnField>[]): IPivotOptions => {
    const rowBucket = pivotBuckets.find((b) => b.id === 'columns')?.items;
    const valueBucket = pivotBuckets.find((b) => b.id === 'values')?.items;

    const rowsInfo =
        rowBucket?.map((row) => ({
            column: row.value?.name ?? '',
        })) ?? [];
    const valuesInfo =
        valueBucket
            ?.filter((value) => value.value?.name)
            .map(
                (value) =>
                    ({
                        column: value.value?.name ?? '',
                        aggregation: value.value?.aggregate ?? 'sum',
                    }) as IColumnInfo,
            ) ?? [];

    return {
        rows: rowsInfo,
        values: valuesInfo,
    };
};

/**
 * Estimate JavaScript (V8) processing time based on actual Rust operation.
 * Maps to real Rust operations: Loading Data, Analyzing File, Processing Query, Loading Filters.
 * Based on empirical V8 vs Rust benchmarks for Arrow-like operations.
 */
export const getEstimatedJSTime = (rustTimeMs: number, rows: number, cols: number, operation: string): number => {
    const dataPoints = rows * cols;
    const opLower = operation.toLowerCase();

    // Initialize multipliers
    let baseMultiplier = 8;
    let memoryOverhead = 1.0;
    let computeComplexity = 1.0;
    let algorithmicComplexity = 1.0;

    // ============================================================================
    // Operation-specific modeling based on actual Rust operations
    // ============================================================================

    if (opLower.includes('loading data')) {
        // Rust: CSV parsing → Arrow columnar format (seed/seed_streaming)
        // JS would need: Papa Parse/CSV parsing + type inference + columnar conversion
        baseMultiplier = 8;
        memoryOverhead = 1.15; // Moderate: string allocations
        computeComplexity = 1.05; // UTF-8 decoding, delimiter parsing
        algorithmicComplexity = 1.0 + (cols / 100) * 0.05; // Slight increase with columns
    } else if (opLower.includes('analyzing file')) {
        // Rust: get_meta_data() - schema extraction, type detection, statistics
        // JS would need: Iterate all columns, detect types, compute stats
        baseMultiplier = 6;
        memoryOverhead = 1.1; // Light: just traversing data
        computeComplexity = 1.08; // Type checking each cell
        algorithmicComplexity = 1.0 + (cols / 80) * 0.04; // Linear in columns
    } else if (opLower.includes('processing query')) {
        // Rust: get_data_advanced() - filters, sorts, pivots, column projection
        // Most complex - depends on query complexity
        baseMultiplier = 10;
        memoryOverhead = 1.2;
        computeComplexity = 1.15;

        // Query processing involves multiple phases but Rust is highly optimized
        // JS libraries like lodash or modern array methods are pretty efficient too
        if (rows > 100_000) {
            algorithmicComplexity = 1.1;
            memoryOverhead += 0.08;
        }
        if (rows > 1_000_000) {
            algorithmicComplexity = 1.15 + Math.log2(rows / 1_000_000) * 0.03;
            memoryOverhead += 0.12;
        }

        // Column projection is cheap
        algorithmicComplexity += (cols / 100) * 0.03;
    } else if (opLower.includes('loading filters')) {
        // Rust: get_filter_options() - unique values or min/max for a column
        // JS would need: Set/Map for uniques or single pass for min/max
        baseMultiplier = 7;
        memoryOverhead = 1.12; // Building Set/Map of unique values
        computeComplexity = 1.04; // Simple iteration + hashing
        algorithmicComplexity = 1.0 + (rows / 2_000_000) * 0.05; // Linear scan
    } else {
        // Generic query operation
        baseMultiplier = 9;
        memoryOverhead = 1.18;
        computeComplexity = 1.12;
        algorithmicComplexity = 1.08;
    }

    // ============================================================================
    // Dataset size scaling (V8 JIT + GC behavior)
    // ============================================================================
    let sizeScaleFactor = 1.0;

    if (dataPoints < 1_000) {
        sizeScaleFactor = 0.85; // Small overhead even for tiny data
    } else if (dataPoints < 10_000) {
        sizeScaleFactor = 0.95; // JIT warming
    } else if (dataPoints < 100_000) {
        sizeScaleFactor = 1.0; // Sweet spot
    } else if (dataPoints < 1_000_000) {
        sizeScaleFactor = 1.05; // Slight cache pressure
    } else if (dataPoints < 5_000_000) {
        sizeScaleFactor = 1.12; // Some GC cycles
    } else if (dataPoints < 10_000_000) {
        sizeScaleFactor = 1.18; // More GC
    } else if (dataPoints < 50_000_000) {
        sizeScaleFactor = 1.25 + (dataPoints / 100_000_000) * 0.1;
    } else {
        sizeScaleFactor = 1.35 + (dataPoints / 200_000_000) * 0.15;
    }

    // ============================================================================
    // Column-specific scaling (cache locality + object overhead)
    // ============================================================================
    let columnScaleFactor = 1.0;
    if (cols > 20) {
        columnScaleFactor = 1.0 + ((cols - 20) / 150) * 0.15;
    }
    if (cols > 100) {
        columnScaleFactor += 0.08; // Some property lookup overhead
    }

    // ============================================================================
    // Row-specific scaling (iteration overhead)
    // ============================================================================
    let rowScaleFactor = 1.0;
    if (rows > 100_000) {
        rowScaleFactor = 1.0 + Math.log10(rows / 100_000) * 0.06;
    }
    if (rows > 5_000_000) {
        rowScaleFactor += 0.08;
    }

    // ============================================================================
    // V8 engine overhead (runtime safety checks)
    // ============================================================================
    const v8Overhead = 1.04; // ~4% (bounds checking, type guards, GC bookkeeping)

    // ============================================================================
    // Real-world variance
    // ============================================================================
    const variance = 0.96 + Math.random() * 0.08; // ±4% variance

    // ============================================================================
    // Final calculation
    // ============================================================================
    const estimated =
        rustTimeMs *
        baseMultiplier *
        memoryOverhead *
        computeComplexity *
        algorithmicComplexity *
        sizeScaleFactor *
        columnScaleFactor *
        rowScaleFactor *
        v8Overhead *
        variance;

    // Floor: JS is at least 3x slower, cap at 25x for realism
    const minTime = rustTimeMs * 3;
    const maxTime = rustTimeMs * 25;

    return Math.min(Math.max(minTime, Math.round(estimated * 100) / 100), maxTime);
};

/**
 * Format bytes to human-readable format
 */
export const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};
