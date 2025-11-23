import React from 'react';
import { FieldsKeeperProvider } from 'react-fields-keeper';
import { useFieldsStore } from '../store/fieldsStore';
import { dataService } from '../services/dataService';
import './fields-keeper-custom.css';

interface IDataProvider {
    children: React.ReactNode;
}

export default function DataProvider(props: IDataProvider) {
    // props
    const { children } = props;

    // state
    const pivotBuckets = useFieldsStore((state) => state.pivotBuckets);
    const processingStatus = useFieldsStore((state) => state.processingStatus);
    const filterBuckets = useFieldsStore((state) => state.filterBuckets);
    const setPivotBuckets = useFieldsStore((state) => state.setPivotBuckets);
    const setFilterBuckets = useFieldsStore((state) => state.setFilterBuckets);

    // Get all field items from service

    const allPivotItems = React.useMemo(() => {
        if (processingStatus === 'success') return dataService.getAllFieldItems();

        return [];
    }, [processingStatus]);

    // Pivot update handler - triggers getData
    const onPivotUpdate = async (state: { buckets: typeof pivotBuckets }) => {
        setPivotBuckets(state.buckets);

        // Get column names from columns bucket
        const columnsBucket = state.buckets.find((b) => b.id === 'columns');
        const columnNames = columnsBucket?.items.map((item) => item.value?.name).filter(Boolean) as string[];

        // Fetch data with selected columns
        if (columnNames.length > 0) {
            await dataService.getData({ columns: columnNames });
        }
    };

    // Filter update handler
    const onFilterUpdate = (state: { buckets: typeof filterBuckets }) => {
        setFilterBuckets(state.buckets);
        // TODO: Apply filters to data
    };

    return (
        <main className="grid grid-cols-[auto_auto_1fr] h-full">
            <FieldsKeeperProvider instanceId="pivot" allItems={allPivotItems} buckets={pivotBuckets} onUpdate={onPivotUpdate}>
                <FieldsKeeperProvider instanceId="filters" allItems={allPivotItems} buckets={filterBuckets} onUpdate={onFilterUpdate}>
                    {children}
                </FieldsKeeperProvider>
            </FieldsKeeperProvider>
        </main>
    );
}
