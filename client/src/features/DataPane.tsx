import { useRef, useState } from 'react';
import { Upload, ChevronLeft, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldSearch } from '@/components/FieldSearch';
import { FieldsKeeperRootBucket } from 'react-fields-keeper';
import { useStore, selectDataPaneCollapsed, selectProcessingStatus } from '@/store/fieldsStore';
import { dataService } from '@/services/dataService';
import { CollapsedPaneComponent, PanelHeader } from '@/components/PaneChrome';
import { PANEL_WIDTH } from '@/lib/common.constants';

export const DataPane = () => {
    // state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const processingStatus = useStore(selectProcessingStatus);
    const isCollapsed = useStore(selectDataPaneCollapsed);

    // dispatch
    const setIsCollapsed = useStore((state) => state.setDataPaneCollapsed);
    const setFileName = useStore((state) => state.setFileName);

    // compute
    const metadata = dataService.getMetadata();
    const hasData = metadata !== null;
    const isLoading = processingStatus === 'loading' || processingStatus === 'processing';

    // handlers
    const handleUseAllData = async () => {
        await dataService.useAllData();
    };

    const handleClearData = () => {
        dataService.clearAllData();
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await dataService.processFile(file);
            setFileName(file.name);
        }
    };

    // paint
    if (isCollapsed)
        return <CollapsedPaneComponent label="Data" onExpand={() => setIsCollapsed(false)} icon={<ChevronLeft className="h-4 w-4 rotate-180" />} />;

    if (processingStatus === 'idle') {
        return (
            <div className="flex flex-col border-r bg-background" style={{ width: PANEL_WIDTH }}>
                <PanelHeader title="Data" onCollapse={() => setIsCollapsed(true)}>
                    {metadata && <p className="text-xs text-muted-foreground">{metadata.column_count} fields</p>}
                </PanelHeader>

                <div className="text-center h-full flex flex-col gap-1 items-center justify-center">
                    <p className="text-md font-semibold mb-2 text-foreground/70">No Data</p>
                    <p className="text-[13px] text-foreground/60">Upload a CSV file to pivot</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col border-r bg-background" style={{ width: PANEL_WIDTH }}>
            <PanelHeader title="Data" onCollapse={() => setIsCollapsed(true)}>
                {metadata && (
                    <p className="text-xs text-muted-foreground pt-0.5 pr-1">
                        {metadata.row_count} rows x {metadata.column_count} cols
                    </p>
                )}
            </PanelHeader>

            {/* Action Buttons */}
            {hasData && (
                <div className="p-3 border-b space-y-2 grid grid-cols-2 gap-2">
                    <Button variant="default" size="sm" onClick={handleUseAllData} disabled={isLoading} className="w-full shadow-none">
                        <Sparkles className="h-3 w-3 size-3.5!" />
                        All Data
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClearData} disabled={isLoading} className="w-full shadow-none">
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear Data
                    </Button>
                </div>
            )}

            <div className="p-3 pb-0">
                <FieldSearch value={searchQuery} onChange={setSearchQuery} />
            </div>

            <div className="flex-1 overflow-y-auto p-3 pt-2 pl-0">
                <FieldsKeeperRootBucket
                    instanceId={'pivot'}
                    prefixNode={{ allow: true, reserveSpace: false }}
                    customSearchQuery={searchQuery}
                    emptyFilterMessage="No fields found"
                />
            </div>

            <div className="p-3 border-t">
                <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isLoading} className="w-full">
                    <Upload className="h-3.5 w-3.5 mr-2" />
                    Load New File
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv, .parquet" onChange={handleFileChange} className="hidden" />
            </div>
        </div>
    );
};
