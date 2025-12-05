import { useMemo } from 'react';
import { GripVertical, X, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { ISortOption } from '../services/dataService';
import { useAppStore } from '../store/appStore';

interface ISortBuilderProps {
    sorts: ISortOption[];
}

export function SortBuilder(props: ISortBuilderProps) {
    // props
    const { sorts } = props;

    // state
    const pivotBuckets = useAppStore((state) => state.pivotBuckets);
    const setSortOptions = useAppStore((state) => state.setSortOptions);

    // Get available columns from the columns bucket
    const availableColumns = useMemo(() => {
        const columnsBucket = pivotBuckets.find((b) => b.id === 'columns')?.items;
        return (
            columnsBucket?.map((item) => ({
                name: item.value?.name || '',
                type: item.value?.dataType || 'string',
            })) || []
        );
    }, [pivotBuckets]);

    // Get columns not yet used in sorts
    const unusedColumns = availableColumns.filter((col) => !sorts.some((s) => s.column === col.name));

    // handlers
    const addSort = (column: string) => {
        if (!column) return;

        // Check if column already exists
        const existingIndex = sorts.findIndex((s) => s.column === column);
        if (existingIndex >= 0) return;

        setSortOptions([...sorts, { column, direction: 'asc' }]);
    };

    const toggleDirection = (index: number) => {
        const newSorts = [...sorts];
        newSorts[index].direction = newSorts[index].direction === 'asc' ? 'desc' : 'asc';
        setSortOptions(newSorts);
    };

    const removeSort = (index: number) => {
        setSortOptions(sorts.filter((_, i) => i !== index));
    };

    const clearAllSorts = () => {
        setSortOptions([]);
    };

    // paint
    return (
        <div className="space-y-4">
            {/* Quick Add Sort */}
            <div className="space-y-2">
                <Label className="text-xs font-semibold">Sort By</Label>
                <Select
                    value=""
                    disabled={unusedColumns.length === 0}
                    onValueChange={(value: string) => {
                        addSort(value);
                    }}
                >
                    <SelectTrigger className="w-full text-xs mt-1.5 cursor-pointer">
                        <SelectValue placeholder="+ Add Sort" />
                    </SelectTrigger>
                    <SelectContent>
                        {unusedColumns.map((col) => (
                            <SelectItem key={col.name} value={col.name}>
                                {col.name} ({col.type})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Active Sorts - Editable inline */}
            {sorts.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Sort Priority ({sorts.length})</Label>
                        {sorts.length > 1 && (
                            <Button onClick={clearAllSorts} size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        {sorts.map((sort, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-all group"
                            >
                                <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />

                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Badge variant="secondary" className="text-xs font-medium shrink-0 bg-background">
                                        {index + 1}
                                    </Badge>
                                    <span className="text-sm font-medium truncate">{sort.column}</span>
                                </div>

                                <Button
                                    onClick={() => toggleDirection(index)}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 shrink-0"
                                    title={`Toggle to ${sort.direction === 'asc' ? 'descending' : 'ascending'}`}
                                >
                                    {sort.direction === 'asc' ? (
                                        <>
                                            <ArrowUp className="h-3.5 w-3.5 mr-1" />
                                            <span className="text-xs">Asc</span>
                                        </>
                                    ) : (
                                        <>
                                            <ArrowDown className="h-3.5 w-3.5 mr-1" />
                                            <span className="text-xs">Desc</span>
                                        </>
                                    )}
                                </Button>

                                <Button
                                    onClick={() => removeSort(index)}
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                                    title="Remove sort"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground px-1">💡 Sorts are applied in order. Click direction to toggle.</p>
                </div>
            )}

            {/* Empty State */}
            {sorts.length === 0 && availableColumns.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-3 rounded-md border border-dashed border-border">
                    Select a column above to sort your data instantly.
                </div>
            )}

            {/* Help Text */}
            {availableColumns.length === 0 && (
                <div className="text-xs text-muted-foreground bg-gray-300/10 border border-gray-300/20 px-3 py-2.5 rounded-md">
                    Add columns in the Pivot tab to enable sorting
                </div>
            )}
        </div>
    );
}
