/**
 * Web Worker for Rust WASM operations
 */

import init, {
    seed_async,
    get_meta_data_async,
    get_data_async,
    get_filter_options_async,
    // NEW streaming + timing exports
    seed_start,
    seed_chunk,
    seed_finalize,
    get_timing_log,
    clear_timing_log,
    // Memory usage
    get_memory_usage,
    // Sample data generation
    generate_and_seed_sample_data,
} from '../wasm/package/rust_core';

import type { WorkerMessage, WorkerRequest, WorkerResponse, IResponse, IProcessFileProgress, IProcessFileResult } from './types';
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
// Timing helpers
// ============================================================================
function getTimings(): string[] {
    try {
        const logs = get_timing_log();
        clear_timing_log();
        return logs ?? [];
    } catch {
        return [];
    }
}

// ============================================================================
// Streaming helpers
// ============================================================================

/**
 * Stream a file in chunks to WASM for memory-efficient processing
 * Ensures CSV rows are complete and properly handles headers
 */
async function streamFileToWasm(file: File, onProgress?: (progress: IProcessFileProgress) => void): Promise<number> {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 1MB chunks
    const totalSize = file.size;
    let offset = 0;
    let lineBuffer = '';
    let isFirstChunk = true;

    while (offset < totalSize) {
        const end = Math.min(offset + CHUNK_SIZE, totalSize);
        const blob = file.slice(offset, end);
        const arrayBuffer = await blob.arrayBuffer();
        const text = new TextDecoder().decode(arrayBuffer);

        // Append to buffer
        lineBuffer += text;

        // Split into lines
        const lines = lineBuffer.split('\n');
        const isLastChunk = end >= totalSize;

        // Keep the last (possibly incomplete) line for the next chunk
        // unless it's the final chunk
        if (!isLastChunk && lines.length > 0) {
            lineBuffer = lines.pop() || '';
        } else {
            lineBuffer = '';
        }

        // Process complete lines
        if (lines.length > 0) {
            // Filter out empty lines at the end, but preserve the structure
            const processedLines = isLastChunk ? lines.filter((line, idx) => idx === 0 || line.trim() !== '') : lines;

            if (processedLines.length > 0) {
                const completeText = processedLines.join('\n') + '\n';
                const chunkBytes = new TextEncoder().encode(completeText);

                if (isFirstChunk) {
                    // First chunk: includes header, initialize schema
                    seed_start(chunkBytes);
                    isFirstChunk = false;
                } else {
                    // Subsequent chunks: no header (data rows only)
                    seed_chunk(chunkBytes, false);
                }
            }
        }

        offset = end;

        // Report progress
        if (onProgress) {
            onProgress({
                percent: (offset / totalSize) * 100,
                bytesProcessed: offset,
                totalBytes: totalSize,
            });
        }
    }

    // Finalize and get total row count
    const totalRows = seed_finalize();
    return totalRows;
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

const handleGetData = async (queryJson: string): Promise<IResponse<{ columns: unknown[]; rowCount: number }>> => {
    const result = await get_data_async(queryJson);

    // Convert ArrayBuffers to proper typed arrays for transfer
    if (result.success && result.data?.columns) {
        for (const col of result.data.columns) {
            if (col.values instanceof ArrayBuffer) {
                switch (col.dataType) {
                    case 'int32':
                    case 'date32':
                        col.values = new Int32Array(col.values);
                        break;
                    case 'int64':
                    case 'date64':
                        col.values = new BigInt64Array(col.values);
                        break;
                    case 'float64':
                        col.values = new Float64Array(col.values);
                        break;
                    case 'bool':
                    case 'utf8':
                        col.values = new Uint8Array(col.values);
                        break;
                }
            }

            // Convert offsets ArrayBuffer to Int32Array for utf8
            if (col.offsets instanceof ArrayBuffer) {
                col.offsets = new Int32Array(col.offsets);
            }
        }
    }

    return result as IResponse<{ columns: unknown[]; rowCount: number }>;
};

const handleGetFilterOptions = async (column: string): Promise<IResponse<string>> => {
    return (await get_filter_options_async(column)) as IResponse<string>;
};

const handleGetMemoryUsage = (): IResponse<number> => {
    const startTime = performance.now();

    // Check if WASM is initialized before calling memory function
    if (!isInitialized) {
        return {
            success: true,
            message: 'WASM not initialized',
            data: 0,
            timeTaken: 0,
        };
    }

    const memoryBytes = get_memory_usage();
    const endTime = performance.now();

    return {
        success: true,
        message: '',
        data: memoryBytes,
        timeTaken: endTime - startTime,
    };
};

// ============================================================================
// Message Router
// ============================================================================
const handleMessage = async (message: WorkerMessage<WorkerRequest>): Promise<WorkerResponse> => {
    const { payload } = message;

    try {
        switch (payload.type) {
            case REQUEST_TYPE.INIT: {
                await initializeWasm();
                return { type: RESPONSE_TYPE.INIT_SUCCESS };
            }

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

            case REQUEST_TYPE.GET_MEMORY_USAGE: {
                const response = handleGetMemoryUsage();
                return { type: RESPONSE_TYPE.GET_MEMORY_USAGE_SUCCESS, response };
            }

            case REQUEST_TYPE.GENERATE_SAMPLE_DATA: {
                await initializeWasm(); // Ensure WASM is initialized

                const startTime = performance.now();
                const { rowCount, seed } = payload.payload;

                console.log(`[Worker] Generating ${rowCount.toLocaleString()} rows of sample data...`);
                const totalRows = generate_and_seed_sample_data(rowCount, seed);

                const endTime = performance.now();
                const timeTaken = endTime - startTime;

                console.log(`[Worker] Generated ${totalRows.toLocaleString()} rows in ${timeTaken.toFixed(2)}ms`);

                const response: IResponse<number> = {
                    success: true,
                    message: `Generated ${totalRows.toLocaleString()} rows`,
                    data: totalRows,
                    timeTaken,
                };

                return { type: RESPONSE_TYPE.GENERATE_SAMPLE_DATA_SUCCESS, response };
            }

            // NEW: processFile with streaming + progress
            case REQUEST_TYPE.PROCESS_FILE: {
                const startTime = performance.now();
                const file = payload.payload.file as File;
                const useStreaming = file.size > 5 * 1024 * 1024; // > 5MB => stream

                if (useStreaming) {
                    // Stream and emit progress events
                    await streamFileToWasm(file, (progress) => {
                        const progressMessage: WorkerMessage<WorkerResponse> = {
                            id: message.id,
                            payload: {
                                type: RESPONSE_TYPE.PROCESS_FILE_PROGRESS,
                                data: {
                                    percent: Math.round(progress.percent),
                                    bytesProcessed: progress.bytesProcessed,
                                    totalBytes: progress.totalBytes,
                                },
                            } as WorkerResponse,
                        };

                        self.postMessage(progressMessage);
                    });
                } else {
                    // Small file: read into memory and use existing async seed
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    await handleSeed(bytes);
                }

                const timing = getTimings();
                const metadataResponse = await handleGetMetaData();

                const endTime = performance.now();
                const totalTimeTaken = endTime - startTime;

                const result: IProcessFileResult = {
                    metadataJson: metadataResponse.data, // Extract the actual JSON string from IResponse
                    timing,
                };

                const response: IResponse<IProcessFileResult> = {
                    success: true,
                    message: '',
                    data: result,
                    timeTaken: totalTimeTaken,
                };

                return {
                    type: RESPONSE_TYPE.PROCESS_FILE_SUCCESS,
                    response,
                };
            }

            default:
                throw new Error(`Unknown request type: ${(payload as WorkerRequest).type}`);
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

        // Some requests (PROCESS_FILE) might already have sent intermediate
        // progress messages before this final response.

        const responseMessage: WorkerMessage<WorkerResponse> = {
            id: message.id,
            payload: response,
        };

        const transferables = extractTransferables(response);

        if (transferables.length > 0) {
            self.postMessage(responseMessage, { transfer: transferables });
        } else {
            self.postMessage(responseMessage);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Fatal worker error';
        console.error('[Worker] Fatal error:', errorMessage);

        const errorResponse: WorkerMessage<WorkerResponse> = {
            id: message.id,
            payload: {
                type: RESPONSE_TYPE.INIT_ERROR,
                error: errorMessage,
            },
        };

        self.postMessage(errorResponse);
    }
});

// Signal that worker is ready
console.log('[Worker] WASM Worker initialized and ready');
