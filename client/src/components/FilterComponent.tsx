import React from 'react';
import { type IFieldsKeeperItem } from 'react-fields-keeper';
import { useStore, selectPivotBuckets, selectFiltercondition, type IColumnField, type FilterCondition } from '@/store/fieldsStore';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { dataService } from '@/services/dataService';

export interface FilterOptionResponse {
    column: string;
    type: 'text' | 'number' | 'boolean';
    values: string[];
}

export const FilterComponent = () => {
    const pivotBuckets = useStore(selectPivotBuckets);
    const filterConditions = useStore(selectFiltercondition);
    const addOrUpdateFilterCondition = useStore((state) => state.addOrUpdateFilterCondition);
    const removeFilterCondition = useStore((state) => state.removeFilterCondition);

    const columnsBucket = pivotBuckets.find((b) => b.id === 'columns');
    const [filterOptions, setFilterOptions] = React.useState<Record<string, string[]>>({});

    const columnsEmpty = !columnsBucket || columnsBucket.items.length === 0;

    // Load options for column
    const loadOptions = async (col: IFieldsKeeperItem<IColumnField>) => {
        if (filterOptions[col.id]) return; // prevent reloading

        const options = (await dataService.getFilterOptions(col.label)) as FilterOptionResponse;
        setFilterOptions((prev) => ({
            ...prev,
            [col.id]: options.values,
        }));
    };
    let debounceTimer: ReturnType<typeof setTimeout>;

    const runQueryDebounced = (filterConditions: FilterCondition[]) => {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            const query: { filters?: FilterCondition[] } = {
                filters: filterConditions,
            };

            dataService.getData(query);
        }, 100);
    };

    // Check if a value is selected in the store
    const isValueChecked = (column: string, value: string) => {
        const condition = filterConditions.find((f) => f.column === column);
        if (!condition) return false;
        if (Array.isArray(condition.value)) return condition.value.includes(value);
        return condition.value === value;
    };

    // Handle checkbox toggle
    const handleCheckboxChange = (column: string, value: string, checked: boolean) => {
        const existing = filterConditions.find((f) => f.column === column);

        if (checked) {
            // Add or update
            if (existing) {
                const existingValues = Array.isArray(existing.value) ? (existing.value as string[]) : [existing.value as string];

                const values = [...existingValues, value as string];
                addOrUpdateFilterCondition({ column, operator: 'in', value: values });
            } else {
                addOrUpdateFilterCondition({ column, operator: 'in', value: [value] });
            }
        } else {
            // Remove value
            if (!existing) return;
            const values = Array.isArray(existing.value) ? existing.value.filter((v) => v !== value) : [];
            if (values.length === 0) {
                removeFilterCondition(column);
            } else {
                addOrUpdateFilterCondition({ column, operator: 'in', value: values });
            }
        }
        console.log(filterConditions);
    };

    return (
        <div className="space-y-4">
            {/* COLUMN ACCORDION UI */}
            <div className="pt-4 border-t">
                {columnsEmpty && <h4 className="text-xs font-semibold mb-2 text-center">No Filters</h4>}
                <Accordion type="single" collapsible className="w-full border rounded-md bg-white">
                    {columnsBucket?.items?.map((col) => (
                        <AccordionItem key={col.id} value={col.id} className="border-b">
                            <AccordionTrigger className="flex items-center gap-2 px-3 py-2" onClick={() => loadOptions(col)}>
                                {col.prefixNode && <span className="text-muted-foreground text-sm">{col.prefixNode}</span>}
                                <span className="text-xs font-medium">{col.label}</span>
                            </AccordionTrigger>

                            <AccordionContent className="px-3 py-2 text-xs">
                                {/* TABS: BASIC / ADVANCED */}
                                <Tabs defaultValue="basic" className="w-full">
                                    <TabsList className="grid grid-cols-2 w-40 h-7">
                                        <TabsTrigger value="basic" className="text-xs px-2 py-1">
                                            Basic
                                        </TabsTrigger>
                                        <TabsTrigger value="advanced" className="text-xs px-2 py-1">
                                            Advanced
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* BASIC FILTERS */}
                                    <TabsContent value="basic" className="mt-3">
                                        <div className="border rounded-md p-3 bg-muted/50 space-y-2">
                                            {!filterOptions[col.id] ? (
                                                <div className="text-xs text-muted-foreground">Loading options...</div>
                                            ) : (
                                                <div className="space-y-1 max-h-40 overflow-auto">
                                                    {filterOptions[col.id].map((value, idx) => (
                                                        <label key={idx} className="flex items-center gap-2 text-xs">
                                                            <input
                                                                type="checkbox"
                                                                className="h-3 w-3"
                                                                checked={isValueChecked(col.id, value)}
                                                                onChange={(e) => {
                                                                    handleCheckboxChange(col.id, value, e.target.checked);
                                                                    runQueryDebounced(useStore.getState().filterCondition);
                                                                }}
                                                            />
                                                            {value}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="advanced" className="mt-3">
                                        <div className="border rounded-md p-3 bg-muted/50 space-y-2">
                                            {(() => {
                                                const fc = filterConditions.find((f) => f.column === col.id);

                                                return (
                                                    <div className="flex flex-row gap-2 items-center">
                                                        {/* OPERATOR DROPDOWN */}
                                                        <select
                                                            className="border px-2 py-1 rounded w-30 text-xs flex-1"
                                                            value={fc?.operator ?? 'equals'}
                                                            onChange={(e) => {
                                                                addOrUpdateFilterCondition({
                                                                    column: col.id,
                                                                    operator: e.target.value as FilterCondition['operator'],
                                                                    value: fc?.value ?? '',
                                                                });
                                                            }}
                                                        >
                                                            <option value="equals">Equals</option>
                                                            <option value="notequals">Not Equals</option>
                                                            <option value="contains">Contains</option>
                                                            <option value="notcontains">Not Contains</option>
                                                            <option value="greaterthan">Greater Than</option>
                                                            <option value="lessthan">Less Than</option>
                                                            <option value="greaterthanorequal">Greater Than Or Equal</option>
                                                            <option value="lessthanorequal">Less Than Or Equal</option>
                                                            <option value="in">In (comma separated)</option>
                                                            <option value="notin">Not In (comma separated)</option>
                                                            <option value="between">Between (e.g. 10,20)</option>
                                                        </select>

                                                        {/* BETWEEN */}
                                                        {fc && fc.operator === 'between' && (
                                                            <input
                                                                className="border px-2 py-1  w-20 rounded text-xs flex-1"
                                                                placeholder="e.g. 10,20"
                                                                value={typeof fc.value === 'string' ? fc.value : ''}
                                                                onChange={(e) => {
                                                                    addOrUpdateFilterCondition({
                                                                        column: col.id,
                                                                        operator: 'between',
                                                                        value: e.target.value,
                                                                    });
                                                                    runQueryDebounced(useStore.getState().filterCondition);
                                                                }}
                                                            />
                                                        )}

                                                        {/* IN / NOT IN */}
                                                        {fc && (fc.operator === 'in' || fc.operator === 'notin') && (
                                                            <input
                                                                className="border px-2 py-1 rounded w-20 text-xs flex-1"
                                                                placeholder="a, b, c"
                                                                value={Array.isArray(fc.value) ? fc.value.join(', ') : ''}
                                                                onChange={(e) => {
                                                                    addOrUpdateFilterCondition({
                                                                        column: col.id,
                                                                        operator: fc.operator,
                                                                        value: e.target.value.split(',').map((v) => v.trim()),
                                                                    });
                                                                    runQueryDebounced(useStore.getState().filterCondition);
                                                                }}
                                                            />
                                                        )}

                                                        {/* DEFAULT INPUT */}
                                                        {fc && !['between', 'in', 'notin'].includes(fc.operator) && (
                                                            <input
                                                                className="border px-2 py-1 rounded text-xs w-20 flex-1"
                                                                placeholder="Enter value"
                                                                value={typeof fc.value === 'string' || typeof fc.value === 'number' ? fc.value : ''}
                                                                onChange={(e) => {
                                                                    addOrUpdateFilterCondition({
                                                                        column: col.id,
                                                                        operator: fc.operator,
                                                                        value: e.target.value,
                                                                    });
                                                                    runQueryDebounced(useStore.getState().filterCondition);
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </div>
    );
};
