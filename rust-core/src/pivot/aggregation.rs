use arrow_array::{Array, PrimitiveArray, UInt32Array};
use arrow_schema::DataType;
use arrow::compute::take;
use arrow::compute::kernels::aggregate::{sum, min, max};
use wasm_bindgen::JsValue;

use crate::utils::error::js_err;
use crate::types::query_types::PivotAggregation;

pub fn compute_aggregation(
    array: &dyn Array,
    indices: &[usize],
    agg: &PivotAggregation,
) -> Result<f64, JsValue> {

    let idx_array = UInt32Array::from(
        indices.iter().map(|i| *i as u32).collect::<Vec<_>>()
    );

    let taken = take(array, &idx_array, None)
        .map_err(|e| js_err(&format!("Take failed: {:?}", e)))?;

    if let PivotAggregation::Count = agg {
        return Ok((taken.len() - taken.null_count()) as f64);
    }

    match array.data_type() {
        DataType::Int64 => {
            let prim = taken
                .as_any()
                .downcast_ref::<PrimitiveArray<arrow_array::types::Int64Type>>()
                .ok_or_else(|| js_err("Downcast to PrimitiveArray<i64> failed"))?;

            compute_numeric_int64(prim, agg)
        }

        DataType::Float64 => {
            let prim = taken
                .as_any()
                .downcast_ref::<PrimitiveArray<arrow_array::types::Float64Type>>()
                .ok_or_else(|| js_err("Downcast to PrimitiveArray<f64> failed"))?;

            compute_numeric_f64(prim, agg)
        }

        dt => Err(js_err(&format!("Unsupported type {:?}", dt))),
    }
}

//
// ----- INT64 IMPLEMENTATION -----
//
fn compute_numeric_int64(
    array: &PrimitiveArray<arrow_array::types::Int64Type>,
    agg: &PivotAggregation,
) -> Result<f64, JsValue> {
    match agg {
        PivotAggregation::Sum =>
            Ok(sum::<arrow_array::types::Int64Type>(array).unwrap_or(0) as f64),

        PivotAggregation::Average => {
            let total = sum::<arrow_array::types::Int64Type>(array).unwrap_or(0) as f64;
            let count = (array.len() - array.null_count()) as f64;
            Ok(if count == 0.0 { 0.0 } else { total / count })
        }

        PivotAggregation::Min =>
            min::<arrow_array::types::Int64Type>(array)
                .map(|v| v as f64)
                .ok_or_else(|| js_err("Min returned None")),

        PivotAggregation::Max =>
            max::<arrow_array::types::Int64Type>(array)
                .map(|v| v as f64)
                .ok_or_else(|| js_err("Max returned None")),

        // ---- New: StdDev ----
        PivotAggregation::StdDev => compute_stddev_int64(array),

        // ---- New: First ----
        PivotAggregation::First => {
            let v = array.iter().flatten().next()
                .ok_or_else(|| js_err("No non-null values for FIRST"))?;
            Ok(v as f64)
        }

        // ---- New: Last ----
        PivotAggregation::Last => {
            let v = array.iter().flatten().last()
                .ok_or_else(|| js_err("No non-null values for LAST"))?;
            Ok(v as f64)
        }

        PivotAggregation::Count => unreachable!(),
    }
}

//
// ----- FLOAT64 IMPLEMENTATION -----
//
fn compute_numeric_f64(
    array: &PrimitiveArray<arrow_array::types::Float64Type>,
    agg: &PivotAggregation,
) -> Result<f64, JsValue> {
    match agg {
        PivotAggregation::Sum =>
            Ok(sum::<arrow_array::types::Float64Type>(array).unwrap_or(0.0)),

        PivotAggregation::Average => {
            let total = sum::<arrow_array::types::Float64Type>(array).unwrap_or(0.0);
            let count = (array.len() - array.null_count()) as f64;
            Ok(if count == 0.0 { 0.0 } else { total / count })
        }

        PivotAggregation::Min =>
            min::<arrow_array::types::Float64Type>(array)
                .ok_or_else(|| js_err("Min returned None")),

        PivotAggregation::Max =>
            max::<arrow_array::types::Float64Type>(array)
                .ok_or_else(|| js_err("Max returned None")),

        // ---- New: StdDev ----
        PivotAggregation::StdDev => compute_stddev_f64(array),

        // ---- New: First ----
        PivotAggregation::First => {
            let v = array.iter().flatten().next()
                .ok_or_else(|| js_err("No non-null values for FIRST"))?;
            Ok(v)
        }

        // ---- New: Last ----
        PivotAggregation::Last => {
            let v = array.iter().flatten().last()
                .ok_or_else(|| js_err("No non-null values for LAST"))?;
            Ok(v)
        }

        PivotAggregation::Count => unreachable!(),
    }
}

//
// ----- STDDEV HELPER FUNCTIONS -----
//
fn compute_stddev_int64(
    array: &PrimitiveArray<arrow_array::types::Int64Type>
) -> Result<f64, JsValue> {
    let values: Vec<f64> = array.iter().flatten().map(|v| v as f64).collect();
    compute_stddev_from_vec(&values)
}

fn compute_stddev_f64(
    array: &PrimitiveArray<arrow_array::types::Float64Type>
) -> Result<f64, JsValue> {
    let values: Vec<f64> = array.iter().flatten().collect();
    compute_stddev_from_vec(&values)
}

fn compute_stddev_from_vec(values: &[f64]) -> Result<f64, JsValue> {
    if values.is_empty() {
        return Ok(0.0);
    }
    let mean: f64 = values.iter().sum::<f64>() / values.len() as f64;
    let var: f64 = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;
    Ok(var.sqrt())
}
