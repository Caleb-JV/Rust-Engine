import { FileText, Loader2, CheckCircle2, XCircle, ZapIcon, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useStore } from '@/store/fieldsStore';
import { selectProcessingStatus } from '@/store/fieldsStore';

export const MainHeader = () => {
    // state
    const processingStatus = useStore(selectProcessingStatus);
    const tableRowCount = useStore((state) => state.tableRowCount);
    const fileName = useStore((state) => state.fileName);
    const latestTiming = useStore((state) => state.latestTiming);

    // handlers
    const getStatusBadge = () => {
        switch (processingStatus) {
            case 'loading':
                return (
                    <Badge variant="secondary" className="gap-1.5">
                        <span className="animate-spin">
                            <Loader2 className="h-3 w-3" />
                        </span>
                        Initializing...
                    </Badge>
                );
            case 'processing':
                return (
                    <Badge variant="warning" className="gap-1.5">
                        <span className="animate-spin">
                            <Loader2 className="h-3 w-3" />
                        </span>
                        Processing
                    </Badge>
                );
            case 'success':
                return (
                    <Badge variant="success" className="gap-1.5">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                    </Badge>
                );
            case 'error':
                return (
                    <Badge variant="destructive" className="gap-1.5">
                        <XCircle className="h-3 w-3" />
                        Error
                    </Badge>
                );
            default:
                return null;
        }
    };

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="flex h-16 items-center justify-between px-6">
                {/* Left side - Logo and Title */}
                <div className="flex items-center gap-2">
                    <ZapIcon className="h-6 w-6 text-primary" />
                    <h1 className="text-xl font-bold tracking-tight">Blaze Engine</h1>
                </div>

                {/* Right side - Status and Info */}
                <div className="flex items-end gap-4">
                    {fileName && (
                        <>
                            <div className="flex items-center gap-2 text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium max-w-64 overflow-hidden text-ellipsis">{fileName}</span>
                            </div>
                            <Separator orientation="vertical" className="h-6" />
                        </>
                    )}

                    {latestTiming && (
                        <>
                            <Badge variant="outline" className="gap-1.5 px-3">
                                <Timer className="h-3 w-3" />
                                <span className="text-xs">{latestTiming.operation}</span>
                                <span className="font-mono text-xs font-semibold">{latestTiming.duration_ms.toFixed(2)}s</span>
                            </Badge>
                            <Separator orientation="vertical" className="h-6" />
                        </>
                    )}

                    {tableRowCount && tableRowCount > 0 && (
                        <>
                            <div className="text-sm">
                                <span className="text-muted-foreground">Rows:</span>{' '}
                                <span className="font-semibold">{tableRowCount.toLocaleString()}</span>
                            </div>
                            <Separator orientation="vertical" className="h-6" />
                        </>
                    )}

                    {getStatusBadge()}
                </div>
            </div>
        </header>
    );
};
