use arrow_array::{Array, Float64Array, Int64Array};
use arrow_schema::DataType;
use wasm_bindgen::JsValue;

use crate::error::js_err;
use crate::query_types::PivotAggregation;

/// Compute aggregation for a set of row indices over a generic Arrow array.
/// Dispatches to numeric helpers for Int64/Float64 and supports COUNT for any
/// type by counting non-null values.
pub fn compute_aggregation(
    array: &dyn Array,
    indices: &[usize],
    agg: &PivotAggregation,
) -> Result<f64, JsValue> {
    match array.data_type() {
        DataType::Int64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Int64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Int64Array"))?;
            compute_numeric_aggregation_i64(arr, indices, agg)
        }
        DataType::Float64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Float64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Float64Array"))?;
            compute_numeric_aggregation_f64(arr, indices, agg)
        }
        dt => {
            // Allow COUNT on any type by counting non-null values
            if let PivotAggregation::Count = agg {
                let mut count = 0usize;
                for &idx in indices {
                    if !array.is_null(idx) {
                        count += 1;
                    }
                }
                Ok(count as f64)
            } else {
                Err(js_err(&format!(
                    "Aggregation not supported for type {:?}",
                    dt
                )))
            }
        }
    }
}

/// Compute numeric aggregation for Int64
pub fn compute_numeric_aggregation_i64(
    array: &Int64Array,
    indices: &[usize],
    agg: &PivotAggregation,
) -> Result<f64, JsValue> {
    let mut values = Vec::new();
    for &idx in indices {
        if !array.is_null(idx) {
            values.push(array.value(idx) as f64);
        }
    }

    if values.is_empty() {
        return Ok(0.0);
    }

    match agg {
        PivotAggregation::Sum => Ok(values.iter().sum()),
        PivotAggregation::Average => Ok(values.iter().sum::<f64>() / values.len() as f64),
        PivotAggregation::Count => Ok(values.len() as f64),
        PivotAggregation::Min => values
            .iter()
            .min_by(|a, b| a.partial_cmp(b).unwrap())
            .copied()
            .ok_or_else(|| js_err("Min failed")),
        PivotAggregation::Max => values
            .iter()
            .max_by(|a, b| a.partial_cmp(b).unwrap())
            .copied()
            .ok_or_else(|| js_err("Max failed")),
    }
}

/// Compute numeric aggregation for Float64
pub fn compute_numeric_aggregation_f64(
    array: &Float64Array,
    indices: &[usize],
    agg: &PivotAggregation,
) -> Result<f64, JsValue> {
    let mut values = Vec::new();
    for &idx in indices {
        if !array.is_null(idx) {
            values.push(array.value(idx));
        }
    }

    if values.is_empty() {
        return Ok(0.0);
    }

    match agg {
        PivotAggregation::Sum => Ok(values.iter().sum()),
        PivotAggregation::Average => Ok(values.iter().sum::<f64>() / values.len() as f64),
        PivotAggregation::Count => Ok(values.len() as f64),
        PivotAggregation::Min => values
            .iter()
            .min_by(|a, b| a.partial_cmp(b).unwrap())
            .copied()
            .ok_or_else(|| js_err("Min failed")),
        PivotAggregation::Max => values
            .iter()
            .max_by(|a, b| a.partial_cmp(b).unwrap())
            .copied()
            .ok_or_else(|| js_err("Max failed")),
    }
}
