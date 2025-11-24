/// <reference lib="webworker" />
import { tableFromIPC } from 'apache-arrow';
import init, {
    seed,
    seed_start,
    seed_chunk,
    seed_finalize,
    get_meta_data,
    get_data_async,
    get_filter_options_async,
    get_timing_log,
    clear_timing_log,
} from '../wasm/package/rust_core';

let isInitialized = false;

async function ensureInit() {
    if (!isInitialized) {
        await init();
        isInitialized = true;
    }
}

function getTimings() {
    try {
        const logs = get_timing_log();
        clear_timing_log();
        return logs ?? [];
    } catch {
        return [];
    }
}

/**
 * Stream a file in chunks to WASM for memory-efficient processing
 */
async function streamFileToWasm(file: File, onProgress?: (percent: number, bytesProcessed: number) => void) {
    const CHUNK_SIZE = 512 * 1024; // 512KB chunks for better line boundary handling
    const totalSize = file.size;
    let offset = 0;
    let lineBuffer = '';
    let isFirstChunk = true;
    let headerProcessed = false;

    try {
        while (offset < totalSize) {
            // Read chunk
            const end = Math.min(offset + CHUNK_SIZE, totalSize);
            const blob = file.slice(offset, end);
            const arrayBuffer = await blob.arrayBuffer();
            const text = new TextDecoder().decode(arrayBuffer);

            // Add to buffer
            lineBuffer += text;

            // Split into lines
            const lines = lineBuffer.split('\n');

            // Keep the last incomplete line in buffer (unless we're at EOF)
            const isLastChunk = end >= totalSize;
            if (!isLastChunk) {
                lineBuffer = lines.pop() || '';
            } else {
                lineBuffer = '';
            }

            // Process complete lines
            if (lines.length > 0) {
                // Rejoin lines with newlines
                const completeText = lines.join('\n') + (isLastChunk && lines[lines.length - 1] !== '' ? '' : '\n');
                const chunkBytes = new TextEncoder().encode(completeText);

                if (!headerProcessed) {
                    // First chunk: initialize with header
                    seed_start(chunkBytes);
                    headerProcessed = true;
                    isFirstChunk = false;
                } else {
                    // Subsequent chunks: append data (no header in these chunks)
                    seed_chunk(chunkBytes, false);
                }
            }

            offset = end;

            // Report progress
            if (onProgress) {
                const percent = (offset / totalSize) * 100;
                onProgress(percent, offset);
            }
        }

        // Finalize
        const totalRows = seed_finalize();
        return totalRows;
    } catch (error) {
        throw error;
    }
}

self.onmessage = async (e) => {
    const { id, type, payload } = e.data;

    try {
        await ensureInit();

        if (type === 'processFile') {
            const file = payload as File;
            const useStreaming = file.size > 5 * 1024 * 1024; // Use streaming for files > 5MB

            if (useStreaming) {
                // Stream processing for large files
                await streamFileToWasm(file, (percent, bytesProcessed) => {
                    // Send progress updates
                    self.postMessage({
                        id,
                        success: true,
                        progress: true,
                        data: {
                            percent: Math.round(percent),
                            bytesProcessed,
                            totalBytes: file.size,
                        },
                    });
                });
            } else {
                // Original method for small files
                const bytes = new Uint8Array(await file.arrayBuffer());
                seed(bytes);
            }

            const timing = getTimings();
            const metadataJson = get_meta_data();
            const metadata = JSON.parse(metadataJson);

            self.postMessage({ id, success: true, data: { metadata, timing } });
            return;
        }

        if (type === 'getData') {
            const json = JSON.stringify(payload);
            const arr = await get_data_async(json);
            const timing = getTimings();

            const table = tableFromIPC(arr);
            const columns = table.schema.fields.map((f) => f.name);

            const rows = [];
            for (let i = 0; i < table.numRows; i++) {
                const r: any = {};
                for (const c of columns) {
                    const col = table.getChild(c);
                    r[c] = col?.get(i) ?? null;
                }
                rows.push(r);
            }

            self.postMessage({
                id,
                success: true,
                data: { rows, columns, timing },
            });
            return;
        }

        if (type === 'getFilterOptions') {
            const raw = await get_filter_options_async(payload);
            const timing = getTimings();
            self.postMessage({
                id,
                success: true,
                data: { options: JSON.parse(raw), timing },
            });
            return;
        }
    } catch (err: any) {
        self.postMessage({
            id,
            success: false,
            error: err.message ?? 'Unknown error',
        });
    }
};
