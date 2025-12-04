use arrow_array::{
    Array, BooleanArray, Float64Array, Int64Array, RecordBatch, StringArray,
    builder::BooleanBuilder,
};
use arrow_schema::DataType;
use wasm_bindgen::JsValue;

use arrow_ord::cmp;
use arrow_arith::boolean as boolean_kernels;
use arrow_select::filter::filter_record_batch;
use arrow_string::like;

use crate::error::js_err;
use crate::query_types::{FilterCondition, FilterOperator, FilterValue};
use chrono::{NaiveDate, NaiveDateTime};


/// Extension helpers for FilterValue so we don't repeat matches everywhere.
trait FilterValueExt {
    fn as_i64(&self) -> Result<i64, JsValue>;
    fn as_f64(&self) -> Result<f64, JsValue>;
    fn as_str(&self) -> Result<&str, JsValue>;
    fn as_bool(&self) -> Result<bool, JsValue>;
    fn as_array_str(&self) -> Result<&[String], JsValue>;
    fn as_range_i64(&self) -> Result<(i64, i64), JsValue>;
    fn as_range_f64(&self) -> Result<(f64, f64), JsValue>;
    fn as_date32(&self) -> Result<i32, JsValue>;
    fn as_date_range32(&self) -> Result<(i32, i32), JsValue>;
    fn as_date64(&self) -> Result<i64, JsValue>;
    fn as_date_range64(&self) -> Result<(i64, i64), JsValue>;
}

impl FilterValueExt for FilterValue {
    fn as_i64(&self) -> Result<i64, JsValue> {
        match self {
            FilterValue::Number(n) => Ok(*n as i64),
            _ => Err(js_err("Expected numeric value")),
        }
    }

    fn as_f64(&self) -> Result<f64, JsValue> {
        match self {
            FilterValue::Number(n) => Ok(*n),
            _ => Err(js_err("Expected numeric value")),
        }
    }

    fn as_str(&self) -> Result<&str, JsValue> {
        match self {
            FilterValue::String(s) => Ok(s.as_str()),
            _ => Err(js_err("Expected string value")),
        }
    }

    fn as_bool(&self) -> Result<bool, JsValue> {
        match self {
            FilterValue::Boolean(b) => Ok(*b),
            _ => Err(js_err("Expected boolean value")),
        }
    }

    fn as_array_str(&self) -> Result<&[String], JsValue> {
        match self {
            FilterValue::Array(v) => Ok(v.as_slice()),
            _ => Err(js_err("Expected array of strings")),
        }
    }

    fn as_range_i64(&self) -> Result<(i64, i64), JsValue> {
        match self {
            FilterValue::Range { min, max } => Ok((*min as i64, *max as i64)),
            _ => Err(js_err("Expected range value")),
        }
    }

    fn as_range_f64(&self) -> Result<(f64, f64), JsValue> {
        match self {
            FilterValue::Range { min, max } => Ok((*min, *max)),
            _ => Err(js_err("Expected range value")),
        }
    }
    fn as_date32(&self) -> Result<i32, JsValue> {
        match self {
            FilterValue::Date(s) => {
                let d = NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .map_err(|_| js_err("Invalid date, expected YYYY-MM-DD"))?;
                let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
                Ok(d.signed_duration_since(epoch).num_days() as i32)
            }
            _ => Err(js_err("Expected date value")),
        }
    }

    fn as_date64(&self) -> Result<i64, JsValue> {
        match self {
            FilterValue::Date(s) => {
                let dt = NaiveDateTime::parse_from_str(&format!("{} 00:00:00", s), "%Y-%m-%d %H:%M:%S")
                    .map_err(|_| js_err("Invalid date, expected YYYY-MM-DD"))?;
                Ok(dt.timestamp_millis())
            }
            _ => Err(js_err("Expected date value")),
        }
    }

    fn as_date_range32(&self) -> Result<(i32, i32), JsValue> {
        match self {
            FilterValue::DateRange { min, max } => {
                let min_d = NaiveDate::parse_from_str(min, "%Y-%m-%d")
                    .map_err(|_| js_err("Invalid date range min"))?;
                let max_d = NaiveDate::parse_from_str(max, "%Y-%m-%d")
                    .map_err(|_| js_err("Invalid date range max"))?;

                let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
                Ok((
                    min_d.signed_duration_since(epoch).num_days() as i32,
                    max_d.signed_duration_since(epoch).num_days() as i32
                ))
            }
            _ => Err(js_err("Expected date range")),
        }
    }

