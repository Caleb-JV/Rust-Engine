import type { IFieldsKeeperBucket } from "react-fields-keeper";
import type { IColumnField } from "@/store/fieldsStore";

/**
 * Helper functions for pivot operations
 */

export const getPivotColumns = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
  const columnsBucket = buckets.find((b) => b.id === "columns");
  return columnsBucket?.items.map((item) => item.value?.name).filter(Boolean) || [];
};

export const getPivotValues = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
  const valuesBucket = buckets.find((b) => b.id === "values");
  return valuesBucket?.items.map((item) => item.value?.name).filter(Boolean) || [];
};

export const hasPivotConfiguration = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
  const columns = getPivotColumns(buckets);
  const values = getPivotValues(buckets);
  return columns.length > 0 || values.length > 0;
};

export const getFilterFields = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
  const filtersBucket = buckets.find((b) => b.id === "filters");
  return filtersBucket?.items.map((item) => item.value) || [];
};

export const hasFilters = (buckets: IFieldsKeeperBucket<IColumnField>[]) => {
  return getFilterFields(buckets).length > 0;
};
