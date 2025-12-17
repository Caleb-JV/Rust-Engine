// Using flat column buffers for zero-copy performance
import { toast } from 'sonner';
import type { IGetMetaDataResponse, IColumnMeta } from '../types/metadata';
import { rustTypeToDataType } from '../types/metadata';
import type { IFieldsKeeperItem } from 'react-fields-keeper';
import type { IAdditionalOptions, IColumnField, TimingLog } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import { getWorkerClient } from '../worker/WorkerClient';
import { getPivotItemsToFetchData } from '@/lib/data.utils';

export type TAggregationType = 'sum' | 'average' | 'count' | 'min' | 'max' | 'stddev' | 'first' | 'last';

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

export interface ISortOption {
    column: string;
    direction: 'asc' | 'desc';
}

export interface IColumnInfo {
    column: string;
    aggregation?: TAggregationType;
}

export interface IPivotOptions {
    rows: IColumnInfo[];
    values: IColumnInfo[];
}

export interface DataQuery {
    pivot: IPivotOptions;
    filters: FilterCondition[];
    sort?: ISortOption[];
    limit?: number;
    offset?: number;
    options?: IAdditionalOptions;
}

interface ArrowColumnBuffer {
    name: string;
    dataType: 'int32' | 'int64' | 'float64' | 'bool' | 'utf8' | 'date32' | 'date64';
    values: Int32Array | BigInt64Array | Float64Array | Uint8Array;
    offsets?: Int32Array; // Only for utf8
}

interface ColumnBufferResponse {
    columns: ArrowColumnBuffer[];
    rowCount: number;
}

function getColumnValue(buffer: ArrowColumnBuffer, rowIndex: number): unknown {
    if (rowIndex < 0 || rowIndex >= buffer.values.length) return null;

    switch (buffer.dataType) {
        case 'int32':
            return (buffer.values as Int32Array)[rowIndex];

        case 'int64':
            return Number((buffer.values as BigInt64Array)[rowIndex]);

        case 'float64':
            return (buffer.values as Float64Array)[rowIndex];

        case 'bool':
            return (buffer.values as Uint8Array)[rowIndex] === 1;

        case 'utf8': {
            if (!buffer.offsets) return null;
            const start = buffer.offsets[rowIndex];
            const end = buffer.offsets[rowIndex + 1];
            const bytes = (buffer.values as Uint8Array).slice(start, end);
            return new TextDecoder().decode(bytes);
        }

        case 'date32': {
            // Date32 stores days since Unix epoch (1970-01-01)
            const days = (buffer.values as Int32Array)[rowIndex];
            const date = new Date(days * 86400000); // Convert days to milliseconds
            return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
        }

        case 'date64': {
            // Date64 stores milliseconds since Unix epoch
            const ms = Number((buffer.values as BigInt64Array)[rowIndex]);
            const date = new Date(ms);
            return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
        }

        default:
            return null;
    }
}

/**
 * DataService - Professional singleton service for data operations
 *
 * Responsibilities:
 * 1. WASM Worker communication (all Rust operations run in Web Worker)
 * 2. File seeding (data stored in Rust Worker, not here)
 * 3. Metadata management (fetched from Rust Worker)
 * 4. Data retrieval with pivot/filter support
 * 5. Store integration for status updates
 *
 * - Uses flat column buffers (typed arrays) instead of Arrow IPC
 * - Zero-copy data transfer from Rust to JavaScript
 * - Direct typed array access for cell values (no reconstruction)
 * - Massive performance improvement: no serialization/deserialization overhead
 *
 * All heavy operations run off the main thread to prevent UI freezes
 */
class DataService {
    private static instance: DataService;
    private isInitialized = false;
    private workerClient = getWorkerClient();

    // Store metadata from Rust (not data!)
    private metadata: IGetMetaDataResponse | null = null;

    private resultColumns: Map<string, ArrowColumnBuffer> = new Map();
    private resultSchema: { name: string; type: string }[] = [];
    private rowCount: number = 0;

    private constructor() {}

    static getInstance(): DataService {
        if (!DataService.instance) {
            DataService.instance = new DataService();
        }
        return DataService.instance;
    }