    fn as_date_range64(&self) -> Result<(i64, i64), JsValue> {
        match self {
            FilterValue::DateRange { min, max } => {
                let min_dt = NaiveDate::parse_from_str(min, "%Y-%m-%d")
                    .map_err(|_| js_err("Invalid date range min"))?
                    .and_hms_opt(0,0,0).unwrap();

                let max_dt = NaiveDate::parse_from_str(max, "%Y-%m-%d")
                    .map_err(|_| js_err("Invalid date range max"))?
                    .and_hms_opt(23,59,59).unwrap();

                Ok((min_dt.timestamp_millis(), max_dt.timestamp_millis()))
            }
            _ => Err(js_err("Expected date range")),
        }
    }
}

/// Apply filters to record batches using Arrow vectorized kernels.
pub fn apply_filters(
    batches: Vec<RecordBatch>,
    filters: &[FilterCondition],
) -> Result<Vec<RecordBatch>, JsValue> {
    if filters.is_empty() {
        return Ok(batches);
    }

    let mut filtered_batches = Vec::new();

    for batch in batches {
        let mut filter_mask: Option<BooleanArray> = None;

        for condition in filters {
            let col_index = batch
                .schema()
                .index_of(&condition.column)
                .map_err(|_| js_err(&format!("Column not found: {}", condition.column)))?;

            let array = batch.column(col_index);
            let condition_mask = apply_filter_condition(array.as_ref(), condition)?;

            filter_mask = Some(match filter_mask {
                None => condition_mask,
                Some(existing) => boolean_kernels::and(&existing, &condition_mask)
                    .map_err(|e| js_err(&format!("Mask AND error: {}", e)))?,
            });
        }

        if let Some(mask) = filter_mask {
            let filtered = filter_record_batch(&batch, &mask)
                .map_err(|e| js_err(&format!("Filter error: {}", e)))?;

            if filtered.num_rows() > 0 {
                filtered_batches.push(filtered);
            }
        }
    }

    Ok(filtered_batches)
}

fn apply_date32_filter(
    array: &arrow_array::Date32Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {

    let len = array.len();

    let mask = match condition.operator {
        FilterOperator::Equals
        | FilterOperator::NotEquals
        | FilterOperator::GreaterThan
        | FilterOperator::LessThan
        | FilterOperator::GreaterThanOrEqual
        | FilterOperator::LessThanOrEqual => {

            let val = condition.value.as_date32()?;
            let rhs = arrow_array::Date32Array::from(vec![val; len]);

            let res = match condition.operator {
                FilterOperator::Equals => cmp::eq(array, &rhs),
                FilterOperator::NotEquals => cmp::neq(array, &rhs),
                FilterOperator::GreaterThan => cmp::gt(array, &rhs),
                FilterOperator::LessThan => cmp::lt(array, &rhs),
                FilterOperator::GreaterThanOrEqual => cmp::gt_eq(array, &rhs),
                FilterOperator::LessThanOrEqual => cmp::lt_eq(array, &rhs),
                _ => unreachable!(),
            };

            res.map_err(|e| js_err(&format!("Date32 cmp error: {}", e)))?
        }

        FilterOperator::Between => {
            let (min32, max32) = condition.value.as_date_range32()?;
            let min_arr = arrow_array::Date32Array::from(vec![min32; len]);
            let max_arr = arrow_array::Date32Array::from(vec![max32; len]);

            let ge = cmp::gt_eq(array, &min_arr)
                .map_err(|e| js_err(&format!("Date32 >= error: {}", e)))?;
            let le = cmp::lt_eq(array, &max_arr)
                .map_err(|e| js_err(&format!("Date32 <= error: {}", e)))?;

            boolean_kernels::and(&ge, &le)
                .map_err(|e| js_err(&format!("Date32 BETWEEN AND error: {}", e)))?
        }

        _ => return Err(js_err("Unsupported date operator")),
    };
 
    Ok(mask)
}


fn apply_date64_filter(
    array: &arrow_array::Date64Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let len = array.len();

    let mask = match condition.operator {
        FilterOperator::Equals
        | FilterOperator::NotEquals
        | FilterOperator::GreaterThan
        | FilterOperator::LessThan
        | FilterOperator::GreaterThanOrEqual
        | FilterOperator::LessThanOrEqual => {

            let val = condition.value.as_date64()?;
            let rhs = arrow_array::Date64Array::from(vec![val; len]);

            let res = match condition.operator {
                FilterOperator::Equals => cmp::eq(array, &rhs),
                FilterOperator::NotEquals => cmp::neq(array, &rhs),
                FilterOperator::GreaterThan => cmp::gt(array, &rhs),
                FilterOperator::LessThan => cmp::lt(array, &rhs),
                FilterOperator::GreaterThanOrEqual => cmp::gt_eq(array, &rhs),
                FilterOperator::LessThanOrEqual => cmp::lt_eq(array, &rhs),
                _ => unreachable!(),
            };

            res.map_err(|e| js_err(&format!("Date64 cmp error: {}", e)))?
        }

        FilterOperator::Between => {
            let (min_ts, max_ts) = condition.value.as_date_range64()?;

            let min_arr = arrow_array::Date64Array::from(vec![min_ts; len]);
            let max_arr = arrow_array::Date64Array::from(vec![max_ts; len]);

            let ge = cmp::gt_eq(array, &min_arr)
                .map_err(|e| js_err(&format!("Date64 >= error: {}", e)))?;

            let le = cmp::lt_eq(array, &max_arr)
                .map_err(|e| js_err(&format!("Date64 <= error: {}", e)))?;

            boolean_kernels::and(&ge, &le)
                .map_err(|e| js_err(&format!("Date64 BETWEEN error: {}", e)))?
        }

        _ => return Err(js_err("Unsupported date operator for Date64")),
    };

    Ok(mask)
}


/// Dispatch filter condition based on array datatype.
fn apply_filter_condition(
    array: &dyn Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    match array.data_type() {
        DataType::Utf8 | DataType::LargeUtf8 => {
            let arr = array
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| js_err("Failed to downcast to StringArray"))?;
            apply_string_filter_kernel(arr, condition)
        }
        DataType::Int64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Int64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Int64Array"))?;
            apply_numeric_filter_i64_kernel(arr, condition)
        }
        DataType::Float64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Float64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Float64Array"))?;
            apply_numeric_filter_f64_kernel(arr, condition)
        }
        DataType::Boolean => {
            let arr = array
                .as_any()
                .downcast_ref::<BooleanArray>()
                .ok_or_else(|| js_err("Failed to downcast to BooleanArray"))?;
            apply_boolean_filter(arr, condition)
        }
        DataType::Date32 => {
    let arr = array.as_any()
        .downcast_ref::<arrow_array::Date32Array>()
        .ok_or_else(|| js_err("Failed to downcast to Date32Array"))?;
    apply_date32_filter(arr, condition)
}

