use arrow_array::{Array, Float64Array, Int64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use std::collections::HashMap;
use std::sync::Arc;
use wasm_bindgen::JsValue;

use crate::error::js_err;
use crate::query_types::{PivotAggregation, PivotSpec};

/// Apply pivot/grouping to record batches
pub fn apply_pivot(
    batches: Vec<RecordBatch>,
    pivot_spec: &PivotSpec,
) -> Result<Vec<RecordBatch>, JsValue> {
    if batches.is_empty() {
        return Ok(batches);
    }

    // Concatenate all batches
    let combined = if batches.len() > 1 {
        arrow_select::concat::concat_batches(&batches[0].schema(), &batches)
            .map_err(|e| js_err(&format!("Failed to concatenate batches: {}", e)))?
    } else {
        batches[0].clone()
    };

    // Simple grouping by row columns with aggregations
    let result = group_and_aggregate(&combined, pivot_spec)?;

    Ok(vec![result])
}

/// Group by row columns and aggregate value columns
fn group_and_aggregate(
    batch: &RecordBatch,
    pivot_spec: &PivotSpec,
) -> Result<RecordBatch, JsValue> {
    // Get indices for row columns
    let row_indices: Vec<usize> = pivot_spec
        .rows
        .iter()
        .map(|col| {
            batch
                .schema()
                .index_of(col)
                .map_err(|_| js_err(&format!("Row column not found: {}", col)))
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Get indices for value columns
    let value_indices: Vec<(usize, &PivotAggregation)> = pivot_spec
        .values
        .iter()
        .map(|pv| {
            batch
                .schema()
                .index_of(&pv.column)
                .map(|idx| (idx, &pv.aggregation))
                .map_err(|_| js_err(&format!("Value column not found: {}", pv.column)))
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Group rows by creating a hash of row values
    let mut groups: HashMap<Vec<String>, Vec<usize>> = HashMap::new();

    for row_idx in 0..batch.num_rows() {
        let mut key = Vec::new();

        for &col_idx in &row_indices {
            let array = batch.column(col_idx);
            let val = get_string_value(array.as_ref(), row_idx)?;
            key.push(val);
        }

        groups.entry(key).or_insert_with(Vec::new).push(row_idx);
    }

    // Build result schema
    let mut result_fields = Vec::new();
    let batch_schema = batch.schema();
    for col in &pivot_spec.rows {
        let field = batch_schema
            .field_with_name(col)
            .map_err(|_| js_err(&format!("Field not found: {}", col)))?;
        result_fields.push(field.clone());
    }

    for pv in &pivot_spec.values {
        let field_name = format!("{}_{:?}", pv.column, pv.aggregation);
        result_fields.push(Field::new(field_name, DataType::Float64, true));
    }

    let result_schema: SchemaRef = Arc::new(Schema::new(result_fields));

    // Build result arrays
    let mut result_columns: Vec<Arc<dyn Array>> = Vec::new();

    // Add row columns
    for i in 0..row_indices.len() {
        let mut values = Vec::new();
        for key in groups.keys() {
            values.push(key[i].clone());
        }

        let string_array = StringArray::from(values);
        result_columns.push(Arc::new(string_array));
    }

    // Add aggregated value columns
    for &(value_idx, agg) in &value_indices {
        let mut agg_values = Vec::new();

        for row_indices in groups.values() {
            let agg_result = compute_aggregation(batch.column(value_idx).as_ref(), row_indices, agg)?;
            agg_values.push(agg_result);
        }

        let float_array = Float64Array::from(agg_values);
        result_columns.push(Arc::new(float_array));
    }

    RecordBatch::try_new(result_schema, result_columns)
        .map_err(|e| js_err(&format!("Failed to create result batch: {}", e)))
}

/// Get string representation of a value at index
fn get_string_value(array: &dyn Array, idx: usize) -> Result<String, JsValue> {
    if array.is_null(idx) {
        return Ok("null".to_string());
    }

    match array.data_type() {
        DataType::Utf8 | DataType::LargeUtf8 => {
            let arr = array
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| js_err("Failed to downcast to StringArray"))?;
            Ok(arr.value(idx).to_string())
        }
        DataType::Int64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Int64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Int64Array"))?;
            Ok(arr.value(idx).to_string())
        }
        DataType::Float64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Float64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Float64Array"))?;
            Ok(arr.value(idx).to_string())
        }
        dt => Err(js_err(&format!("Unsupported type for grouping: {:?}", dt))),
    }
}

/// Compute aggregation for a set of row indices
fn compute_aggregation(
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
        dt => Err(js_err(&format!(
            "Aggregation not supported for type {:?}",
            dt
        ))),
    }
}

/// Compute numeric aggregation for Int64
fn compute_numeric_aggregation_i64(
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
fn compute_numeric_aggregation_f64(
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
