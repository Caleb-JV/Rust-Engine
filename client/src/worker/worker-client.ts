export class WorkerClient {
    private worker: Worker;
    private callbacks = new Map();

    constructor() {
        this.worker = new Worker(new URL('./data-worker.ts', import.meta.url), { type: 'module' });

        this.worker.onmessage = (e) => {
            const { id, success, data, error, progress } = e.data;
            const cb = this.callbacks.get(id);
            if (!cb) return;

            // Handle progress updates
            if (progress && cb.onProgress) {
                cb.onProgress(data);
                return; // Don't resolve/reject yet
            }

            if (success) cb.resolve(data);
            else cb.reject(error);
            this.callbacks.delete(id);
        };
    }

    private call(type: string, payload?: any, onProgress?: (data: any) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            this.callbacks.set(id, { resolve, reject, onProgress });
            this.worker.postMessage({ id, type, payload });
        });
    }

    processFile(file: File, onProgress?: (progress: { percent: number; bytesProcessed: number; totalBytes: number }) => void) {
        return this.call('processFile', file, onProgress);
    }

    getData(query: any) {
        return this.call('getData', query);
    }

    getFilterOptions(column: string) {
        return this.call('getFilterOptions', column);
    }
}

export const workerClient = new WorkerClient();