DataType::Date64 => {
    let arr = array.as_any()
        .downcast_ref::<arrow_array::Date64Array>()
        .ok_or_else(|| js_err("Failed to downcast to Date64Array"))?;
    apply_date64_filter(arr, condition)
}

        dt => Err(js_err(&format!(
            "Filtering not supported for type {:?}",
            dt
        ))),
    }
}

/// String filters using Arrow string + boolean kernels.
fn apply_string_filter_kernel(
    array: &StringArray,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    match condition.operator {
        FilterOperator::Equals | FilterOperator::NotEquals => {
            let val = condition.value.as_str()?;
            let rhs = StringArray::from(vec![val; array.len()]);

            let mask = match condition.operator {
                FilterOperator::Equals => cmp::eq(array, &rhs),
                FilterOperator::NotEquals => cmp::neq(array, &rhs),
                _ => unreachable!(),
            }
            .map_err(|e| js_err(&format!("String cmp error: {}", e)))?;

            Ok(mask)
        }

        FilterOperator::Contains | FilterOperator::NotContains => {
            let val = condition.value.as_str()?;
            let rhs = StringArray::from(vec![val; array.len()]);

            let matches = like::contains(array, &rhs)
                .map_err(|e| js_err(&format!("contains error: {}", e)))?;

            if matches.len() != array.len() {
                return Err(js_err("Contains result length mismatch"));
            }

            if let FilterOperator::Contains = condition.operator {
                Ok(matches)
            } else {
                // NOT CONTAINS
                boolean_kernels::not(&matches)
                    .map_err(|e| js_err(&format!("NOT error: {}", e)))
            }
        }

        FilterOperator::In | FilterOperator::NotIn => {
            let values = condition.value.as_array_str()?;
            if values.is_empty() {
                // IN [] -> always false
                let mut builder =
                    BooleanBuilder::with_capacity(array.len());
                return Ok(builder.finish());
            }

            // OR-chain eq masks
            let mut mask: Option<BooleanArray> = None;
            for v in values {
                let rhs = StringArray::from(vec![v.as_str(); array.len()]);
                let eq = cmp::eq(array, &rhs)
                    .map_err(|e| js_err(&format!("eq_utf8 error: {}", e)))?;

                mask = Some(match mask {
                    None => eq,
                    Some(prev) => boolean_kernels::or(&prev, &eq)
                        .map_err(|e| js_err(&format!("OR error: {}", e)))?,
                });
            }

            let in_mask = mask.ok_or_else(|| js_err("IN with empty value list"))?;

            if let FilterOperator::In = condition.operator {
                Ok(in_mask)
            } else {
                // NOT IN
                boolean_kernels::not(&in_mask)
                    .map_err(|e| js_err(&format!("NOT error: {}", e)))
            }
        }

        _ => Err(js_err("Unsupported operator for string type")),
    }
}

