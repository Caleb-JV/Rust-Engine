import { useState } from 'react';
import { dataService, type DataQuery, type FilterCondition, type SortSpec } from '../services/dataService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';

export function AdvancedQueryDemo() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [filterColumn, setFilterColumn] = useState('');
    const [filterOperator, setFilterOperator] = useState<FilterCondition['operator']>('equals');
    const [filterValue, setFilterValue] = useState('');
    const [filters, setFilters] = useState<FilterCondition[]>([]);

    // Sort state
    const [sortColumn, setSortColumn] = useState('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [sorts, setSorts] = useState<SortSpec[]>([]);

    // Pivot state
    const [pivotRows, setPivotRows] = useState('');
    const [pivotValueColumn, setPivotValueColumn] = useState('');
    const [pivotAggregation, setPivotAggregation] = useState<'sum' | 'average' | 'count' | 'min' | 'max'>('sum');

    // Query state
    const [columns, setColumns] = useState('');
    const [limit, setLimit] = useState('100');
    const [offset, setOffset] = useState('0');

    const addFilter = () => {
        if (!filterColumn) return;

        let value: any = filterValue;

        // Parse value based on operator
        if (filterOperator === 'in' || filterOperator === 'notin') {
            value = filterValue.split(',').map((v) => v.trim());
        } else if (filterOperator === 'between') {
            const [min, max] = filterValue.split(',').map((v) => parseFloat(v.trim()));
            value = { min, max };
        } else if (!isNaN(Number(filterValue))) {
            value = Number(filterValue);
        } else if (filterValue === 'true' || filterValue === 'false') {
            value = filterValue === 'true';
        }

        setFilters([
            ...filters,
            {
                column: filterColumn,
                operator: filterOperator,
                value,
            },
        ]);
        setFilterColumn('');
        setFilterValue('');
    };

    const addSort = () => {
        if (!sortColumn) return;
        setSorts([
            ...sorts,
            {
                column: sortColumn,
                direction: sortDirection,
            },
        ]);
        setSortColumn('');
    };

    const executeQuery = async () => {
        setLoading(true);
        setError(null);

        try {
            const query: DataQuery = {};

            // Add columns if specified
            if (columns) {
                query.columns = columns.split(',').map((c) => c.trim());
            }

            // Add filters
            if (filters.length > 0) {
                query.filters = filters;
            }

            // Add sorts
            if (sorts.length > 0) {
                query.sort = sorts;
            }

            // Add pivot if specified
            if (pivotRows && pivotValueColumn) {
                query.pivot = {
                    rows: pivotRows.split(',').map((r) => r.trim()),
                    values: [
                        {
                            column: pivotValueColumn,
                            aggregation: pivotAggregation,
                        },
                    ],
                };
            }

            // Add limit/offset
            if (limit) {
                query.limit = parseInt(limit);
            }
            if (offset) {
                query.offset = parseInt(offset);
            }

            console.log('Executing query:', query);
            const data = await dataService.getDataAdvancedAsync(query);
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const testSimpleFilter = async () => {
        setLoading(true);
        setError(null);

        try {
            // Example: Get all rows where a numeric column > 50
            const metadata = dataService.getMetadata();
            const numericCol = metadata?.columns.find((c) => c.type === 'number')?.name;

            if (!numericCol) {
                throw new Error('No numeric column found');
            }

            const query: DataQuery = {
                filters: [
                    {
                        column: numericCol,
                        operator: 'greaterthan',
                        value: 50,
                    },
                ],
                limit: 10,
            };

            console.log('Test query:', query);
            const data = await dataService.getDataAdvancedAsync(query);
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const testSorting = async () => {
        setLoading(true);
        setError(null);

        try {
            const metadata = dataService.getMetadata();
            const firstCol = metadata?.columns[0]?.name;

            if (!firstCol) {
                throw new Error('No columns found');
            }

            const query: DataQuery = {
                sort: [
                    {
                        column: firstCol,
                        direction: 'desc',
                    },
                ],
                limit: 10,
            };

            console.log('Sort test query:', query);
            const data = await dataService.getDataAdvancedAsync(query);
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const testPivot = async () => {
        setLoading(true);
        setError(null);

        try {
            const metadata = dataService.getMetadata();
            const textCol = metadata?.columns.find((c) => c.type === 'text')?.name;
            const numericCol = metadata?.columns.find((c) => c.type === 'number')?.name;

            if (!textCol || !numericCol) {
                throw new Error('Need text and numeric columns');
            }

            const query: DataQuery = {
                pivot: {
                    rows: [textCol],
                    values: [
                        {
                            column: numericCol,
                            aggregation: 'sum',
                        },
                    ],
                },
            };

            console.log('Pivot test query:', query);
            const data = await dataService.getDataAdvancedAsync(query);
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getFilterOptionsTest = async () => {
        setLoading(true);
        setError(null);

        try {
            const metadata = dataService.getMetadata();
            const firstCol = metadata?.columns[0]?.name;

            if (!firstCol) {
                throw new Error('No columns found');
            }

            const options = await dataService.getFilterOptions(firstCol);
            setResult({ filterOptions: options });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <Card>
                <CardHeader>
                    <CardTitle>Advanced Query Builder</CardTitle>
                    <CardDescription>Test the new filtering, sorting, and pivot capabilities</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Quick Test Buttons */}
                    <div className="space-y-2">
                        <Label>Quick Tests</Label>
                        <div className="flex gap-2 flex-wrap">
                            <Button onClick={testSimpleFilter} variant="outline" size="sm">
                                Test Filter (num &gt; 50)
                            </Button>
                            <Button onClick={testSorting} variant="outline" size="sm">
                                Test Sorting
                            </Button>
                            <Button onClick={testPivot} variant="outline" size="sm">
                                Test Pivot
                            </Button>
                            <Button onClick={getFilterOptionsTest} variant="outline" size="sm">
                                Get Filter Options
                            </Button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="space-y-2">
                        <Label>Filters</Label>
                        <div className="flex gap-2">
                            <Input placeholder="Column" value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)} className="flex-1" />
                            <Select
                                value={filterOperator}
                                onChange={(e) => setFilterOperator(e.target.value as FilterCondition['operator'])}
                                className="w-[180px]"
                            >
                                <option value="equals">Equals</option>
                                <option value="notequals">Not Equals</option>
                                <option value="greaterthan">Greater Than</option>
                                <option value="lessthan">Less Than</option>
                                <option value="contains">Contains</option>
                                <option value="in">In (comma-separated)</option>
                                <option value="between">Between (min,max)</option>
                            </Select>
                            <Input placeholder="Value" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="flex-1" />
                            <Button onClick={addFilter} size="sm">
                                Add
                            </Button>
                        </div>
                        {filters.length > 0 && (
                            <div className="text-sm space-y-1">
                                {filters.map((f, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <code className="bg-gray-100 px-2 py-1 rounded">
                                            {f.column} {f.operator} {JSON.stringify(f.value)}
                                        </code>
                                        <Button variant="ghost" size="sm" onClick={() => setFilters(filters.filter((_, idx) => idx !== i))}>
                                            ×
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sorting */}
                    <div className="space-y-2">
                        <Label>Sorting</Label>
                        <div className="flex gap-2">
                            <Input placeholder="Column" value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} className="flex-1" />
                            <Select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')} className="w-[120px]">
                                <option value="asc">Ascending</option>
                                <option value="desc">Descending</option>
                            </Select>
                            <Button onClick={addSort} size="sm">
                                Add
                            </Button>
                        </div>
                        {sorts.length > 0 && (
                            <div className="text-sm space-y-1">
                                {sorts.map((s, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <code className="bg-gray-100 px-2 py-1 rounded">
                                            {s.column} {s.direction}
                                        </code>
                                        <Button variant="ghost" size="sm" onClick={() => setSorts(sorts.filter((_, idx) => idx !== i))}>
                                            ×
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pivot */}
                    <div className="space-y-2">
                        <Label>Pivot (Optional)</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Row columns (comma-separated)"
                                value={pivotRows}
                                onChange={(e) => setPivotRows(e.target.value)}
                                className="flex-1"
                            />
                            <Input
                                placeholder="Value column"
                                value={pivotValueColumn}
                                onChange={(e) => setPivotValueColumn(e.target.value)}
                                className="flex-1"
                            />
                            <Select
                                value={pivotAggregation}
                                onChange={(e) => setPivotAggregation(e.target.value as 'sum' | 'average' | 'count' | 'min' | 'max')}
                                className="w-[120px]"
                            >
                                <option value="sum">Sum</option>
                                <option value="average">Average</option>
                                <option value="count">Count</option>
                                <option value="min">Min</option>
                                <option value="max">Max</option>
                            </Select>
                        </div>
                    </div>

                    {/* Other Options */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Columns (optional)</Label>
                            <Input placeholder="Comma-separated" value={columns} onChange={(e) => setColumns(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Limit</Label>
                            <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Offset</Label>
                            <Input type="number" value={offset} onChange={(e) => setOffset(e.target.value)} />
                        </div>
                    </div>

                    {/* Execute Button */}
                    <Button onClick={executeQuery} disabled={loading} className="w-full">
                        {loading ? 'Loading...' : 'Execute Query'}
                    </Button>

                    {/* Error Display */}
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

                    {/* Result Display */}
                    {result && (
                        <div className="space-y-2">
                            <Label>Result</Label>
                            <div className="bg-gray-50 p-4 rounded overflow-auto max-h-96">
                                <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>
                            </div>
                            {result.rows && (
                                <div className="text-sm text-gray-600">
                                    Showing {result.rows.length} rows × {result.columns?.length || 0} columns
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
