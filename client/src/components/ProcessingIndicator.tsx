import { Loader2 } from 'lucide-react';
import { useStore, selectProcessingStatus } from '../store/fieldsStore';

/**
 * Smooth rotating loader that demonstrates UI remains responsive
 * during heavy WASM operations running in Web Worker
 */
export const ProcessingIndicator = () => {
    const processingStatus = useStore(selectProcessingStatus);
    const latestTiming = useStore((state) => state.latestTiming);

    const isProcessing = processingStatus === 'loading' || processingStatus === 'processing';

    if (!isProcessing) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="bg-background border border-border rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[280px]">
                {/* Smooth rotating icon - if this stutters, UI is freezing */}
                <Loader2 className="h-5 w-5 animate-spin text-primary" />

                <div className="flex-1">
                    <div className="text-sm font-medium">{processingStatus === 'loading' ? 'Loading...' : 'Processing...'}</div>
                    {latestTiming && <div className="text-xs text-muted-foreground">{latestTiming.operation}</div>}
                </div>

                {/* Animated progress bar */}
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary animate-pulse"
                        style={{
                            animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                    />
                </div>
            </div>

            {/* Tooltip explaining the smooth animation */}
            <div className="mt-2 text-xs text-center text-muted-foreground">✨ Smooth rotation = No UI freezes</div>
        </div>
    );
};
