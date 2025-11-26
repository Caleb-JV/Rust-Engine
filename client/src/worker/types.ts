/**
 * Type-safe RPC protocol for Rust WASM Worker communication
 *
 * Design principles:
 * - Enums for compile-time type safety
 * - Pure utility functions for message handling
 * - Transferable objects for zero-copy performance
 * - Strongly typed request/response pairs
 */

// ============================================================================
// Constants for Message Types (Enum-like with full type safety)
// ============================================================================

export const REQUEST_TYPE = {
    INIT: 'INIT',
    SEED: 'SEED',
    GET_META_DATA: 'GET_META_DATA',
    GET_DATA: 'GET_DATA',
    GET_FILTER_OPTIONS: 'GET_FILTER_OPTIONS',
    GET_PROCESSED_DATA: 'GET_PROCESSED_DATA',
} as const;

export type WorkerRequestType = (typeof REQUEST_TYPE)[keyof typeof REQUEST_TYPE];

export const RESPONSE_TYPE = {
    INIT_SUCCESS: 'INIT_SUCCESS',
    INIT_ERROR: 'INIT_ERROR',
    SEED_SUCCESS: 'SEED_SUCCESS',
    SEED_ERROR: 'SEED_ERROR',
    GET_META_DATA_SUCCESS: 'GET_META_DATA_SUCCESS',
    GET_META_DATA_ERROR: 'GET_META_DATA_ERROR',
    GET_DATA_SUCCESS: 'GET_DATA_SUCCESS',
    GET_DATA_ERROR: 'GET_DATA_ERROR',
    GET_FILTER_OPTIONS_SUCCESS: 'GET_FILTER_OPTIONS_SUCCESS',
    GET_FILTER_OPTIONS_ERROR: 'GET_FILTER_OPTIONS_ERROR',
    GET_PROCESSED_DATA_SUCCESS: 'GET_PROCESSED_DATA_SUCCESS',
    GET_PROCESSED_DATA_ERROR: 'GET_PROCESSED_DATA_ERROR',
} as const;

export type WorkerResponseType = (typeof RESPONSE_TYPE)[keyof typeof RESPONSE_TYPE];

// ============================================================================
// Base Types
// ============================================================================

export interface IResponse<T> {
    success: boolean;
    message: string;
    data: T;
    timeTaken: number; // milliseconds
}

// ============================================================================
// Request Types (Main Thread → Worker)
// ============================================================================

export type WorkerRequest =
    | { type: typeof REQUEST_TYPE.INIT }
    | { type: typeof REQUEST_TYPE.SEED; payload: { bytes: Uint8Array } }
    | { type: typeof REQUEST_TYPE.GET_META_DATA }
    | { type: typeof REQUEST_TYPE.GET_DATA; payload: { queryJson: string } }
    | { type: typeof REQUEST_TYPE.GET_FILTER_OPTIONS; payload: { column: string } }
    | { type: typeof REQUEST_TYPE.GET_PROCESSED_DATA; payload: { data: string; pivot: string; aggregationMap: string } };

// ============================================================================
// Response Types (Worker → Main Thread)
// ============================================================================

export type WorkerResponse =
    | { type: typeof RESPONSE_TYPE.INIT_SUCCESS }
    | { type: typeof RESPONSE_TYPE.INIT_ERROR; error: string }
    | { type: typeof RESPONSE_TYPE.SEED_SUCCESS; response: IResponse<null> }
    | { type: typeof RESPONSE_TYPE.SEED_ERROR; error: string }
    | { type: typeof RESPONSE_TYPE.GET_META_DATA_SUCCESS; response: IResponse<string> }
    | { type: typeof RESPONSE_TYPE.GET_META_DATA_ERROR; error: string }
    | { type: typeof RESPONSE_TYPE.GET_DATA_SUCCESS; response: IResponse<Uint8Array> }
    | { type: typeof RESPONSE_TYPE.GET_DATA_ERROR; error: string }
    | { type: typeof RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS; response: IResponse<string> }
    | { type: typeof RESPONSE_TYPE.GET_FILTER_OPTIONS_ERROR; error: string }
    | { type: typeof RESPONSE_TYPE.GET_PROCESSED_DATA_ERROR; error: string };

// ============================================================================
// Message Envelope (includes request ID for async correlation)
// ============================================================================

