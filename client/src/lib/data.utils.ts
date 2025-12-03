import type { IColumnInfo, IPivotOptions } from '@/services/dataService';
import type { IColumnField } from '@/store/fieldsStore';
import type { IFieldsKeeperBucket } from 'react-fields-keeper';

export const getCurrentPivotItems = (pivotBuckets: IFieldsKeeperBucket<IColumnField>[]) => {
    const bucketItems = pivotBuckets.filter((b) => b.id === 'columns' || b.id === 'values').flatMap((b) => b.items);
    return bucketItems;
};

export const getPivotItemsToFetchData = (pivotBuckets: IFieldsKeeperBucket<IColumnField>[]): IPivotOptions => {
    const rowBucket = pivotBuckets.find((b) => b.id === 'columns')?.items;
    const valueBucket = pivotBuckets.find((b) => b.id === 'values')?.items;

    const rowsInfo =
        rowBucket?.map((row) => ({
            column: row.value?.name ?? '',
        })) ?? [];
    const valuesInfo =
        valueBucket
            ?.filter((value) => value.value?.name)
            .map(
                (value) =>
                    ({
                        column: value.value?.name ?? '',
                        aggregation: value.value?.aggregate ?? 'sum',
                    }) as IColumnInfo,
            ) ?? [];

    return {
        rows: rowsInfo,
        values: valuesInfo,
    };
};
