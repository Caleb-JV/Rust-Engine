import type { WorkerRequest, WorkerResponse, WorkerResponseType, IResponse, IProcessFileProgress, IProcessFileResult } from '../worker/types';
import {
    isSuccessResponse as workerIsSuccessResponse,
    isErrorResponse as workerIsErrorResponse,
    isProgressResponse as workerIsProgressResponse,
} from '../worker/types';

export type Row = Record<string, string | number | boolean | null>;

export interface TableData {
    rows: Row[];
    columns: string[];
}

export interface MetaData {
    rowCount: number;
    columnCount: number;
    columns: string[];
}

export interface FilterOption {
    column: string;
    values: string[];
}

export interface PivotConfig {
    rows: string[];
    columns: string[];
    values: string[];
    aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
}

export interface FilterConfig {
    column: string;
    operator: 'equals' | 'contains' | 'greater' | 'less';
    value: string | number;
}

export type ProcessingStatus = 'idle' | 'loading' | 'processing' | 'success' | 'error';

export interface IAppState {
    tableData: TableData;
    metadata: MetaData | null;
    filterOptions: Map<string, string[]>;
    selectedFile: File | null;
    processingStatus: ProcessingStatus;
    error: string | null;
}

// Helpers – mark PROCESS_FILE_* types appropriately
export function isSuccessResponse(type: WorkerResponseType): boolean {
    return workerIsSuccessResponse(type);
}

export function isErrorResponse(type: WorkerResponseType): boolean {
    return workerIsErrorResponse(type);
}

// Optional convenience
export function isProgressResponse(type: WorkerResponseType): boolean {
    return workerIsProgressResponse(type);
}

export type { WorkerRequest, WorkerResponse, WorkerResponseType, IResponse, IProcessFileProgress, IProcessFileResult };
