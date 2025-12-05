import type { IFieldsKeeperBucket } from 'react-fields-keeper';
import type { IColumnField } from '@/store/appStore';

/**
 * Helper functions for pivot operations
 */

export const getPivotColumns = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
    const columnsBucket = buckets.find((b) => b.id === 'columns');
    return columnsBucket?.items.map((item) => item.value?.name).filter(Boolean) || [];
};

export const getPivotValues = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
    const valuesBucket = buckets.find((b) => b.id === 'values');
    return valuesBucket?.items.map((item) => item.value?.name).filter(Boolean) || [];
};

export const hasPivotConfiguration = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
    const columns = getPivotColumns(buckets);
    const values = getPivotValues(buckets);
    return columns.length > 0 || values.length > 0;
};
