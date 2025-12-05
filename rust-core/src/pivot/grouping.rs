use std::collections::HashMap;
use std::sync::Arc;

use arrow_array::{Array, Float64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use wasm_bindgen::JsValue;

use crate::error::js_err;
use crate::query_types::{PivotAggregation, PivotSpec};

use super::aggregation::compute_aggregation;

// Shared type aliases to clarify intent
pub type GroupKey = Vec<String>;
pub type RowIndices = Vec<usize>;

// Represents a single logical row in the pivot output: the display labels for
// each row-level key, plus the set of underlying record indices that should be
// aggregated for all value columns.
pub struct OutputRow {
    pub labels: Vec<String>,
    pub indices: RowIndices,
}

// Tracks subtotal state for a given prefix level while building N-level
// subtotals.
pub struct LevelState {
    pub prefix: Option<GroupKey>, // keys[0..=level]
    pub indices: RowIndices,
    pub group_count: usize,
}

/// Group by row columns and aggregate value columns
pub(crate) fn group_and_aggregate(
    batch: &RecordBatch,
    pivot_spec: &PivotSpec,
    show_subtotal: bool,
) -> Result<RecordBatch, JsValue> {
    // Get indices for row columns

    // Global switch: when false, skip building any subtotal/grand-total rows
    // and only emit detail rows. This avoids LevelState bookkeeping and is
    // faster for cases where subtotals are not needed.
    let include_subtotals = show_subtotal;

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
    let mut groups: HashMap<GroupKey, RowIndices> = HashMap::new();

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
        let _field = batch_schema
            .field_with_name(col_name)
            .map_err(|_| js_err(&format!("Field not found: {}", col_name)))?;
        // Use Utf8 because we convert all grouping values to strings
        result_fields.push(Field::new(col_name, DataType::Utf8, true));
    }

    for pv in &pivot_spec.values {
        let field_name = format!("{}_{:?}", pv.column, pv.aggregation);
        result_fields.push(Field::new(field_name, DataType::Float64, true));
    }

    let result_schema: SchemaRef = Arc::new(Schema::new(result_fields));

    // --- Build ordered output rows with N-level subtotals and grand total ---
    // Collect groups into a Vec and sort by full key for stable ordering
    let mut group_entries: Vec<(GroupKey, RowIndices)> = Vec::new();
    for (key, idxs) in groups.into_iter() {
        group_entries.push((key, idxs));
    }

    if group_entries.is_empty() {
        let empty = RecordBatch::new_empty(result_schema);
        return Ok(empty);
    }

    group_entries.sort_by(|(k1, _), (k2, _)| k1.cmp(k2));

    let levels = pivot_spec.rows.len();
    let mut output_rows: Vec<OutputRow> = Vec::new();

    if !include_subtotals && levels > 0 {
        // Fast path: only emit detail rows, no subtotals/grand-total.
        for (key, row_idxs) in &group_entries {
            let mut normalized_key = key.clone();
            if normalized_key.len() < levels {
                normalized_key.extend(
                    std::iter::repeat(String::new()).take(levels - normalized_key.len()),
                );
            }

            output_rows.push(OutputRow {
                labels: normalized_key,
                indices: row_idxs.clone(),
            });
        }
    } else if levels == 0 {
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
        let mut level_states: Vec<LevelState> = (0..levels)
            .map(|_| LevelState {
                prefix: None,
                indices: Vec::new(),
                group_count: 0,
            })
            .collect();

        // Helper to flush subtotal for a given level
        let flush_level = |level: usize,
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
                .downcast_ref::<arrow_array::Int64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Int64Array"))?;
            Ok(arr.value(idx).to_string())
        }
        DataType::Float64 => {
            let arr = array
                .as_any()
                .downcast_ref::<arrow_array::Float64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Float64Array"))?;
            Ok(arr.value(idx).to_string())
        }
        DataType::Date32 => {
            let arr = array
                .as_any()
                .downcast_ref::<arrow_array::Date32Array>()
                .ok_or_else(|| js_err("Failed to downcast to Date32Array"))?;
            let days = arr.value(idx);
            Ok(format_date32(days))
        }
        DataType::Date64 => {
            let arr = array
                .as_any()
                .downcast_ref::<arrow_array::Date64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Date64Array"))?;
            let millis = arr.value(idx);
            Ok(format_date64(millis))
        }
        DataType::Timestamp(_, _) => {
            let arr = array
                .as_any()
                .downcast_ref::<arrow_array::TimestampMillisecondArray>()
                .ok_or_else(|| js_err("Failed to downcast to TimestampMillisecondArray"))?;
            let millis = arr.value(idx);
            Ok(format_timestamp(millis))
        }
        dt => Err(js_err(&format!("Unsupported type for grouping: {:?}", dt))),
    }
}

