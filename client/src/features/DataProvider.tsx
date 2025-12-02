import React from 'react';
import { FieldsKeeperProvider } from 'react-fields-keeper';
import { useStore } from '../store/fieldsStore';
import { dataService } from '../services/dataService';
import './fields-keeper-custom.css';

interface IDataProvider {
    children: React.ReactNode;
}

export default function DataProvider(props: IDataProvider) {
    // props
    const { children } = props;

    // state
    const pivotBuckets = useStore((state) => state.pivotBuckets);
    const processingStatus = useStore((state) => state.processingStatus);
    const fileName = useStore((state) => state.fileName);
    const setPivotBuckets = useStore((state) => state.setPivotBuckets);

    // Get all field items from service

    const allPivotItems = React.useMemo(() => {
        if (fileName) return dataService.getAllFieldItems();

        return [];
    }, [fileName, processingStatus]);

    // Pivot update handler - triggers getData
    const onPivotUpdate = (state: { buckets: typeof pivotBuckets }) => {
        setPivotBuckets(state.buckets);

        // Get column names from columns bucket
        const bucketItems = state.buckets.filter((b) => b.id === 'columns' || b.id === 'values').flatMap((b) => b.items);
        const columnNames = bucketItems?.map((item) => item.value?.name).filter(Boolean) as string[];

        // Fetch data with selected columns
        if (columnNames.length > 0) dataService.getData({ columns: columnNames });
    };

    return (
        <main className="grid grid-cols-[auto_auto_auto_1fr] h-[calc(100vh-68px)]">
            <FieldsKeeperProvider instanceId="pivot" allItems={allPivotItems} buckets={pivotBuckets} onUpdate={onPivotUpdate}>
                {children}
            </FieldsKeeperProvider>
        </main>
    );
}