/// Int64 filters using Arrow cmp + boolean kernels.
fn apply_numeric_filter_i64_kernel(
    array: &Int64Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let len = array.len();

    let mask = match condition.operator {
        FilterOperator::Equals
        | FilterOperator::NotEquals
        | FilterOperator::GreaterThan
        | FilterOperator::LessThan
        | FilterOperator::GreaterThanOrEqual
        | FilterOperator::LessThanOrEqual => {
            let val = condition.value.as_i64()?;
            let rhs = Int64Array::from(vec![val; len]);

            let res = match condition.operator {
                FilterOperator::Equals => cmp::eq(array, &rhs),
                FilterOperator::NotEquals => cmp::neq(array, &rhs),
                FilterOperator::GreaterThan => cmp::gt(array, &rhs),
                FilterOperator::LessThan => cmp::lt(array, &rhs),
                FilterOperator::GreaterThanOrEqual => cmp::gt_eq(array, &rhs),
                FilterOperator::LessThanOrEqual => cmp::lt_eq(array, &rhs),
                _ => unreachable!(),
            };

            res.map_err(|e| js_err(&format!("Int64 cmp error: {}", e)))?
        }

        FilterOperator::Between => {
            let (min_i64, max_i64) = condition.value.as_range_i64()?;

            let min_arr = Int64Array::from(vec![min_i64; len]);
            let max_arr = Int64Array::from(vec![max_i64; len]);

            let ge = cmp::gt_eq(array, &min_arr)
                .map_err(|e| js_err(&format!("Int64 >= error: {}", e)))?;
            let le = cmp::lt_eq(array, &max_arr)
                .map_err(|e| js_err(&format!("Int64 <= error: {}", e)))?;

            boolean_kernels::and(&ge, &le)
                .map_err(|e| js_err(&format!("Int64 BETWEEN AND error: {}", e)))?
        }

        _ => return Err(js_err("Unsupported operator for Int64")),
    };

    Ok(mask)
}

/// Float64 filters using Arrow cmp + boolean kernels.
fn apply_numeric_filter_f64_kernel(
    array: &Float64Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let len = array.len();

    let mask = match condition.operator {
        FilterOperator::Equals
        | FilterOperator::NotEquals
        | FilterOperator::GreaterThan
        | FilterOperator::LessThan
        | FilterOperator::GreaterThanOrEqual
        | FilterOperator::LessThanOrEqual => {
            let val = condition.value.as_f64()?;
            let rhs = Float64Array::from(vec![val; len]);

            let res = match condition.operator {
                FilterOperator::Equals => cmp::eq(array, &rhs),
                FilterOperator::NotEquals => cmp::neq(array, &rhs),
                FilterOperator::GreaterThan => cmp::gt(array, &rhs),
                FilterOperator::LessThan => cmp::lt(array, &rhs),
                FilterOperator::GreaterThanOrEqual => cmp::gt_eq(array, &rhs),
                FilterOperator::LessThanOrEqual => cmp::lt_eq(array, &rhs),
                _ => unreachable!(),
            };

            res.map_err(|e| js_err(&format!("Float64 cmp error: {}", e)))?
        }

        FilterOperator::Between => {
            let (min_f64, max_f64) = condition.value.as_range_f64()?;

            let min_arr = Float64Array::from(vec![min_f64; len]);
            let max_arr = Float64Array::from(vec![max_f64; len]);

            let ge = cmp::gt_eq(array, &min_arr)
                .map_err(|e| js_err(&format!("Float64 >= error: {}", e)))?;
            let le = cmp::lt_eq(array, &max_arr)
                .map_err(|e| js_err(&format!("Float64 <= error: {}", e)))?;

            boolean_kernels::and(&ge, &le)
                .map_err(|e| js_err(&format!("Float64 BETWEEN AND error: {}", e)))?
        }

        _ => return Err(js_err("Unsupported operator for Float64")),
    };

    Ok(mask)
}

/// Boolean filters (tiny, so loop is fine; Arrow has no direct eq kernels for Boolean).
fn apply_boolean_filter(
    array: &BooleanArray,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let len = array.len();
    let mut builder = BooleanBuilder::with_capacity(len);

    match condition.operator {
        FilterOperator::Equals => {
            let val = condition.value.as_bool()?;
            for i in 0..len {
                if array.is_null(i) {
                    builder.append_value(false);
                } else {
                    builder.append_value(array.value(i) == val);
                }
            }
        }
        FilterOperator::NotEquals => {
            let val = condition.value.as_bool()?;
            for i in 0..len {
                if array.is_null(i) {
                    builder.append_value(false);
                } else {
                    builder.append_value(array.value(i) != val);
                }
            }
        }
        _ => return Err(js_err("Unsupported operator for boolean type")),
    }

    Ok(builder.finish())
}
