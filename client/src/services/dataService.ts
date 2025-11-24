import init, { get_timing_log, clear_timing_log } from '../wasm/package/rust_core';
import type { TableData } from '../types';
import type { IGetMetaDataResponse, IColumnMeta } from '../types/metadata';
import { rustTypeToDataType } from '../types/metadata';
import type { IFieldsKeeperItem } from 'react-fields-keeper';
import type { IColumnField, TimingLog } from '../store/fieldsStore';
import { useFieldsStore } from '../store/fieldsStore';
import { workerClient } from '../worker/worker-client';

/**
 * Map Rust function names to user-friendly operation descriptions
 */
function getFriendlyOperationName(rustOperation: string): string {
    const operationMap: Record<string, string> = {
        seed: 'Loading Data',
        get_meta_data: 'Analyzing File',
        get_data_async: 'Processing Query',
        get_filter_options_async: 'Loading Filters',
        apply_filters: 'Applying Filters',
        apply_sort: 'Sorting Data',
        apply_pivot: 'Pivoting Data',
    };

    return operationMap[rustOperation] || 'Processing';
}

/**
 * Fetch and display timing logs from Rust WASM calls
 * Stores only the latest timing in the store for UI display
 */
function logTimings(): void {
    try {
        const logs = get_timing_log();
        if (logs && Array.isArray(logs) && logs.length > 0) {
            // Get the latest log (last one in array)
            const latestLog = logs[logs.length - 1];

            // Format: "operation_name: 123.45ms"
            const match = latestLog.match(/^(.+?):\s*(\d+\.?\d*)\s*ms$/);
            if (match) {
                const rustOperation = match[1].trim();
                const timing: TimingLog = {
                    operation: getFriendlyOperationName(rustOperation),
                    duration_ms: parseFloat(match[2]),
                };

                // Store only the latest timing in Zustand
                const store = useFieldsStore.getState();
                store.setLatestTiming(timing);
            }

            // Console log for developers (show all)
            console.group('🦀 WASM Performance');
            console.table(logs.map((log, idx) => ({ '#': idx + 1, Timing: log })));
            console.groupEnd();

            clear_timing_log();
        }
    } catch (err) {
        console.warn('Failed to fetch timing logs:', err);
    }
}

// Query types matching Rust implementation
export interface FilterCondition {
    column: string;
    operator:
        | 'equals'
        | 'notequals'
        | 'greaterthan'
        | 'lessthan'
        | 'greaterthanorequal'
        | 'lessthanorequal'
        | 'contains'
        | 'notcontains'
        | 'in'
        | 'notin'
        | 'between';
    value: string | number | boolean | string[] | { min: number; max: number };
}

export interface SortSpec {
    column: string;
    direction: 'asc' | 'desc';
}

export interface PivotValue {
    column: string;
    aggregation: 'sum' | 'average' | 'count' | 'min' | 'max';
}

export interface PivotSpec {
    rows: string[];
    columns?: string[];
    values: PivotValue[];
}

export interface DataQuery {
    columns?: string[];
    filters?: FilterCondition[];
    sort?: SortSpec[];
    pivot?: PivotSpec;
    limit?: number;
    offset?: number;
}

/**
 * DataService - Professional singleton service for data operations
 *
 * Responsibilities:
 * 1. WASM initialization and communication
 * 2. File seeding (data stored in Rust, not here)
 * 3. Metadata management (fetched from Rust)
 * 4. Data retrieval with pivot/filter support
 * 5. Store integration for status updates
 *
 * NO CACHING - Data lives in Rust, metadata fetched on demand
 */
class DataService {
    private static instance: DataService;
    private isInitialized = false;

    // Store metadata from Rust (not data!)
    private metadata: IGetMetaDataResponse | null = null;
    private resultData: TableData = { rows: [], columns: [] };

    private constructor() {}

    static getInstance(): DataService {
        if (!DataService.instance) {
            DataService.instance = new DataService();
        }
        return DataService.instance;
    }

