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

    // Debounce timer ref - stable across renders
    const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    // Track last bucket state to prevent redundant updates
    const lastBucketsRef = React.useRef<string>('');

    // Get all field items from service
    const allPivotItems = React.useMemo(() => {
        if (fileName) return dataService.getAllFieldItems();

        return [];
    }, [fileName]);

    // Cleanup debounce timer on unmount
    React.useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // Pivot update handler - triggers getData with debounce
    // Memoized to prevent unnecessary re-triggering from FieldsKeeperProvider
    const onPivotUpdate = React.useCallback(
        (state: { buckets: typeof pivotBuckets }) => {
            const { buckets } = state;
            const items = getCurrentPivotItems(buckets);
            const categoryItems = items.filter((item) => item.type === 'category');
            const valueItems = items.filter((item) => item.type === 'value');

            const updatedBuckets = buckets.map((bucket) => {
                if (bucket.id === 'columns') return { ...bucket, items: categoryItems };
                if (bucket.id === 'values') return { ...bucket, items: valueItems };
                return bucket;
            });

            // Check if buckets actually changed to prevent redundant queries
            const bucketsKey = JSON.stringify(updatedBuckets.map((b) => ({ id: b.id, items: b.items.map((i) => i.id) })));
            if (bucketsKey === lastBucketsRef.current) {
                return; // No actual change, skip update
            }
            lastBucketsRef.current = bucketsKey;

            setPivotBuckets(updatedBuckets);

            // Clear existing timer and set new one
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            // Set new timer to call getData after 500ms (increased for better batching)
            debounceTimerRef.current = setTimeout(() => {
                dataService.getData();
            }, 1000);
        },
        [setPivotBuckets],
    );

    return (
        <main className="grid grid-cols-[auto_auto_auto_1fr] h-[calc(100vh-60px)]">
            <FieldsKeeperProvider instanceId="pivot" allItems={allPivotItems} buckets={pivotBuckets} onUpdate={onPivotUpdate}>
                {children}
            </FieldsKeeperProvider>
        </main>
    );
}