export interface WorkerMessage<T = WorkerRequest | WorkerResponse> {
    id: string; // Unique request ID for matching responses
    payload: T;
}

// ============================================================================
// Utility Types
// ============================================================================

export type ExtractResponseType<T extends WorkerRequest['type']> = T extends typeof REQUEST_TYPE.INIT
    ? void
    : T extends typeof REQUEST_TYPE.SEED
      ? IResponse<null>
      : T extends typeof REQUEST_TYPE.GET_META_DATA
        ? IResponse<string>
        : T extends typeof REQUEST_TYPE.GET_DATA
          ? IResponse<Uint8Array>
          : T extends typeof REQUEST_TYPE.GET_FILTER_OPTIONS
            ? IResponse<string>
            : T extends typeof REQUEST_TYPE.GET_PROCESSED_DATA
              ? IResponse<string>
              : never;

export interface IPendingRequest<T = any> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
}

// ============================================================================
// Pure Utility Functions
// ============================================================================

/**
 * Create a unique request ID
 */
export function createRequestId(counter: number): string {
    return `req_${counter}_${Date.now()}`;
}

/**
 * Create a success response type from request type
 */
export function getSuccessResponseType(requestType: WorkerRequestType): WorkerResponseType {
    const mapping: Record<WorkerRequestType, WorkerResponseType> = {
        [REQUEST_TYPE.INIT]: RESPONSE_TYPE.INIT_SUCCESS,
        [REQUEST_TYPE.SEED]: RESPONSE_TYPE.SEED_SUCCESS,
        [REQUEST_TYPE.GET_META_DATA]: RESPONSE_TYPE.GET_META_DATA_SUCCESS,
        [REQUEST_TYPE.GET_DATA]: RESPONSE_TYPE.GET_DATA_SUCCESS,
        [REQUEST_TYPE.GET_FILTER_OPTIONS]: RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS,
        [REQUEST_TYPE.GET_PROCESSED_DATA]: RESPONSE_TYPE.GET_PROCESSED_DATA_SUCCESS,
    };
    return mapping[requestType];
}

/**
 * Create an error response type from request type
 */
export function getErrorResponseType(requestType: WorkerRequestType): WorkerResponseType {
    const mapping: Record<WorkerRequestType, WorkerResponseType> = {
        [REQUEST_TYPE.INIT]: RESPONSE_TYPE.INIT_ERROR,
        [REQUEST_TYPE.SEED]: RESPONSE_TYPE.SEED_ERROR,
        [REQUEST_TYPE.GET_META_DATA]: RESPONSE_TYPE.GET_META_DATA_ERROR,
        [REQUEST_TYPE.GET_DATA]: RESPONSE_TYPE.GET_DATA_ERROR,
        [REQUEST_TYPE.GET_FILTER_OPTIONS]: RESPONSE_TYPE.GET_FILTER_OPTIONS_ERROR,
        [REQUEST_TYPE.GET_PROCESSED_DATA]: RESPONSE_TYPE.GET_PROCESSED_DATA_ERROR,
    };
    return mapping[requestType];
}

/**
 * Check if response is a success type
 */
export function isSuccessResponse(type: WorkerResponseType): boolean {
    return (
        type === RESPONSE_TYPE.INIT_SUCCESS ||
        type === RESPONSE_TYPE.SEED_SUCCESS ||
        type === RESPONSE_TYPE.GET_META_DATA_SUCCESS ||
        type === RESPONSE_TYPE.GET_DATA_SUCCESS ||
        type === RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS ||
        type === RESPONSE_TYPE.GET_PROCESSED_DATA_SUCCESS
    );
}

/**
 * Check if response is an error type
 */
export function isErrorResponse(type: WorkerResponseType): boolean {
    return !isSuccessResponse(type);
}

/**
 * Extract transferable objects from response for zero-copy transfer
 */
export function extractTransferables(response: WorkerResponse): Transferable[] {
    const transferables: Transferable[] = [];

    if (response.type === RESPONSE_TYPE.GET_DATA_SUCCESS) {
        const data = response.response.data;
        if (data instanceof Uint8Array && data.buffer) {
            transferables.push(data.buffer);
        }
    }

    return transferables;
}

/**
 * Create an error response
 */
export function createErrorResponse(requestType: WorkerRequestType, error: string): WorkerResponse {
    const errorType = getErrorResponseType(requestType);
    return { type: errorType, error } as WorkerResponse;
}
