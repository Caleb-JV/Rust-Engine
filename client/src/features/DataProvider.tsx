import React from 'react';
import { FieldsKeeperProvider } from 'react-fields-keeper';
import { useAppStore } from '../store/appStore';
import { dataService } from '../services/dataService';
import './fields-keeper-custom.css';
import { getCurrentPivotItems } from '@/lib/data.utils';

interface IDataProvider {
    children: React.ReactNode;
}

export default function DataProvider(props: IDataProvider) {
    // props
    const { children } = props;

    // state
    const pivotBuckets = useAppStore((state) => state.pivotBuckets);
    const fileName = useAppStore((state) => state.fileName);
    const setPivotBuckets = useAppStore((state) => state.setPivotBuckets);

    // Get all field items from service

    const allPivotItems = React.useMemo(() => {
        if (fileName) return dataService.getAllFieldItems();

        return [];
    }, [fileName]);

    // Pivot update handler - triggers getData
    const onPivotUpdate = (state: { buckets: typeof pivotBuckets }) => {
        const { buckets } = state;
        const items = getCurrentPivotItems(buckets);
        const categoryItems = items.filter((item) => item.type === 'category');
        const valueItems = items.filter((item) => item.type === 'value');

        const updatedBuckets = buckets.map((bucket) => {
            if (bucket.id === 'columns') return { ...bucket, items: categoryItems };
            if (bucket.id === 'values') return { ...bucket, items: valueItems };
            return bucket;
        });

        setPivotBuckets(updatedBuckets);
        dataService.getData();
    };

    return (
        <main className="grid grid-cols-[auto_auto_auto_1fr] h-[calc(100vh-60px)]">
            <FieldsKeeperProvider instanceId="pivot" allItems={allPivotItems} buckets={pivotBuckets} onUpdate={onPivotUpdate}>
                {children}
            </FieldsKeeperProvider>
        </main>
    );
}
