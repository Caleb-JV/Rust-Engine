import { tableFromIPC, Table } from 'apache-arrow';
import init, { seed, get_meta_data, get_data, get_data_advanced_async, aggregate_async, get_filter_options_async } from '../wasm/package/rust_core';
import type { Row, TableData } from '../types';
import type { IGetMetaDataResponse, IColumnMeta } from '../types/metadata';
import { rustTypeToDataType } from '../types/metadata';
import type { IFieldsKeeperItem } from 'react-fields-keeper';
import type { IColumnField } from '../store/fieldsStore';
import { useFieldsStore } from '../store/fieldsStore';

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
     */
    async processFile(file: File): Promise<IFieldsKeeperItem<IColumnField>[]> {
        const store = useFieldsStore.getState();

        try {
            store.setProcessingStatus('loading');
            store.setError(null);

            // 1. Initialize WASM
            await this.initialize();

            store.setProcessingStatus('processing');

            // 2. Seed data to Rust (data stays in Rust, not stored here)
            const bytes = new Uint8Array(await file.arrayBuffer());
            seed(bytes);

            // 3. Get metadata from Rust
            const metadataJson = get_meta_data();
            this.metadata = JSON.parse(metadataJson as string) as IGetMetaDataResponse;

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
     */
    async getData(query: DataQuery): Promise<TableData> {
        const store = useFieldsStore.getState();

        try {
            store.setProcessingStatus('processing');

            // Call Rust with query JSON
            const queryJson = JSON.stringify(query);
            const arr = get_data(queryJson);
            const table: Table = tableFromIPC(arr);

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
            store.setProcessingStatus('success');
            store.incrementTableRenderCounter();

            return this.resultData;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to get data';
            console.error('Error getting advanced data:', err);
            store.setError(errorMessage);
            store.setProcessingStatus('error');
            throw err;
        }
    }

    /**
     * Advanced query with async support
     */
    async getDataAdvancedAsync(query: DataQuery): Promise<TableData> {
        const store = useFieldsStore.getState();

        try {
            store.setProcessingStatus('processing');

            // Call Rust async with query JSON
            const queryJson = JSON.stringify(query);
            const result = await get_data_advanced_async(queryJson);

            // Result is Uint8Array wrapped in promise
            const arr = new Uint8Array(result);
            const table: Table = tableFromIPC(arr);

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
            store.setProcessingStatus('success');
            store.incrementTableRenderCounter();

            return this.resultData;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to get data';
            console.error('Error getting advanced data async:', err);
            store.setError(errorMessage);
            store.setProcessingStatus('error');
            throw err;
        }
    }

    /**
     * Get aggregation result
     */
    async getAggregation(column: string, aggregationType: 'sum' | 'average' | 'count' | 'min' | 'max'): Promise<unknown> {
        try {
            const result = await aggregate_async(column, aggregationType);
            return JSON.parse(result);
        } catch (err) {
            console.error('Error getting aggregation:', err);
            throw err;
        }
    }

    /**
     * Get filter options for a column
     */
    async getFilterOptions(column: string): Promise<unknown> {
        try {
            const result = await get_filter_options_async(column);
            return JSON.parse(result);
        } catch (err) {
            console.error('Error getting filter options:', err);
            throw err;
        }
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
