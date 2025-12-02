import { useRef, useState } from 'react';
import { Upload, ChevronLeft, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldsKeeperRootBucket, FieldsKeeperSearcher } from 'react-fields-keeper';
import { useStore, selectDataPaneCollapsed, selectProcessingStatus } from '@/store/fieldsStore';
import { dataService } from '@/services/dataService';
import { CollapsedPaneComponent, PanelHeader } from '@/components/PaneChrome';

export const DataPane = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    // Use store for state management
    const processingStatus = useStore(selectProcessingStatus);
    const isCollapsed = useStore(selectDataPaneCollapsed);
    const fileName = useStore((state) => state.fileName);
    const setIsCollapsed = useStore((state) => state.setDataPaneCollapsed);
    const setFileName = useStore((state) => state.setFileName);

    const metadata = dataService.getMetadata();
    const hasData = metadata !== null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await dataService.processFile(file);
            setFileName(file.name);
        }
    };

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

    const handleUseAllData = async () => {
        await dataService.useAllData();
    };

    const handleClearData = () => {
        dataService.clearAllData();
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const isLoading = processingStatus === 'loading' || processingStatus === 'processing';

    if (isCollapsed)
        return <CollapsedPaneComponent label="Data" onExpand={() => setIsCollapsed(false)} icon={<ChevronLeft className="h-4 w-4 rotate-180" />} />;

    if (!fileName) {
        return (
            <div
                className={`
                relative flex flex-col border-r transition-all
                bg-background
                ${isDragging ? 'outline-2 outline-primary/40 bg-primary/5' : ''}
            `}
                style={{ width: '280px' }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <PanelHeader title="Data" onCollapse={() => setIsCollapsed(true)} className="bg-background/80 backdrop-blur-sm px-4" />

                {/* Main Drop Zone */}
                <div
                    className={`
                    flex-1 flex items-center justify-center p-6 transition-all overflow-auto shrink-0
                    ${isDragging ? 'opacity-50' : ''}
                `}
                >
                    <div className="text-center">
                        <div className="rounded-full bg-primary/10 p-6 mb-4 inline-flex items-center justify-center shadow-sm">
                            <Upload className="h-10 w-10 text-primary" />
                        </div>

                        <p className="text-sm text-muted-foreground mb-3">Drag & drop a CSV file here</p>

                        <p className="text-xs text-muted-foreground mb-4">or</p>

                        <Button onClick={handleUploadClick} disabled={isLoading}>
                            {isLoading ? 'Processing...' : 'Select File'}
                        </Button>

                        <input ref={fileInputRef} type="file" accept=".csv , .parquet" onChange={handleFileChange} className="hidden" />
                    </div>
                </div>

                {/* Floating Drop Overlay (only when dragging) */}
                {isDragging && (
                    <div
                        className="absolute inset-4 border-2 border-dashed border-primary/60 rounded-lg
                    bg-primary/10 flex flex-col items-center justify-center pointer-events-none
                    shadow-lg animate-in fade-in-0 zoom-in-95"
                    >
                        <Upload className="h-12 w-12 text-primary mb-3" />
                        <p className="text-primary font-semibold text-sm">Drop your CSV file to upload</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col border-r bg-background" style={{ width: '280px' }}>
            <PanelHeader title="Data" onCollapse={() => setIsCollapsed(true)}>
                {metadata && <p className="text-xs text-muted-foreground">{metadata.column_count} fields</p>}
            </PanelHeader>

            {/* Action Buttons */}
            {hasData && (
                <div className="p-3 border-b space-y-2 grid grid-cols-2 gap-2">
                    <Button variant="default" size="sm" onClick={handleUseAllData} disabled={isLoading} className="w-full">
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        Use All Data
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClearData} disabled={isLoading} className="w-full">
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Clear Data
                    </Button>
                </div>
            )}

            <div className="p-4 pb-0">
                <FieldsKeeperSearcher searchQuery={searchQuery} searchPlaceholder="Search fields..." onSearchQueryChange={setSearchQuery} />
            </div>

            <div className="flex-1 overflow-y-auto p-3 pl-0">
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
