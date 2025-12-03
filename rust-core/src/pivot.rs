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

    // When false, we suppress subtotal rows that represent only a single
    // underlying row (e.g. a City with exactly one Area).
    let include_single_row_subtotal = false;

    let row_indices: Vec<usize> = pivot_spec
        .rows
        .iter()
        .map(|row_spec| {
            let col_name = &row_spec.column;
            batch
                .schema()
                .index_of(col_name)
                .map_err(|_| js_err(&format!("Row column not found: {}", col_name)))
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
    for row_spec in &pivot_spec.rows {
        let col_name = &row_spec.column;
        let field = batch_schema
            .field_with_name(col_name)
            .map_err(|_| js_err(&format!("Field not found: {}", col_name)))?;
        result_fields.push(field.clone());
    }

    for pv in &pivot_spec.values {
        let field_name = format!("{}_{:?}", pv.column, pv.aggregation);
        result_fields.push(Field::new(field_name, DataType::Float64, true));
    }

    let result_schema: SchemaRef = Arc::new(Schema::new(result_fields));

    // --- Build ordered output rows with N-level subtotals and grand total ---
    // Collect groups into a Vec and sort by full key for stable ordering
    let mut group_entries: Vec<(Vec<String>, Vec<usize>)> = Vec::new();
    for (key, idxs) in groups.into_iter() {
        group_entries.push((key, idxs));
    }

    if group_entries.is_empty() {
        let empty = RecordBatch::new_empty(result_schema);
        return Ok(empty);
    }

    group_entries.sort_by(|(k1, _), (k2, _)| k1.cmp(k2));

    struct OutputRow {
        labels: Vec<String>,
        indices: Vec<usize>,
    }

    let mut output_rows: Vec<OutputRow> = Vec::new();

    let levels = pivot_spec.rows.len();
    if levels == 0 {
        // No row keys; just a grand total over all rows
        let all_indices: Vec<usize> = (0..batch.num_rows()).collect();
        let mut grand_labels = Vec::new();
        let mut labels = vec![String::new(); 1];
        labels[0] = "Grand Total".to_string();
        grand_labels.extend(labels);
        output_rows.push(OutputRow {
            labels: grand_labels,
            indices: all_indices,
        });
    } else {
        // Per-level subtotal state: prefix up to level l, accumulated indices,
        // and number of distinct groups contributing to that prefix.
        struct LevelState {
            prefix: Option<Vec<String>>, // keys[0..=l]
            indices: Vec<usize>,
            group_count: usize,
        }

        let mut level_states: Vec<LevelState> = (0..levels)
            .map(|_| LevelState {
                prefix: None,
                indices: Vec::new(),
                group_count: 0,
            })
            .collect();

        // Helper to flush subtotal for a given level
        let mut flush_level = |level: usize,
                               output_rows: &mut Vec<OutputRow>,
                               level_states: &mut [LevelState]| {
            if let Some(ref prefix) = level_states[level].prefix {
                let row_count = level_states[level].indices.len();
                let group_count = level_states[level].group_count;
                // Skip subtotals that summarize only a single group unless explicitly allowed.
                if row_count > 0 && (include_single_row_subtotal || group_count > 1) {
                    let mut labels = vec![String::new(); levels];
                    // Copy higher-level keys
                    for i in 0..level {
                        if let Some(v) = prefix.get(i) {
                            labels[i] = v.clone();
                        }
                    }
                    // Total label at this level
                    if let Some(v) = prefix.get(level) {
                        labels[level] = format!("Total ({})", v);
                    } else {
                        labels[level] = "Total".to_string();
                    }

                    output_rows.push(OutputRow {
                        labels,
                        indices: level_states[level].indices.clone(),
                    });
                }
                level_states[level].prefix = None;
                level_states[level].indices.clear();
                level_states[level].group_count = 0;
            }
        };

        for (idx, (key, row_idxs)) in group_entries.iter().enumerate() {
            // Ensure key has at least `levels` elements
            let mut normalized_key = key.clone();
            if normalized_key.len() < levels {
                normalized_key
                    .extend(std::iter::repeat(String::new()).take(levels - normalized_key.len()));
            }

            // Detect changes from deepest level up and flush subtotals
            for level in (0..levels).rev() {
                let current_prefix: Vec<String> = normalized_key[0..=level].to_vec();
                let needs_flush = match level_states[level].prefix {
                    None => false,
                    Some(ref p) => *p != current_prefix,
                };
                if needs_flush {
                    flush_level(level, &mut output_rows, &mut level_states);
                }
            }

            // Emit detail row
            output_rows.push(OutputRow {
                labels: normalized_key.clone(),
                indices: row_idxs.clone(),
            });

            // Update level states with this row's indices
            for level in 0..levels {
                let prefix: Vec<String> = normalized_key[0..=level].to_vec();
                match level_states[level].prefix {
                    None => {
                        level_states[level].prefix = Some(prefix);
                        level_states[level].group_count = 1;
                    }
                    Some(ref p) => {
                        if *p != prefix {
                            level_states[level].prefix = Some(prefix);
                            level_states[level].indices.clear();
                            level_states[level].group_count = 1;
                        } else {
                            // Same prefix as previous group: another distinct group contributes
                            level_states[level].group_count += 1;
                        }
                    }
                }
                level_states[level].indices.extend_from_slice(row_idxs);
            }

            // At the very end, flush all remaining subtotals from deepest to highest
            if idx == group_entries.len() - 1 {
                for level in (0..levels).rev() {
                    flush_level(level, &mut output_rows, &mut level_states);
                }
            }
        }

        // Grand total row over all rows
        let all_indices: Vec<usize> = (0..batch.num_rows()).collect();
        let mut grand_labels = vec![String::new(); levels];
        if !grand_labels.is_empty() {
            grand_labels[0] = "Grand Total".to_string();
        }
        output_rows.push(OutputRow {
            labels: grand_labels,
            indices: all_indices,
        });
    }

    // Build result arrays column-wise from output_rows
    let mut result_columns: Vec<Arc<dyn Array>> = Vec::new();

    // Row columns
    for row_col_idx in 0..pivot_spec.rows.len() {
        let mut values: Vec<String> = Vec::with_capacity(output_rows.len());
        for row in &output_rows {
            let label = row
                .labels
                .get(row_col_idx)
                .cloned()
                .unwrap_or_else(|| "".to_string());
            values.push(label);
        }
        let string_array = StringArray::from(values);
        result_columns.push(Arc::new(string_array));
    }

    // Value columns
    for &(value_idx, agg) in &value_indices {
        let mut agg_values: Vec<f64> = Vec::with_capacity(output_rows.len());
        for row in &output_rows {
            let v = compute_aggregation(batch.column(value_idx).as_ref(), &row.indices, agg)?;
            agg_values.push(v);
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
