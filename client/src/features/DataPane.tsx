import { useRef, useState } from 'react';
import { Upload, ChevronLeft, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldsKeeperRootBucket, FieldsKeeperSearcher } from 'react-fields-keeper';
import { useFieldsStore, selectActiveTab, selectDataPaneCollapsed, selectProcessingStatus } from '@/store/fieldsStore';
import { dataService } from '@/services/dataService';

export const DataPane = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Use store for state management
    const processingStatus = useFieldsStore(selectProcessingStatus);
    const activeTab = useFieldsStore(selectActiveTab);
    const isCollapsed = useFieldsStore(selectDataPaneCollapsed);
    const setIsCollapsed = useFieldsStore((state) => state.setDataPaneCollapsed);
    const setFileName = useFieldsStore((state) => state.setFileName);

    const metadata = dataService.getMetadata();
    const hasData = metadata !== null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
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

    if (isCollapsed) {
        return (
            <div className="h-full w-12 border-r bg-background flex flex-col items-center py-2">
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="mb-4">
                    <ChevronLeft className="h-4 w-4 rotate-180" />
                </Button>
                <div className="[writing-mode:vertical-lr] text-sm font-semibold">Data</div>
            </div>
        );
    }

    if (!hasData) {
        return (
            <div className="h-full flex flex-col border-r bg-background" style={{ width: '280px' }}>
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold">Data</h3>
                    <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="text-center">
                        <div className="rounded-full bg-primary/10 p-6 mb-4 inline-block">
                            <Upload className="h-8 w-8 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">Upload a CSV file to start</p>
                        <Button onClick={handleUploadClick} disabled={isLoading}>
                            {isLoading ? 'Processing...' : 'Select File'}
                        </Button>
                        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col border-r bg-background" style={{ width: '280px' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Data</h3>
                    {metadata && <p className="text-xs text-muted-foreground">{metadata.column_count} fields</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            </div>

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
                    instanceId={activeTab}
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
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            </div>
        </div>
    );
};
