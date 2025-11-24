import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { dataService } from '../services/dataService';
import { useFieldsStore, selectProcessingStatus } from '../store/fieldsStore';
import { useMemo } from 'react';

export const TableView = () => {
    const processingStatus = useFieldsStore(selectProcessingStatus);
    const tableRenderCounter = useFieldsStore((state) => state.tableRenderCounter);

    const tableData = useMemo(() => {
        return dataService.getCurrentData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableRenderCounter]);

    if (processingStatus === 'idle') {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center text-muted-foreground">
                    <p className="text-lg font-semibold mb-2">No Data</p>
                    <p className="text-sm">Upload a CSV file to view data</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto p-4 h-screen">
            <Card className="h-full flex flex-col">
                <CardHeader className="pb-3 border-b">
                    <CardTitle>Data Preview</CardTitle>
                    <CardDescription>
                        {tableData.rows.length.toLocaleString()} rows × {tableData.columns.length} columns
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto p-0">
                    <table className="w-full text-sm border-collapse">
                        <thead className="bg-white shadow-md sticky top-0 z-10">
                            <tr>
                                {tableData.columns.map((col) => (
                                    <th key={col} className="px-4 py-3 text-left font-semibold text-foreground border-b whitespace-nowrap">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.rows.map((row, idx) => (
                                <tr
                                    key={idx}
                                    className={`${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} hover:bg-muted/40 transition-colors border-b`}
                                >
                                    {tableData.columns.map((col) => (
                                        <td key={col} className="px-4 py-2.5 text-foreground/90 whitespace-nowrap">
                                            {row[col] === null || row[col] === undefined ? (
                                                <span className="text-muted-foreground italic">null</span>
                                            ) : (
                                                String(row[col])
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
};
