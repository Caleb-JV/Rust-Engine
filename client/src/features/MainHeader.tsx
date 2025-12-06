import { FileText, Loader2, CheckCircle2, XCircle, ZapIcon, Timer, TrendingUp, Settings2, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/store/appStore';
import { selectProcessingStatus, selectAdditionalOptions, selectUIOptions } from '@/store/appStore';
import { useEffect } from 'react';
import { getWorkerClient } from '@/worker/WorkerClient';
import { formatMemory, getEstimatedJSTime } from '@/lib/data.utils';
import { dataService } from '@/services/dataService';

export const MainHeader = () => {
    // state
    const processingStatus = useAppStore(selectProcessingStatus);
    const { showSubtotal, multithreading } = useAppStore(selectAdditionalOptions);
    const { formatValues } = useAppStore(selectUIOptions);
    const tableRowCount = useAppStore((state) => state.tableRowCount);
    const tableColumnCount = useAppStore((state) => state.tableColumnCount);
    const fileName = useAppStore((state) => state.fileName);
    const latestTiming = useAppStore((state) => state.latestTiming);
    const memoryUsageBytes = useAppStore((state) => state.memoryUsageBytes);
    const setMemoryUsage = useAppStore((state) => state.setMemoryUsage);

    // Poll memory usage every 2 seconds
    useEffect(() => {
        const pollMemory = async () => {
            try {
                const workerClient = getWorkerClient();
                const response = await workerClient.getMemoryUsage();
                if (response.success) {
                    setMemoryUsage(response.data);
                }
            } catch (error) {
                console.error('[MainHeader] Failed to get memory usage:', error);
            }
        };

        // Initial poll
        pollMemory();

        // Set up interval - poll more frequently during operations
        const interval = setInterval(pollMemory, processingStatus === 'processing' ? 500 : 2000);

        return () => clearInterval(interval);
    }, [processingStatus, setMemoryUsage]);

    // dispatch
    const setAdditionalOptions = useAppStore((state) => state.setAdditionalOptions);
    const setUIOptions = useAppStore((state) => state.setUIOptions);

    // Calculate estimated JS time
    const estimatedJSTime =
        latestTiming && tableRowCount && tableColumnCount
            ? getEstimatedJSTime(latestTiming.duration_ms, tableRowCount, tableColumnCount, latestTiming.operation)
            : null;

    // handlers
    const handleSubtotalToggle = (value: boolean) => {
        setAdditionalOptions({ showSubtotal: value });
        dataService.getData();
    };

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

    // paint
    return (
        <header className=" w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="flex h-15 items-center justify-between px-6">
                {/* Left side - Logo and Title */}
                <div className="flex items-center gap-2">
                    <ZapIcon className="h-6 w-6 text-primary" />
                    <h1 className="text-xl font-bold tracking-tight">Blaze Engine</h1>
                </div>

                {/* Right side - Status, Info & Controls */}
                <div className="flex items-center gap-4">
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
                                <span className="font-mono text-xs font-semibold">{latestTiming.duration_ms.toFixed(2) ?? '—'}ms</span>
                                <span className="font-mono text-[10px] text-muted-foreground ml-1">
                                    ({(latestTiming.duration_ms / 1000).toFixed(2)}s)
                                </span>
                            </Badge>
                            {memoryUsageBytes && (
                                <>
                                    <Badge variant="outline" className="gap-1.5 px-3">
                                        <Database className="h-3 w-3" />
                                        <span className="text-xs">Memory</span>
                                        <span className="font-mono text-xs font-semibold text-green-500">{formatMemory(memoryUsageBytes)}</span>
                                    </Badge>
                                    <Separator orientation="vertical" className="h-6" />
                                </>
                            )}
                            {estimatedJSTime && (
                                <Badge variant="secondary" className="gap-1.5 px-3">
                                    <TrendingUp className="h-3 w-3" />
                                    <span className="text-xs">JS est.</span>
                                    <span className="font-mono text-xs font-semibold text-orange-600 dark:text-orange-400">
                                        ({(estimatedJSTime / 1000).toFixed(2)}s)
                                    </span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        (~{(estimatedJSTime / latestTiming.duration_ms).toFixed(1)}×)
                                    </span>
                                </Badge>
                            )}
                            <Separator orientation="vertical" className="h-6" />
                        </>
                    )}

                    <div className="flex items-center gap-4">
                        {getStatusBadge()}

                        <Separator orientation="vertical" className="h-6" />

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <Settings2 className="h-4 w-4" />
                                    <span className="sr-only">View options</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-52">
                                <DropdownMenuItem className="flex items-center justify-between gap-4 text-xs" onSelect={(e) => e.preventDefault()}>
                                    <span>Show Subtotal</span>
                                    <Switch checked={showSubtotal} onCheckedChange={handleSubtotalToggle} />
                                </DropdownMenuItem>

                                <DropdownMenuItem className="flex items-center justify-between gap-4 text-xs" onSelect={(e) => e.preventDefault()}>
                                    <span>Multithreading</span>
                                    <Switch checked={multithreading} onCheckedChange={(v) => setAdditionalOptions({ multithreading: Boolean(v) })} />
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem className="flex items-center justify-between gap-4 text-xs" onSelect={(e) => e.preventDefault()}>
                                    <span>Format Values</span>
                                    <Switch checked={formatValues} onCheckedChange={(v) => setUIOptions({ formatValues: Boolean(v) })} />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </header>
    );
};
