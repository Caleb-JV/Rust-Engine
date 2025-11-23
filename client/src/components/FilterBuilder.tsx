import { useState, useMemo } from 'react';
import { Plus, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { dataService, type FilterCondition, type SortSpec } from '../services/dataService';
import { useFieldsStore } from '../store/fieldsStore';
import { SortBuilder } from './SortBuilder';

interface FilterBuilderProps {
    onApply?: () => void;
}

export function FilterBuilder({ onApply }: FilterBuilderProps) {
    const filterBuckets = useFieldsStore((state) => state.filterBuckets);
    const [filters, setFilters] = useState<FilterCondition[]>([]);
    const [sorts, setSorts] = useState<SortSpec[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortOpen, setSortOpen] = useState(false);

    // Get available columns from the filter bucket
    const availableColumns = useMemo(() => {
        const filtersBucket = filterBuckets.find((b) => b.id === 'filters');
        return (
            filtersBucket?.items.map((item) => ({
                name: item.value?.name || '',
                type: item.value?.dataType || 'string',
            })) || []
        );
    }, [filterBuckets]);

    // Current filter being built
    const [currentFilter, setCurrentFilter] = useState<{
        column: string;
        operator: FilterCondition['operator'];
        value: string;
    }>({
        column: '',
        operator: 'equals',
        value: '',
    });

    // Get operators valid for current column type
    const validOperators = useMemo(() => {
        const operatorOptions: { value: FilterCondition['operator']; label: string; types: string[] }[] = [
            { value: 'equals', label: 'Equals', types: ['string', 'number', 'boolean'] },
            { value: 'notequals', label: 'Not Equals', types: ['string', 'number', 'boolean'] },
            { value: 'greaterthan', label: 'Greater Than', types: ['number'] },
            { value: 'lessthan', label: 'Less Than', types: ['number'] },
            { value: 'greaterthanorequal', label: 'Greater Than or Equal', types: ['number'] },
            { value: 'lessthanorequal', label: 'Less Than or Equal', types: ['number'] },
            { value: 'contains', label: 'Contains', types: ['string'] },
            { value: 'notcontains', label: 'Does Not Contain', types: ['string'] },
            { value: 'in', label: 'In (comma-separated)', types: ['string', 'number'] },
            { value: 'notin', label: 'Not In (comma-separated)', types: ['string', 'number'] },
            { value: 'between', label: 'Between (min,max)', types: ['number'] },
        ];

        const column = availableColumns.find((c) => c.name === currentFilter.column);
        if (!column) return operatorOptions;

        return operatorOptions.filter((op) => op.types.includes(column.type));
    }, [currentFilter.column, availableColumns]);

    const parseFilterValue = (
        value: string,
        operator: FilterCondition['operator'],
        columnType: string,
    ): string | number | boolean | string[] | { min: number; max: number } => {
        if (operator === 'in' || operator === 'notin') {
            return value.split(',').map((v) => v.trim());
        }

        if (operator === 'between') {
            const [min, max] = value.split(',').map((v) => parseFloat(v.trim()));
            return { min, max };
        }

        if (columnType === 'number') {
            return parseFloat(value);
        }

        if (columnType === 'boolean') {
            return value.toLowerCase() === 'true';
        }

        return value;
    };

    const addFilter = () => {
        if (!currentFilter.column || !currentFilter.value) {
            setError('Please select a column and enter a value');
            return;
        }

        const column = availableColumns.find((c) => c.name === currentFilter.column);
        if (!column) return;

        const parsedValue = parseFilterValue(currentFilter.value, currentFilter.operator, column.type);

        setFilters([
            ...filters,
            {
                column: currentFilter.column,
                operator: currentFilter.operator,
                value: parsedValue,
            },
        ]);

        setCurrentFilter({ column: '', operator: 'equals', value: '' });
        setError(null);
    };

    const removeFilter = (index: number) => {
        setFilters(filters.filter((_, i) => i !== index));
    };

    const clearAllFilters = () => {
        setFilters([]);
        setError(null);
    };

    const applyFilters = async () => {
        if (filters.length === 0 && sorts.length === 0) {
            setError('No filters or sorts to apply');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const query: { filters?: FilterCondition[]; sort?: SortSpec[] } = {};
            if (filters.length > 0) query.filters = filters;
            if (sorts.length > 0) query.sort = sorts;

            await dataService.getDataAdvancedAsync(query);
            onApply?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply filters/sorts');
        } finally {
            setLoading(false);
        }
    };

    const getFilterPreview = (filter: FilterCondition): string => {
        const valueStr = typeof filter.value === 'object' ? JSON.stringify(filter.value) : String(filter.value);
        return `${filter.column} ${filter.operator} ${valueStr}`;
    };

    const getValuePlaceholder = (): string => {
        switch (currentFilter.operator) {
            case 'in':
            case 'notin':
                return 'value1, value2, value3';
            case 'between':
                return 'min, max';
            default:
                return 'Enter value';
        }
    };

    return (
        <div className="space-y-4">
            {/* Add Filter Section */}
            <div className="space-y-3">
                <Label className="text-xs font-semibold">Build Filter</Label>

                {/* Column Selection */}
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Column</Label>
                    <Select
                        value={currentFilter.column}
                        onChange={(e) => setCurrentFilter({ ...currentFilter, column: e.target.value })}
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

                {/* Operator Selection */}
                {currentFilter.column && (
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Operator</Label>
                        <Select
                            value={currentFilter.operator}
                            onChange={(e) => setCurrentFilter({ ...currentFilter, operator: e.target.value as FilterCondition['operator'] })}
                            className="w-full"
                        >
                            {validOperators.map((op) => (
                                <option key={op.value} value={op.value}>
                                    {op.label}
                                </option>
                            ))}
                        </Select>
                    </div>
                )}

                {/* Value Input */}
                {currentFilter.column && (
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Value</Label>
                        <div className="flex gap-2">
                            <Input
                                value={currentFilter.value}
                                onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
                                placeholder={getValuePlaceholder()}
                                className="flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        addFilter();
                                    }
                                }}
                            />
                            <Button onClick={addFilter} size="sm" variant="default">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Active Filters List */}
            {filters.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Active Filters ({filters.length})</Label>
                        <Button onClick={clearAllFilters} size="sm" variant="ghost" className="h-6 text-xs">
                            Clear All
                        </Button>
                    </div>
                    <div className="space-y-1.5">
                        {filters.map((filter, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md group hover:bg-muted transition-colors">
                                <Badge variant="outline" className="text-xs font-mono shrink-0">
                                    {filter.column}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex-1 truncate">{getFilterPreview(filter)}</span>
                                <Button
                                    onClick={() => removeFilter(index)}
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

            {/* Sort Section */}
            <Collapsible open={sortOpen} onOpenChange={setSortOpen}>
                <CollapsibleTrigger className="w-full">
                    <Button variant="outline" className="w-full justify-between" size="sm" type="button">
                        <span className="text-xs font-semibold">Sort Options {sorts.length > 0 && `(${sorts.length})`}</span>
                        <span className="text-xs">{sortOpen ? '▲' : '▼'}</span>
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                    <SortBuilder onSort={setSorts} />
                </CollapsibleContent>
            </Collapsible>

            {/* Apply Button */}
            <Button
                onClick={applyFilters}
                disabled={loading || (filters.length === 0 && sorts.length === 0) || availableColumns.length === 0}
                className="w-full"
                variant="default"
            >
                {loading ? (
                    'Applying...'
                ) : (
                    <>
                        <Play className="h-4 w-4 mr-2" />
                        Apply Filters & Sorts
                    </>
                )}
            </Button>

            {/* Error Display */}
            {error && <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</div>}

            {/* Help Text */}
            {availableColumns.length === 0 && (
                <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">👆 Drag fields from above to start filtering</div>
            )}
        </div>
    );
}
