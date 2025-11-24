import { tableFromIPC, Table } from 'apache-arrow';
import type { Row, TableData } from '../types';
import type { IGetMetaDataResponse, IColumnMeta } from '../types/metadata';
import { rustTypeToDataType } from '../types/metadata';
import type { IFieldsKeeperItem } from 'react-fields-keeper';
import type { IColumnField, TimingLog } from '../store/fieldsStore';
import { useStore } from '../store/fieldsStore';
import { getWorkerClient } from '../worker/WorkerClient';

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
 * 1. WASM Worker communication (all Rust operations run in Web Worker)
 * 2. File seeding (data stored in Rust Worker, not here)
 * 3. Metadata management (fetched from Rust Worker)
 * 4. Data retrieval with pivot/filter support
 * 5. Store integration for status updates
 *
 * NO CACHING - Data lives in Rust Worker, metadata fetched on demand
 * All heavy operations run off the main thread to prevent UI freezes
 */
class DataService {
    private static instance: DataService;
    private isInitialized = false;
    private workerClient = getWorkerClient();

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
     */
    async processFile(file: File): Promise<IFieldsKeeperItem<IColumnField>[]> {
        const store = useStore.getState();

        try {
            store.setProcessingStatus('loading');
            store.setError(null);
            store.setLatestTiming(null); // Clear old timing

            // 1. Initialize WASM
            await this.initialize();

            store.setProcessingStatus('processing');

            // 2. Seed data to Rust Worker (data stays in Worker, not stored here)
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

            console.log('Metadata received:', this.metadata);

            // 4. Convert metadata to FieldsKeeper items
            const allItems = this.createFieldItems();

            store.setProcessingStatus('success');

            return allItems;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
            console.error('Error processing file:', err);
            store.setError(errorMessage);
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
     */
    getData(query: DataQuery): void {
        const store = useStore.getState();

        store.setProcessingStatus('processing');

        // Call Rust Worker with query JSON
        const queryJson = JSON.stringify(query);
        const dataResponse = this.workerClient.getData(queryJson);

        const startTime = performance.now();

        console.log(`[DataService] Query started at ${startTime}`);

        dataResponse
            .then((response) => {
                if (!response.success) throw new Error(response.message || 'Failed to get data');

                const table: Table = tableFromIPC(response.data);

                // Parse to TableData format
                const colNames = table.schema.fields.map((f) => f.name);
                const parsedRows: Row[] = [];

                for (let i = 0; i < table.numRows; i++) {
                    const row: Row = {};
                    for (const col of colNames) {
                        const colVector = table.getChild(col);
                        row[col] = colVector?.get(i) ?? null;
                    }
                    parsedRows.push(row);
                }

                this.resultData = { rows: parsedRows, columns: colNames };
                const endTime = performance.now();
                console.log(`[DataService] Received at ${endTime}ms`);
                const timeTaken = endTime - startTime;
                console.log(`[DataService] Query processed in ${timeTaken}ms`);

                const timing: TimingLog = {
                    operation: 'Processing Query',
                    duration_ms: response.timeTaken,
                };
                store.setLatestTiming(timing);
                store.setProcessingStatus('success');
                store.incrementTableRenderCounter();
            })
            .catch((err) => {
                const errorMessage = err instanceof Error ? err.message : 'Failed to get data';
                console.error('[DataService] Error getting data:', err);
                store.setError(errorMessage);
                store.setProcessingStatus('error');
                throw err;
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

            const store = useStore.getState();
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
        const store = useStore.getState();
        const allItems = this.getAllFieldItems();

        // Set all columns in columns bucket
        store.setPivotBuckets([
            { id: 'columns', items: allItems },
            { id: 'values', items: [] },
        ]);

        // Clear filters
        store.setFilterBuckets([{ id: 'filters', items: [] }]);

        // Fetch all data
        this.getData({});
    }

    /**
     * Clear all data - Reset pivot and filters
     */
    clearAllData(): void {
        const store = useStore.getState();
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
        const store = useStore.getState();
        store.resetStore();
    }
}

// Export singleton instance
export const dataService = DataService.getInstance();
