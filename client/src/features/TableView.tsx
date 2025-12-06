import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { dataService } from '../services/dataService';
import { useAppStore, selectProcessingStatus, selectLoadingProgress, selectUIOptions } from '../store/appStore';
import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { millify } from 'millify';
import FileUploader from './Header/FileUploader';
import { DataToWasmAnimation } from '@/components/dataToWasm';

export const TableView = () => {
    const processingStatus = useAppStore(selectProcessingStatus);
    const tableRenderCounter = useAppStore((state) => state.tableRenderCounter);
    const { formatValues } = useAppStore(selectUIOptions);
    const isStreaming = useAppStore((state) => state.isStreaming);
    const loadingProgress = useAppStore(selectLoadingProgress);

    const parentRef = useRef<HTMLDivElement | null>(null);
    const headerRowRef = useRef<HTMLDivElement | null>(null);

    const tableMetadata = useMemo(() => {
        return {
            rowCount: dataService.getRowCount(),
            columns: dataService.getColumnNames(),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableRenderCounter]);

    const rowVirtualizer = useVirtualizer({
        count: tableMetadata.rowCount,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 40,
        overscan: 40,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    console.log(`[TableView] Rendering ${virtualItems.length} rows out of ${tableMetadata.rowCount} total rows`);

    // paint
    if (processingStatus === 'idle') return <FileUploader />;
    if (isStreaming || processingStatus === 'loading') {
        return <DataToWasmAnimation active={true} progress={loadingProgress} context={processingStatus === 'loading' ? 'generating' : ''} />;
    }

    return (
        <div className="grid grid-rows-[auto_1fr] overflow-hidden p-4 h-full pt-2">
            <CardHeader className="px-0 py-3 flex flex-row items-center justify-between">
                <div className="text-[15px] font-semibold mb-0">Table View</div>
                <p className="text-xs text-muted-foreground">
                    {tableMetadata.rowCount.toLocaleString()} rows × {tableMetadata.columns.length} columns
                </p>
            </CardHeader>

            <Card className="h-full flex flex-col rounded-sm shadow-none overflow-y-scroll">
                <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                    {/* Single scroll container for both vertical & horizontal */}
                    <div ref={parentRef} className="flex-1 overflow-auto">
                        <div className="min-w-full">
                            {/* Sticky header */}
                            <div className="flex sticky top-0 z-20" ref={headerRowRef}>
                                {tableMetadata.columns.map((col) => (
                                    <div
                                        key={col}
                                        className="px-4 py-3 text-sm text-left border-b bg-muted font-semibold text-foreground flex-none"
                                        style={{
                                            minWidth: '150px',
                                            maxWidth: '150px',
                                            width: '150px',
                                        }}
                                    >
                                        <span className="truncate block">{col}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Virtualized rows */}
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    position: 'relative',
                                    width: '100%',
                                }}
                            >
                                {virtualItems.map((virtualRow) => {
                                    const index = virtualRow.index;
                                    // const isEven = index % 2 === 0;

                                    return (
                                        <div
                                            key={virtualRow.key}
                                            ref={rowVirtualizer.measureElement}
                                            data-index={virtualRow.index}
                                            className="absolute top-0 left-0 right-0"
                                            style={{
                                                transform: `translateY(${virtualRow.start}px)`,
                                                height: `${virtualRow.size}px`,
                                            }}
                                        >
                                            <div className="flex h-full group">
                                                {tableMetadata.columns.map((col) => {
                                                    const value = dataService.getCell(index, col);
                                                    return (
                                                        <div
                                                            key={col}
                                                            className="px-4 py-2 text-[13px] text-foreground border-b flex-none w-[150px] flex items-center group-hover:bg-muted/50 transition-colors"
                                                            style={{
                                                                minWidth: '150px',
                                                                maxWidth: '150px',
                                                                // backgroundColor: isEven ? 'var(--color-background)' : 'var(--color-muted)',
                                                            }}
                                                        >
                                                            <span className="truncate w-full">
                                                                {value === null || value === undefined ? (
                                                                    <span className="text-muted-foreground italic">null</span>
                                                                ) : typeof value === 'number' ? (
                                                                    // Numeric branch
                                                                    formatValues && Math.abs(value) >= 10000 ? (
                                                                        millify(value, { precision: 2 })
                                                                    ) : (
                                                                        value.toFixed(0)
                                                                    )
                                                                ) : (
                                                                    // Non-number fallback
                                                                    String(value)
                                                                )}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
