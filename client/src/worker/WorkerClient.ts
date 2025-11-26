/**
 * Type-safe client for communicating with the WASM Worker
 *
 * Provides a clean async API that mirrors the original WASM interface,
 * but executes all operations in a Web Worker to prevent UI freezes.
 *
 * Features:
 * - Automatic request/response correlation via unique IDs
 * - Promise-based async API
 * - Zero-copy transfers for large data (Uint8Array)
 * - Proper error propagation
 * - Type-safe request/response handling
 */

import type { WorkerMessage, WorkerRequest, WorkerResponse, IResponse, ExtractResponseType, IPendingRequest } from './types';
import { REQUEST_TYPE, RESPONSE_TYPE, createRequestId, isSuccessResponse, isErrorResponse } from './types';

// ============================================================================
// Worker Client
// ============================================================================

export class WorkerClient {
    private worker: Worker;
    private pendingRequests = new Map<string, IPendingRequest>();
    private requestIdCounter = 0;

    constructor() {
        // Create worker instance
        this.worker = new Worker(new URL('./WorkerManagers.ts', import.meta.url), {
            type: 'module',
        });

        // Set up message listener
        this.worker.addEventListener('message', this.handleMessage.bind(this));
        this.worker.addEventListener('error', this.handleError.bind(this));
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return createRequestId(++this.requestIdCounter);
    }

    /**
     * Send request to worker and wait for response
     */
    private async sendRequest<T extends WorkerRequest['type']>(
        request: WorkerRequest,
        transferables?: Transferable[],
    ): Promise<ExtractResponseType<T>> {
        const id = this.generateRequestId();

        const message: WorkerMessage<WorkerRequest> = {
            id,
            payload: request,
        };

        // Create promise that will be resolved when response arrives
        const promise = new Promise<ExtractResponseType<T>>((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
        });

        // Send message to worker
        this.worker.postMessage(message, transferables || []);

        return promise;
    }

    /**
     * Handle incoming messages from worker
     */
    private handleMessage(event: MessageEvent<WorkerMessage<WorkerResponse>>): void {
        const { id, payload } = event.data;

        const pending = this.pendingRequests.get(id);
        if (!pending) {
            console.warn('[WorkerClient] Received response for unknown request:', id);
            return;
        }

        // Remove from pending
        this.pendingRequests.delete(id);

        // Handle response based on type using pure functions
        if (isSuccessResponse(payload.type)) {
            // Success responses
            if (payload.type === RESPONSE_TYPE.INIT_SUCCESS) {
                pending.resolve(undefined);
            } else if ('response' in payload) {
                pending.resolve(payload.response);
            }
        } else if (isErrorResponse(payload.type)) {
            // Error responses
            if ('error' in payload) {
                pending.reject(new Error(payload.error));
            }
        } else {
            pending.reject(new Error(`Unknown response type: ${payload.type}`));
        }
    }

    /**
     * Handle worker errors
     */
    private handleError(event: ErrorEvent): void {
        console.error('[WorkerClient] Worker error:', event.error);

        // Reject all pending requests
        this.pendingRequests.forEach(({ reject }) => {
            reject(new Error(`Worker error: ${event.message}`));
        });
        this.pendingRequests.clear();
    }

    // ========================================================================
    // Public API - mirrors the WASM interface
    // ========================================================================

    /**
     * Initialize WASM module in worker
     */
    async init(): Promise<void> {
        return this.sendRequest<typeof REQUEST_TYPE.INIT>({ type: REQUEST_TYPE.INIT });
    }

    /**
     * Seed data into Rust
     */
    async seed(bytes: Uint8Array): Promise<IResponse<null>> {
        // Transfer the Uint8Array buffer for zero-copy performance
        const transferables = [bytes.buffer];
        return this.sendRequest<typeof REQUEST_TYPE.SEED>({ type: REQUEST_TYPE.SEED, payload: { bytes } }, transferables);
    }

    /**
     * Get metadata from Rust
     */
    async getMetaData(): Promise<IResponse<string>> {
        return this.sendRequest<typeof REQUEST_TYPE.GET_META_DATA>({ type: REQUEST_TYPE.GET_META_DATA });
    }

    /**
     * Get data with query
     */
    async getData(queryJson: string): Promise<IResponse<Uint8Array>> {
        return this.sendRequest<typeof REQUEST_TYPE.GET_DATA>({
            type: REQUEST_TYPE.GET_DATA,
            payload: { queryJson },
        });
    }

    /**
     * Get filter options for a column
     */
    async getFilterOptions(column: string): Promise<IResponse<string>> {
        return this.sendRequest<typeof REQUEST_TYPE.GET_FILTER_OPTIONS>({
            type: REQUEST_TYPE.GET_FILTER_OPTIONS,
            payload: { column },
        });
    }

    /**
     * Get data with query
     */
    async getProcessedData(data: string, pivot: string, aggregationMap: string): Promise<IResponse<string>> {
        return this.sendRequest<typeof REQUEST_TYPE.GET_PROCESSED_DATA>({
            type: REQUEST_TYPE.GET_PROCESSED_DATA,
            payload: { data, pivot, aggregationMap },
        });
    }

    /**
     * Terminate the worker
     */
    terminate(): void {
        this.worker.terminate();
        this.pendingRequests.clear();
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let workerClientInstance: WorkerClient | null = null;

export function getWorkerClient(): WorkerClient {
    if (!workerClientInstance) {
        workerClientInstance = new WorkerClient();
    }
    return workerClientInstance;
}

export function terminateWorkerClient(): void {
    if (workerClientInstance) {
        workerClientInstance.terminate();
        workerClientInstance = null;
    }
}
