/**
 * Web Worker for Rust WASM operations
 *
 * Responsibilities:
 * - Initialize WASM module
 * - Execute all WASM operations off the main thread
 * - Handle message-based RPC from main thread
 * - Return results with proper error handling
 *
 * This worker runs in a separate thread, preventing UI freezes during
 * heavy CSV/Arrow processing operations.
 */

import init, { seed_async, get_meta_data_async, get_data_async, get_filter_options_async, get_processed_data_async } from '../wasm/package/rust_core';

import type { WorkerMessage, WorkerRequest, WorkerResponse, IResponse } from './types';
import { REQUEST_TYPE, RESPONSE_TYPE, createErrorResponse, extractTransferables } from './types';

// ============================================================================
// Worker State
// ============================================================================

let isInitialized = false;

// ============================================================================
// WASM Initialization
// ============================================================================

async function initializeWasm(): Promise<void> {
    if (isInitialized) return;
    await init();
    isInitialized = true;
    console.log('[Worker] WASM initialized successfully');
}

// ============================================================================
// Pure Request Handlers (no side effects except WASM calls)
// ============================================================================

const handleSeed = async (bytes: Uint8Array): Promise<IResponse<null>> => {
    return (await seed_async(bytes)) as IResponse<null>;
};

const handleGetMetaData = async (): Promise<IResponse<string>> => {
    return (await get_meta_data_async()) as IResponse<string>;
};

const handleGetData = async (queryJson: string): Promise<IResponse<Uint8Array>> => {
    return (await get_data_async(queryJson)) as IResponse<Uint8Array>;
};

const handleGetFilterOptions = async (column: string): Promise<IResponse<string>> => {
    return (await get_filter_options_async(column)) as IResponse<string>;
};

const handleProcessData = async (data: string, pivot: string, aggregationMap: string): Promise<IResponse<string>> => {
    return (await get_processed_data_async(data, pivot, aggregationMap)) as IResponse<string>;
};

// ============================================================================
// Message Router (Pure function - maps requests to handlers)
// ============================================================================

const handleMessage = async (message: WorkerMessage<WorkerRequest>): Promise<WorkerResponse> => {
    const { payload } = message;

    try {
        switch (payload.type) {
            case REQUEST_TYPE.INIT:
                await initializeWasm();
                return { type: RESPONSE_TYPE.INIT_SUCCESS };

            case REQUEST_TYPE.SEED: {
                const response = await handleSeed(payload.payload.bytes);
                return { type: RESPONSE_TYPE.SEED_SUCCESS, response };
            }

            case REQUEST_TYPE.GET_META_DATA: {
                const response = await handleGetMetaData();
                return { type: RESPONSE_TYPE.GET_META_DATA_SUCCESS, response };
            }

            case REQUEST_TYPE.GET_DATA: {
                const currentTime = performance.now();
                console.log(`[Worker] Query received at ${currentTime}`);

                const response = await handleGetData(payload.payload.queryJson);
                return { type: RESPONSE_TYPE.GET_DATA_SUCCESS, response };
            }

            case REQUEST_TYPE.GET_FILTER_OPTIONS: {
                const response = await handleGetFilterOptions(payload.payload.column);
                return { type: RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS, response };
            }

            case REQUEST_TYPE.GET_PROCESSED_DATA: {
                const response = await handleProcessData(payload.payload.data, payload.payload.pivot, payload.payload.aggregationMap);
                return { type: RESPONSE_TYPE.GET_FILTER_OPTIONS_SUCCESS, response };
            }

            default:
                throw new Error(`Unknown request type: ${(payload as any).type}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createErrorResponse(payload.type, errorMessage);
    }
};

// ============================================================================
// Worker Event Listener
// ============================================================================

self.addEventListener('message', async (event: MessageEvent<WorkerMessage<WorkerRequest>>) => {
    const message = event.data;

    try {
        const response = await handleMessage(message);

        // Send response back to main thread
        const responseMessage: WorkerMessage<WorkerResponse> = {
            id: message.id,
            payload: response,
        };

        // Extract transferables using pure function
        const transferables = extractTransferables(response);

        // Post with zero-copy transfer if applicable
        if (transferables.length > 0) {
            self.postMessage(responseMessage, { transfer: transferables });
        } else {
            self.postMessage(responseMessage);
        }
    } catch (error) {
        // Fatal error in message handling itself
        const errorMessage = error instanceof Error ? error.message : 'Fatal worker error';
        console.error('[Worker] Fatal error:', errorMessage);

        const errorResponse: WorkerMessage<WorkerResponse> = {
            id: message.id,
            payload: {
                type: RESPONSE_TYPE.INIT_ERROR, // Generic error type
                error: errorMessage,
            },
        };

        self.postMessage(errorResponse);
    }
});

// Signal that worker is ready
console.log('[Worker] WASM Worker initialized and ready');