    /**
     * Initialize WASM module
     */
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;
        await init();
        this.isInitialized = true;
    }

    /**
     * Process file: Seed data to Rust and fetch metadata
     * This is the main entry point after file upload
     * Supports streaming for large files with progress updates
     */
    async processFile(file: File) {
        const store = useFieldsStore.getState();
        try {
            store.setProcessingStatus('loading');
            store.setLatestTiming(null);
            store.setUploadProgress(null);

            const { metadata, timing } = await workerClient.processFile(file, (progress) => {
                // Update progress in store for UI display
                store.setUploadProgress(progress);
            });

            this.metadata = metadata;
            store.setLatestTiming(timing);
            store.setUploadProgress(null); // Clear progress after completion
            store.setProcessingStatus('success');

            return this.createFieldItems();
        } catch (err: any) {
            store.setProcessingStatus('error');
            store.setError(err.message);
            store.setUploadProgress(null); // Clear progress on error
            throw err;
        }
    }

    /**
     * Get data from Rust based on current pivot/filter configuration
     * Called when pivot/filter changes or "Apply" is clicked
     */

    /**
     * Advanced query with filters, sorting, and pivot
     */
    async getData(query: DataQuery) {
        const store = useFieldsStore.getState();

        try {
            store.setProcessingStatus('processing');

            const { rows, columns, timing } = await workerClient.getData(query);

            this.resultData = { rows, columns };
            store.setLatestTiming(timing);
            store.setProcessingStatus('success');
            store.incrementTableRenderCounter();

            return this.resultData;
        } catch (err: any) {
            store.setProcessingStatus('error');
            store.setError(err.message);
            throw err;
        }
    }

    /**
     * Get filter options for a column
     */
    async getFilterOptions(column: string) {
        const { options, timing } = await workerClient.getFilterOptions(column);
        const store = useFieldsStore.getState();
        store.setLatestTiming(timing);
        return options;
    }

    /**
     * Get all data (no column filtering)
     */
    async getAllData(): Promise<TableData> {
        return this.getData({});
    }

    /**
     * Get current result data (cached after last getData call)
     */
    getCurrentData(): TableData {
        return this.resultData;
    }

    /**
     * Get metadata
     */
    getMetadata(): IGetMetaDataResponse | null {
        return this.metadata;
    }

    /**
     * Get column metadata by name
     */
    getColumnMeta(columnName: string): IColumnMeta | undefined {
        return this.metadata?.columns.find((col) => col.name === columnName);
    }

    /**
     * Get column type from metadata
     */
    getColumnType(columnName: string): 'string' | 'number' | 'boolean' {
        const colMeta = this.getColumnMeta(columnName);
        if (!colMeta) return 'string';
        return rustTypeToDataType(colMeta.type);
    }

    /**
     * Create FieldsKeeper items from metadata
     */
    private createFieldItems(): IFieldsKeeperItem<IColumnField>[] {
        if (!this.metadata) return [];

        return this.metadata.columns.map((col) => ({
            id: col.name,
            label: col.name,
            value: {
                id: col.name,
                name: col.name,
                dataType: rustTypeToDataType(col.type),
            },
            prefixNode: rustTypeToDataType(col.type) === 'number' ? 'measure-icon' : undefined,
        }));
    }

    /**
     * Get all field items (for FieldsKeeper)
     */
    getAllFieldItems(): IFieldsKeeperItem<IColumnField>[] {
        return this.createFieldItems();
    }

    /**
     * Use All Data - Move all columns to columns bucket
     */
    async useAllData(): Promise<void> {
        const store = useFieldsStore.getState();
        const allItems = this.getAllFieldItems();

        // Set all columns in columns bucket
        store.setPivotBuckets([
            { id: 'columns', items: allItems },
            { id: 'values', items: [] },
        ]);

        // Clear filters
        store.setFilterBuckets([{ id: 'filters', items: [] }]);

        // Fetch all data
        await this.getAllData();
    }

    /**
     * Clear all data - Reset pivot and filters
     */
    clearAllData(): void {
        const store = useFieldsStore.getState();
        store.setPivotBuckets([
            { id: 'columns', items: [] },
            { id: 'values', items: [] },
        ]);
        this.resultData = { rows: [], columns: [] };
        store.incrementTableRenderCounter();
    }

    /**
     * Reset service (clear metadata and result data)
     */
    reset(): void {
        this.metadata = null;
        this.resultData = { rows: [], columns: [] };
        const store = useFieldsStore.getState();
        store.resetStore();
    }
}

// Export singleton instance
export const dataService = DataService.getInstance();
