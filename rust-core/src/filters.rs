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

use crate::utils::error::js_err;
use crate::types::query_types::{FilterCondition, FilterOperator, FilterValue};


/// Extension helpers for FilterValue so we don't repeat matches everywhere.
trait FilterValueExt {
    fn as_i64(&self) -> Result<i64, JsValue>;
    fn as_f64(&self) -> Result<f64, JsValue>;
    fn as_str(&self) -> Result<&str, JsValue>;
    fn as_bool(&self) -> Result<bool, JsValue>;
    fn as_array_str(&self) -> Result<&[String], JsValue>;
    fn as_range_i64(&self) -> Result<(i64, i64), JsValue>;
    fn as_range_f64(&self) -> Result<(f64, f64), JsValue>;
}

impl FilterValueExt for FilterValue {
    fn as_i64(&self) -> Result<i64, JsValue> {
    match self {
        FilterValue::Number(n) => {
            if n.is_finite() {
                Ok(*n as i64)
            } else {
                Err(js_err("Invalid numeric value"))
            }
        }

        FilterValue::String(s) => {
            // Try parsing string into i64
            s.parse::<i64>()
                .map_err(|_| js_err("Expected string that can be parsed to integer"))
        }

        _ => Err(js_err("Expected numeric or numeric-string value")),
    }
}


    fn as_f64(&self) -> Result<f64, JsValue> {
    match self {
        FilterValue::Number(n) => Ok(*n),

        FilterValue::String(s) => {
            s.parse::<f64>()
                .map_err(|_| js_err("Expected string that can be parsed to a number"))
        }

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