/// Format Date32 (days since epoch) to YYYY-MM-DD string
fn format_date32(days: i32) -> String {
    const SECONDS_PER_DAY: i64 = 86400;
    let seconds = days as i64 * SECONDS_PER_DAY;
    format_unix_timestamp(seconds)
}

/// Format Date64 (milliseconds since epoch) to YYYY-MM-DD string
fn format_date64(millis: i64) -> String {
    let seconds = millis / 1000;
    format_unix_timestamp(seconds)
}

/// Format Timestamp (milliseconds since epoch) to YYYY-MM-DD HH:MM:SS string
fn format_timestamp(millis: i64) -> String {
    let seconds = millis / 1000;
    let remaining_millis = millis % 1000;
    
    let (year, month, day, hour, minute, second) = seconds_to_datetime(seconds);
    
    if hour == 0 && minute == 0 && second == 0 && remaining_millis == 0 {
        format!("{:04}-{:02}-{:02}", year, month, day)
    } else {
        format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, hour, minute, second)
    }
}

/// Format Unix timestamp (seconds since epoch) to YYYY-MM-DD string
fn format_unix_timestamp(seconds: i64) -> String {
    let (year, month, day, _, _, _) = seconds_to_datetime(seconds);
    format!("{:04}-{:02}-{:02}", year, month, day)
}

/// Convert Unix timestamp to (year, month, day, hour, minute, second)
fn seconds_to_datetime(mut seconds: i64) -> (i32, u32, u32, u32, u32, u32) {
    const SECONDS_PER_DAY: i64 = 86400;
    const SECONDS_PER_HOUR: i64 = 3600;
    const SECONDS_PER_MINUTE: i64 = 60;
    
    // Handle negative timestamps (before epoch)
    let negative = seconds < 0;
    if negative {
        seconds = seconds.abs();
    }
    
    // Extract time components
    let days = seconds / SECONDS_PER_DAY;
    let remaining = seconds % SECONDS_PER_DAY;
    let hour = (remaining / SECONDS_PER_HOUR) as u32;
    let minute = ((remaining % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE) as u32;
    let second = (remaining % SECONDS_PER_MINUTE) as u32;
    
    // Convert days to calendar date (simplified algorithm)
    let mut year = 1970;
    let mut day_count = if negative { -days } else { days };
    
    if negative {
        // Go backwards from 1970
        while day_count < 0 {
            year -= 1;
            let days_in_year = if is_leap_year(year) { 366 } else { 365 };
            day_count += days_in_year;
        }
    } else {
        // Go forwards from 1970
        loop {
            let days_in_year = if is_leap_year(year) { 366 } else { 365 };
            if day_count < days_in_year {
                break;
            }
            day_count -= days_in_year;
            year += 1;
        }
    }
    
    // Convert day of year to month and day
    let (month, day) = day_of_year_to_month_day(day_count as u32, is_leap_year(year));
    
    (year as i32, month, day, hour, minute, second)
}

/// Check if a year is a leap year
fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Convert day of year to (month, day)
fn day_of_year_to_month_day(day_of_year: u32, is_leap: bool) -> (u32, u32) {
    let days_in_month = if is_leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    
    let mut remaining = day_of_year;
    for (month_idx, &days) in days_in_month.iter().enumerate() {
        if remaining < days {
            return ((month_idx + 1) as u32, remaining + 1);
        }
        remaining -= days;
    }
    
    // Should not reach here, but return December 31 as fallback
    (12, 31)
}
