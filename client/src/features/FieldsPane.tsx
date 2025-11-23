import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldsKeeperBucket } from 'react-fields-keeper';
import { useFieldsStore, selectActiveTab, selectPivotBuckets, selectFilterBuckets, selectFieldsPaneCollapsed } from '@/store/fieldsStore';
import { FilterBuilder } from '@/components/FilterBuilder';

export const FieldsPane = () => {
    // Use store for all state management
    const activeTab = useFieldsStore(selectActiveTab);
    const pivotBuckets = useFieldsStore(selectPivotBuckets);
    const filterBuckets = useFieldsStore(selectFilterBuckets);
    const isCollapsed = useFieldsStore(selectFieldsPaneCollapsed);
    const setActiveTab = useFieldsStore((state) => state.setActiveTab);
    const setIsCollapsed = useFieldsStore((state) => state.setFieldsPaneCollapsed);

    const columnsBucket = pivotBuckets.find((b) => b.id === 'columns');
    const valuesBucket = pivotBuckets.find((b) => b.id === 'values');
    const filtersBucket = filterBuckets.find((b) => b.id === 'filters');

    if (isCollapsed) {
        return (
            <div className="h-full w-12 border-r bg-background flex flex-col items-center py-2">
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="mb-4">
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="[writing-mode:vertical-lr] text-sm font-semibold">Fields</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col border-r bg-background" style={{ width: '320px' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <h3 className="font-semibold">Fields</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex border-b">
                <button
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'pivot' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('pivot')}
                >
                    Pivot
                </button>
                <button
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'filters' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('filters')}
                >
                    Filters
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'pivot' ? (
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold">Columns</h4>
                                <span className="text-xs text-muted-foreground">{columnsBucket?.items.length || 0}</span>
                            </div>
                            <FieldsKeeperBucket instanceId="pivot" id="columns" allowRemoveFields emptyFieldPlaceholder="Drag fields here" />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold">Values</h4>
                                <span className="text-xs text-muted-foreground">{valuesBucket?.items.length || 0}</span>
                            </div>
                            <FieldsKeeperBucket instanceId="pivot" id="values" allowRemoveFields emptyFieldPlaceholder="Drag fields here" />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold">Filter Fields</h4>
                                <span className="text-xs text-muted-foreground">{filtersBucket?.items.length || 0}</span>
                            </div>
                            <FieldsKeeperBucket instanceId="filters" id="filters" allowRemoveFields emptyFieldPlaceholder="Drag fields to filter" />
                        </div>

                        <div className="pt-4 border-t">
                            <FilterBuilder
                                onApply={() => {
                                    // Callback when filters are applied
                                    console.log('Filters applied successfully');
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
