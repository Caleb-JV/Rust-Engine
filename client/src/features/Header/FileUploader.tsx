import React, { useRef, useState } from 'react';
import { selectProcessingStatus, useStore } from '@/store/fieldsStore';
import { dataService } from '@/services/dataService';
import { UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import { getWorkerClient } from '@/worker/WorkerClient';

export default function FileUploader() {
    // state
    const [isDragging, setIsDragging] = useState(false);
    const setFileName = useStore((state) => state.setFileName);
    const processingStatus = useStore(selectProcessingStatus);

    // ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (file && file.name.endsWith('.csv')) {
            await dataService.processFile(file);
            setFileName(file.name);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await dataService.processFile(file);
            setFileName(file.name);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleGenerateSampleData = async () => {
        try {
            const rowCount = 10_000_000; // 5 million rows
            const seed = BigInt(Date.now());

            useStore.getState().setProcessingStatus('loading');
            useStore.getState().setFileName('sample_data.csv');

            console.log(`🔨 Generating ${rowCount.toLocaleString()} rows of sample data...`);

            // Generate and seed the data via worker
            const workerClient = getWorkerClient();
            const response = await workerClient.generateSampleData(rowCount, seed);

            if (!response.success) {
                throw new Error(response.message || 'Failed to generate sample data');
            }

            console.log(`✅ Generated ${response.data.toLocaleString()} rows in ${response.timeTaken.toFixed(2)}ms`);

            // Trigger metadata refresh
            await dataService.refreshMetadata();

            useStore.getState().setProcessingStatus('success');
        } catch (error) {
            console.error('Failed to generate sample data:', error);
            useStore.getState().setProcessingStatus('error');
            useStore.getState().setFileName('');
        }
    };

    // compute
    const isLoading = processingStatus === 'loading' || processingStatus === 'processing';

    // paint
    return (
        <div className="relative flex flex-col p-5 bg-background" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            {/* Main Drop Zone */}
            <div
                className={`
                    flex-1 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white
                    transition-all overflow-hidden
                    ${isDragging ? 'border-primary bg-primary/5' : ''}
                `}
            >
                <div className={`flex flex-col items-center text-center px-6 py-10 gap-3 ${isDragging ? 'opacity-80' : ''}`}>
                    <div className="flex items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-md shadow-sm">
                            <UploadIcon className="h-6 w-6 text-gray-500" />
                        </div>
                    </div>

                    <p className="text-sm font-medium text-gray-700">Drag your file to start uploading</p>

                    {/* Divider with OR */}
                    <div className="flex items-center gap-3 w-full max-w-xs">
                        <span className="h-px flex-1 bg-gray-200" />
                        <span className="text-[11px] font-medium tracking-wide text-gray-500">OR</span>
                        <span className="h-px flex-1 bg-gray-200" />
                    </div>

                    <div className="flex flex-row gap-2">
                        <Button
                            onClick={handleUploadClick}
                            disabled={isLoading}
                            variant="outline"
                            className="mt-1 border-primary text-primary hover:bg-primary/5"
                        >
                            {isLoading ? 'Processing...' : 'Browse local file'}
                        </Button>

                        <Button onClick={handleGenerateSampleData} disabled={isLoading} variant="default" className="mt-1">
                            {isLoading ? 'Processing...' : 'Load sample data'}
                        </Button>
                    </div>

                    <input ref={fileInputRef} type="file" accept=".csv, .parquet" onChange={handleFileChange} className="hidden" />
                </div>
            </div>

            {/* Optional subtle focus ring while dragging */}
            {isDragging && <div className="pointer-events-none absolute inset-5 rounded-lg border-2 border-dashed border-primary/40" />}
        </div>
    );
}
