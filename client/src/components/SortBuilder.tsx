import { useState, useMemo } from 'react';
import { Plus, X, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { SortSpec } from '../services/dataService';
import { useStore } from '../store/fieldsStore';

interface SortBuilderProps {
    onSort?: (sorts: SortSpec[]) => void;
}

export function SortBuilder({ onSort }: SortBuilderProps) {
    const pivotBuckets = useStore((state) => state.pivotBuckets);
    const [sorts, setSorts] = useState<SortSpec[]>([]);

    // Get available columns from the columns bucket
    const availableColumns = useMemo(() => {
        const columnsBucket = pivotBuckets.find((b) => b.id === 'columns');
        return (
            columnsBucket?.items.map((item) => ({
                name: item.value?.name || '',
                type: item.value?.dataType || 'string',
            })) || []
        );
    }, [pivotBuckets]);

    const [currentSort, setCurrentSort] = useState<{
        column: string;
        direction: 'asc' | 'desc';
    }>({
        column: '',
        direction: 'asc',
    });

    const addSort = () => {
        if (!currentSort.column) return;

        setSorts([
            ...sorts,
            {
                column: currentSort.column,
                direction: currentSort.direction,
            },
        ]);

        setCurrentSort({ column: '', direction: 'asc' });

        // Notify parent
        onSort?.([
            ...sorts,
            {
                column: currentSort.column,
                direction: currentSort.direction,
            },
        ]);
    };

    const removeSort = (index: number) => {
        const newSorts = sorts.filter((_, i) => i !== index);
        setSorts(newSorts);
        onSort?.(newSorts);
    };

    const clearAllSorts = () => {
        setSorts([]);
        onSort?.([]);
    };

    return (
        <div className="space-y-4">
            {/* Add Sort Section */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold">Add Sort</Label>

                {/* Column Selection */}
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Column</Label>
                    <Select
                        value={currentSort.column}
                        onChange={(e) => setCurrentSort({ ...currentSort, column: e.target.value })}
                        className="w-full"
                        disabled={availableColumns.length === 0}
                    >
                        <option value="">Select column</option>
                        {availableColumns.map((col) => (
                            <option key={col.name} value={col.name}>
                                {col.name} ({col.type})
                            </option>
                        ))}
                    </Select>
                </div>

                {/* Direction Selection */}
                {currentSort.column && (
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Direction</Label>
                        <div className="flex gap-2">
                            <Select
                                value={currentSort.direction}
                                onChange={(e) => setCurrentSort({ ...currentSort, direction: e.target.value as 'asc' | 'desc' })}
                                className="flex-1"
                            >
                                <option value="asc">Ascending (A → Z, 0 → 9)</option>
                                <option value="desc">Descending (Z → A, 9 → 0)</option>
                            </Select>
                            <Button onClick={addSort} size="sm" variant="default">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Active Sorts List */}
            {sorts.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Sort Order ({sorts.length})</Label>
                        <Button onClick={clearAllSorts} size="sm" variant="ghost" className="h-6 text-xs">
                            Clear All
                        </Button>
                    </div>
                    <div className="space-y-1.5">
                        {sorts.map((sort, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md group hover:bg-muted transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground shrink-0">{index + 1}.</span>
                                <Badge variant="outline" className="text-xs font-mono shrink-0">
                                    {sort.column}
                                </Badge>
                                <div className="flex items-center gap-1 flex-1">
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{sort.direction === 'asc' ? 'Ascending' : 'Descending'}</span>
                                </div>
                                <Button
                                    onClick={() => removeSort(index)}
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Help Text */}
            {availableColumns.length === 0 && (
                <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                    👆 Add columns in the Pivot tab to enable sorting
                </div>
            )}
        </div>
    );
}
