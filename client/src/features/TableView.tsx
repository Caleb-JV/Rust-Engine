import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { dataService } from '../services/dataService';
import { useStore, selectProcessingStatus } from '../store/fieldsStore';
import { useMemo } from 'react';
import { List } from 'react-window';
import type { Row } from '../types';

interface RowData {
    rows: Row[];
    columns: string[];
}

export const TableView = () => {
    const processingStatus = useStore(selectProcessingStatus);
    const tableRenderCounter = useStore((state) => state.tableRenderCounter);

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

    const ROW_HEIGHT = 40;

    const Row = ({
        index,
        style,
        rows,
        columns,
    }: RowData<{
        rows: any[];
        columns: string[];
    }>) => {
        const row = rows[index];

        return (
            <div style={style} className={`flex border-b ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'} hover:bg-muted/40`}>
                {columns.map((col) => (
                    <div key={col} className="px-4 py-2 text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-[150px]">
                        {row[col] === null || row[col] === undefined ? <span className="text-muted-foreground italic">null</span> : String(row[col])}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-auto p-4 h-screen">
            <Card className="h-full flex flex-col">
                <CardHeader className="pb-3 border-b">
                    <CardTitle>Data Preview</CardTitle>
                    <CardDescription>
                        {tableData.rows.length.toLocaleString()} rows × {tableData.columns.length} columns
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
                    {/* Sticky Header */}
                    <div className="bg-white shadow sticky top-0 z-10 border-b">
                        <div className="flex">
                            {tableData.columns.map((col) => (
                                <div key={col} className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap flex-1 min-w-[150px]">
                                    {col}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                        <List
                            rowComponent={Row}
                            rowCount={tableData.rows.length}
                            rowHeight={ROW_HEIGHT} // 🔥 STATIC 40px
                            rowProps={{
                                rows: tableData.rows,
                                columns: tableData.columns,
                            }}
                            className="w-full h-full"
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