    /**
     * Initialize WASM module in worker
     */
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;
        await this.workerClient.init();
        this.isInitialized = true;
        console.log('[DataService] WASM Worker initialized');
    }

    /**
     * Process file: Seed data to Rust and fetch metadata
     * This is the main entry point after file upload
     * Uses streaming for large files (>5MB) with progress updates
     */
    async processFile(file: File): Promise<IFieldsKeeperItem<IColumnField>[]> {
        const store = useAppStore.getState();

        try {
            store.resetStore();

            store.setProcessingStatus('loading');

            // 1. Initialize WASM
            await this.initialize();

            store.setProcessingStatus('processing');

            const useStreaming = file.size > 5 * 1024 * 1024; // > 5MB

            if (useStreaming) {
                // 2a. Use streaming API with progress updates
                console.log(`[DataService] Using streaming mode for file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
                store.setisStreaming(true);
                store.setLoadingProgress?.(0);

                const result = await this.workerClient.processFile(file, (progress) => {
                    console.log(`[DataService] Progress: ${progress.percent}%`);
                    store.setLoadingProgress?.(progress.percent);
                });

                if (!result.success) {
                    throw new Error(result.message || 'Failed to process file');
                }

                // Extract metadata from streaming result
                this.metadata = JSON.parse(result.data.metadataJson) as IGetMetaDataResponse;

                // Log timing info from streaming
                if (result.data.timing && result.data.timing.length > 0) {
                    console.log('[DataService] Timing logs:', result.data.timing);
                }

                const seedTiming: TimingLog = {
                    operation: 'Loading Data (Streaming)',
                    duration_ms: result.timeTaken || 0,
                };
                store.setLatestTiming(seedTiming);
                store.setisStreaming(false);
                store.setLoadingProgress?.(100);
            } else {
                // 2b. Small file: Use traditional seed method (faster for small files)
                console.log(`[DataService] Using direct mode for file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

                const bytes = new Uint8Array(await file.arrayBuffer());
                const seedResponse = await this.workerClient.seed(bytes);
                if (!seedResponse.success) {
                    throw new Error(seedResponse.message || 'Failed to seed data');
                }

                const seedTiming: TimingLog = {
                    operation: 'Loading Data',
                    duration_ms: seedResponse.timeTaken,
                };
                store.setLatestTiming(seedTiming);

                // 3. Get metadata from Rust Worker
                const metadataResponse = await this.workerClient.getMetaData();
                if (!metadataResponse.success) {
                    throw new Error(metadataResponse.message || 'Failed to get metadata');
                }

                const metaTiming: TimingLog = {
                    operation: 'Analyzing File',
                    duration_ms: metadataResponse.timeTaken,
                };
                store.setLatestTiming(metaTiming);

                this.metadata = JSON.parse(metadataResponse.data) as IGetMetaDataResponse;
            }

            console.log('Metadata received:', this.metadata);

            // 4. Set row and column counts in store
            store.setTableRowCount(this.metadata.row_count);
            store.setTableColumnCount(this.metadata.columns.length);

            // 5. Convert metadata to FieldsKeeper items
            const allItems = this.createFieldItems();

            store.setProcessingStatus('success');
            this.getData();

            return allItems;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
            console.error('Error processing file:', err);
            toast.error(errorMessage);
            store.setProcessingStatus('error');
            throw err;
        }
    }

    /**
     * Get data from Rust based on current pivot/filter configuration
     * Called when pivot/filter changes or "Apply" is clicked
     */

    /**
     * Advanced query with filters, sorting, and pivot
     * Runs in Web Worker to prevent UI freezes
     * NEW: Uses columnar buffers instead of IPC for zero-copy performance
     */
    getData(): void {
        const { filterCondition, pivotBuckets, additionalOptions, sortOptions } = useAppStore.getState();

        const query: DataQuery = {
            filters: filterCondition.filter((fc) => fc && !!fc?.value),
            pivot: getPivotItemsToFetchData(pivotBuckets),
            sort: sortOptions,
            options: additionalOptions,
        };

        const store = useAppStore.getState();
        store.setProcessingStatus('processing');

        const queryJson = JSON.stringify(query);
        console.log('[DataService] Data Query:', query);
        const dataResponse = this.workerClient.getData(queryJson);

        const mainThreadStart = performance.now();

        dataResponse
            .then(async (response) => {
                if (!response.success) {
                    console.error('[DataService] getData failed:', response.message);
                    throw new Error(response.message || 'Failed to get data');
                }

                const ColumnBufferResponse = response.data as ColumnBufferResponse;

                console.log('[DataService] ✨Response:', ColumnBufferResponse);

                const storeStart = performance.now();

                this.rowCount = ColumnBufferResponse.rowCount;
                this.resultColumns.clear();
                this.resultSchema = [];

                for (const col of ColumnBufferResponse.columns) {
                    // Store raw typed arrays directly (no reconstruction!)
                    this.resultColumns.set(col.name, col);
                    this.resultSchema.push({
                        name: col.name,
                        type: col.dataType,
                    });
                }

                const storeTime = performance.now() - storeStart;
                const totalMainThread = performance.now() - mainThreadStart;

                console.log(`[DataService] ✓ query complete`);
                console.log(`  ├─ Rust WASM processing: ${response.timeTaken.toFixed(2)}ms`);
                console.log(`  ├─ JS storage (zero-copy): ${storeTime.toFixed(2)}ms`);
                console.log(`  └─ Total main thread: ${totalMainThread.toFixed(2)}ms`);
                console.log(`[DataService] 📊 Rows: ${this.rowCount.toLocaleString()}, Columns: ${this.resultSchema.length}`);

                store.setTableRowCount(this.rowCount);
                store.setTableColumnCount(this.resultSchema.length);

                store.setLatestTiming({
                    operation: 'Processing',
                    duration_ms: response.timeTaken,
                });

                store.setProcessingStatus('success');
                store.incrementTableRenderCounter();
            })
            .catch((err) => {
                const message = err instanceof Error ? err.message : 'Failed to get data';
                console.error('[DataService] Error getting data:', message);
                toast.error(message);
                store.setProcessingStatus('error');
            });
    }

    /**
     * Get filter options for a column
     * Runs in Web Worker to prevent UI freezes
     */
    async getFilterOptions(column: string): Promise<unknown> {
        try {
            const response = await this.workerClient.getFilterOptions(column);
            if (!response.success) {
                throw new Error(response.message || 'Failed to get filter options');
            }

            const store = useAppStore.getState();
            const timing: TimingLog = {
                operation: 'Loading Filters',
                duration_ms: response.timeTaken,
            };
            store.setLatestTiming(timing);

            return JSON.parse(response.data);
        } catch (err) {
            console.error('[DataService] Error getting filter options:', err);
            throw err;
        }
    }

    /**
     */
    getCell(rowIndex: number, columnName: string): unknown {
        const buffer = this.resultColumns.get(columnName);
        if (!buffer) return null;

        if (rowIndex < 0 || rowIndex >= this.rowCount) return null;

        return getColumnValue(buffer, rowIndex);
    }

    /**
     * Get number of rows in result set
     */
    getRowCount(): number {
        return this.rowCount;
    }

    /**
     * Get column names in result set
     */
    getColumnNames(): string[] {
        return this.resultSchema.map((c) => c.name);
    }

    /**
     * Get column schema
     */
    getColumnSchema(): { name: string; type: string }[] {
        return [...this.resultSchema];
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
            type: rustTypeToDataType(col.type) === 'number' ? 'value' : 'category',
            value: {
                id: col.name,
                name: col.name,
                dataType: rustTypeToDataType(col.type),
                aggregate: rustTypeToDataType(col.type) === 'number' ? 'sum' : undefined,
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
        const store = useAppStore.getState();
        const allItems = this.getAllFieldItems();

        store.removeAllFilters();
        // Set all columns in columns bucket
        store.setPivotBuckets([
            { id: 'columns', items: allItems.filter((item) => item.value?.dataType !== 'number') },
            { id: 'values', items: allItems.filter((item) => item.value?.dataType === 'number') },
        ]);

        // Fetch all data
        this.getData();
    }

    /**
     * Clear all data - Reset pivot and filters
     */
    clearAllData(): void {
        const store = useAppStore.getState();
        store.clearAllAssignments();

        this.resultColumns.clear();
        this.resultSchema = [];
        this.rowCount = 0;
        store.incrementTableRenderCounter();
        this.getData();
    }

    /**
     * Refresh metadata after sample data generation
     */
    async refreshMetadata(): Promise<void> {
        try {
            // Ensure worker is initialized
            await this.initialize();

            const store = useAppStore.getState();

            // Get metadata from Rust Worker
            const metadataResponse = await this.workerClient.getMetaData();
            if (!metadataResponse.success) {
                throw new Error(metadataResponse.message || 'Failed to get metadata');
            }

            const metaTiming: TimingLog = {
                operation: 'fetching Data',
                duration_ms: metadataResponse.timeTaken,
            };
            store.setLatestTiming(metaTiming);

            this.metadata = JSON.parse(metadataResponse.data) as IGetMetaDataResponse;

            store.setTableRowCount(this.metadata.row_count);
            store.setTableColumnCount(this.metadata.columns.length);
            store.setFileName('sample_data_generated.csv');

            // Convert metadata to FieldsKeeper items (for sidebar display)
            this.createFieldItems();

            // Reset pivot buckets to empty state
            store.setPivotBuckets([
                { id: 'columns', items: [] },
                { id: 'values', items: [] },
            ]);

            this.rowCount = this.metadata.row_count;

            // Fetch data with empty pivot/filter
            this.getData();

            console.log('[DataService] Metadata refreshed:', this.metadata);
        } catch (err) {
            console.error('[DataService] Failed to refresh metadata:', err);
            const store = useAppStore.getState();
            const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
            store.setProcessingStatus('error');
            toast.error(errorMessage);
            throw err;
        }
    }

    /**
     * Reset service (clear metadata and result data)
     */
    reset(): void {
        this.metadata = null;
        this.resultColumns.clear();
        this.resultSchema = [];
        this.rowCount = 0;
        const store = useAppStore.getState();
        store.resetStore();
    }
}

// Export singleton instance
export const dataService = DataService.getInstance();
