/**
 * Type-safe client for communicating with the WASM Worker
 */

import type {
    WorkerMessage,
    WorkerRequest,
    WorkerResponse,
    IResponse,
    ExtractResponseType,
    IPendingRequest,
    IProcessFileProgress,
    IProcessFileResult,
} from './types';
import { REQUEST_TYPE, RESPONSE_TYPE, createRequestId, isSuccessResponse, isErrorResponse, isProgressResponse } from './types';

// Extend pending request type to include onProgress
type PendingRequest = IPendingRequest & {
    onProgress?: (data: any) => void;
};

// ============================================================================
// Worker Client
// ============================================================================
export class WorkerClient {
    private worker: Worker;
    private pendingRequests = new Map<string, PendingRequest>();
    private requestIdCounter = 0;

    constructor() {
        this.worker = new Worker(new URL('./WorkerManagers.ts', import.meta.url), {
            type: 'module',
        });

        this.worker.addEventListener('message', this.handleMessage.bind(this));
        this.worker.addEventListener('error', this.handleError.bind(this));
    }

    /** Generate unique request ID */
    private generateRequestId(): string {
        return createRequestId(++this.requestIdCounter);
    }

    /** Send request to worker and wait for response */
    private async sendRequest<T extends WorkerRequest['type']>(
        request: WorkerRequest,
        options?: {
            transferables?: Transferable[];
            onProgress?: (data: any) => void;
        },
    ): Promise<ExtractResponseType<T>> {
        const id = this.generateRequestId();

        const message: WorkerMessage<WorkerRequest> = {
            id,
            payload: request,
        };

        const promise = new Promise<ExtractResponseType<T>>((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject, onProgress: options?.onProgress });
        });

        this.worker.postMessage(message, options?.transferables || []);

        return promise;
    }

    /** Handle incoming messages from worker */
    private handleMessage(event: MessageEvent<WorkerMessage<WorkerResponse>>): void {
        const { id, payload } = event.data;
        const pending = this.pendingRequests.get(id);

        if (!pending) {
            console.warn('[WorkerClient] Received response for unknown request:', id);
            return;
        }

        // Handle progress responses: don't resolve/reject yet
        if (isProgressResponse(payload.type)) {
            if (pending.onProgress && 'data' in payload) {
                pending.onProgress(payload.data);
            }
            return;
        }

        // Final responses
        this.pendingRequests.delete(id);

        if (isSuccessResponse(payload.type)) {
            if (payload.type === RESPONSE_TYPE.INIT_SUCCESS) {
                pending.resolve(undefined as any);
            } else if ('response' in payload) {
                pending.resolve(payload.response as any);
            }
        } else if (isErrorResponse(payload.type)) {
            if ('error' in payload) {
                pending.reject(new Error(payload.error));
            } else {
                pending.reject(new Error('Unknown worker error'));
            }
        } else {
            pending.reject(new Error(`Unknown response type: ${payload.type}`));
        }
    }

    /** Handle worker errors */
    private handleError(event: ErrorEvent): void {
        console.error('[WorkerClient] Worker error:', event.error);
        this.pendingRequests.forEach(({ reject }) => {
            reject(new Error(`Worker error: ${event.message}`));
        });
        this.pendingRequests.clear();
    }

    // ========================================================================
    // Public API - mirrors the WASM interface
    // ========================================================================

    async init(): Promise<void> {
        return this.sendRequest<typeof REQUEST_TYPE.INIT>({ type: REQUEST_TYPE.INIT });
    }

    async seed(bytes: Uint8Array): Promise<IResponse<null>> {
        const transferables = [bytes.buffer];
        return this.sendRequest<typeof REQUEST_TYPE.SEED>({ type: REQUEST_TYPE.SEED, payload: { bytes } }, { transferables });
    }

    async getMetaData(): Promise<IResponse<string>> {
        return this.sendRequest<typeof REQUEST_TYPE.GET_META_DATA>({
            type: REQUEST_TYPE.GET_META_DATA,
        });
    }

    async getData(queryJson: string): Promise<IResponse<Uint8Array>> {
        return this.sendRequest<typeof REQUEST_TYPE.GET_DATA>({
            type: REQUEST_TYPE.GET_DATA,
            payload: { queryJson },
        });
    }

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
     * NEW: Process a File using streaming + progress
     */
    async processFile(file: File, onProgress?: (progress: IProcessFileProgress) => void): Promise<IResponse<IProcessFileResult>> {
        return this.sendRequest<typeof REQUEST_TYPE.PROCESS_FILE>(
            {
                type: REQUEST_TYPE.PROCESS_FILE,
                payload: { file },
            },
            {
                onProgress,
            },
        );
    }

    terminate(): void {
        this.worker.terminate();
        this.pendingRequests.clear();
    }
}

// Singleton instance
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
