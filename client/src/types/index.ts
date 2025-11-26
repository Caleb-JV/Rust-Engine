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

export interface AppState {
    tableData: TableData;
    metadata: MetaData | null;
    filterOptions: Map<string, string[]>;
    selectedFile: File | null;
    processingStatus: ProcessingStatus;
    error: string | null;
}

// types.ts (only the new / changed parts)

// Existing enums – add new variants
export enum REQUEST_TYPE {
    INIT = 'INIT',
    SEED = 'SEED',
    GET_META_DATA = 'GET_META_DATA',
    GET_DATA = 'GET_DATA',
    GET_FILTER_OPTIONS = 'GET_FILTER_OPTIONS',

    // NEW
    PROCESS_FILE = 'PROCESS_FILE',
}

export enum RESPONSE_TYPE {
    INIT_SUCCESS = 'INIT_SUCCESS',
    INIT_ERROR = 'INIT_ERROR',
    SEED_SUCCESS = 'SEED_SUCCESS',
    GET_META_DATA_SUCCESS = 'GET_META_DATA_SUCCESS',
    GET_DATA_SUCCESS = 'GET_DATA_SUCCESS',
    GET_FILTER_OPTIONS_SUCCESS = 'GET_FILTER_OPTIONS_SUCCESS',
    ERROR = 'ERROR',

    // NEW
    PROCESS_FILE_PROGRESS = 'PROCESS_FILE_PROGRESS',
    PROCESS_FILE_SUCCESS = 'PROCESS_FILE_SUCCESS',
}

// Progress payload from worker during streaming
export interface IProcessFileProgress {
    percent: number;
    bytesProcessed: number;
    totalBytes: number;
}

// Final result of processFile (stream or non-stream)
// Adapt this to your actual metadata type
export interface IProcessFileResult {
    metadataJson: string;
    timing: any[];
}

// Extend WorkerRequest union
export type WorkerRequest =
    | { type: REQUEST_TYPE.INIT }
    | { type: REQUEST_TYPE.SEED; payload: { bytes: Uint8Array } }
    | { type: REQUEST_TYPE.GET_META_DATA }
    | { type: REQUEST_TYPE.GET_DATA; payload: { queryJson: string } }
    | { type: REQUEST_TYPE.GET_FILTER_OPTIONS; payload: { column: string } }
    // NEW:
    | { type: REQUEST_TYPE.PROCESS_FILE; payload: { file: File } };

// Extend WorkerResponse union – keep your other responses as-is
export type WorkerResponse =
    | { type: RESPONSE_TYPE.INIT_SUCCESS }
    | { type: RESPONSE_TYPE.SEED_SUCCESS; response: IResponse<null> }
    | { type: RESPONSE_TYPE.GET_META_DATA_SUCCESS; response: IResponse<string> }
    | { type: RESPONSE_TYPE.GET_DATA_SUCCESS; response: IResponse<Uint8Array> }
    | { type: RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS; response: IResponse<string> }
    | { type: RESPONSE_TYPE.ERROR; error: string }
    // NEW:
    | {
          type: RESPONSE_TYPE.PROCESS_FILE_PROGRESS;
          data: IProcessFileProgress;
      }
    | {
          type: RESPONSE_TYPE.PROCESS_FILE_SUCCESS;
          response: IResponse<IProcessFileResult>;
      };

// Helpers – mark PROCESS_FILE_* types appropriately
export function isSuccessResponse(type: RESPONSE_TYPE): boolean {
    return (
        type === RESPONSE_TYPE.INIT_SUCCESS ||
        type === RESPONSE_TYPE.SEED_SUCCESS ||
        type === RESPONSE_TYPE.GET_META_DATA_SUCCESS ||
        type === RESPONSE_TYPE.GET_DATA_SUCCESS ||
        type === RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS ||
        type === RESPONSE_TYPE.PROCESS_FILE_SUCCESS
    );
}

export function isErrorResponse(type: RESPONSE_TYPE): boolean {
    return type === RESPONSE_TYPE.ERROR || type === RESPONSE_TYPE.INIT_ERROR;
}

// Optional convenience
export function isProgressResponse(type: RESPONSE_TYPE): boolean {
    return type === RESPONSE_TYPE.PROCESS_FILE_PROGRESS;
}
