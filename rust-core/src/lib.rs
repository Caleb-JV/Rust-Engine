use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

use arrow_array::RecordBatch;
use arrow_csv::reader::{Format, ReaderBuilder};
use arrow_schema::{Schema, SchemaRef};
use std::io::Cursor;
use std::sync::Arc;

// Module declarations
mod error;
mod filters;
mod helpers;
mod operations;
mod pivot;
mod query_types;
mod sorting;
mod storage;
mod timing;
mod types;

// Imports from modules
use error::{js_err, js_err_arrow};
use helpers::{encode_ipc, to_simple_type};
use query_types::DataQuery;
use storage::{STORED_BATCHES, STORED_SCHEMA};
use timing::{timed, timed_async};

// Re-export timing functions for WASM
pub use timing::{get_timing_log, clear_timing_log};


/// ------------------------------------------------------------------
///   CSV → Arrow IPC → store schema + batches
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn seed(bytes: &[u8]) -> Result<(), JsValue> {
    timed("seed", || {
        let mut cursor = Cursor::new(bytes);

        let fmt = Format::default().with_header(true);
    let (schema, _) = fmt.infer_schema(&mut cursor, None).map_err(js_err_arrow)?;
    let schema: SchemaRef = Arc::new(schema);

        cursor.set_position(0);


        let reader = ReaderBuilder::new(schema.clone())
            .with_header(true)
            .build(cursor)
            .map_err(js_err_arrow)?;

    let batches: Vec<RecordBatch> =
        reader.collect::<Result<Vec<_>, _>>().map_err(js_err_arrow)?;

        // store globally
        *STORED_SCHEMA.lock().unwrap() = Some(schema.clone());
        *STORED_BATCHES.lock().unwrap() = Some(batches.clone());

        Ok(())
    })
}




#[wasm_bindgen]
pub fn get_meta_data() -> Result<JsValue, JsValue> {
    timed("get_meta_data", || {
        let schema_opt = STORED_SCHEMA
            .lock()
            .unwrap()
            .clone();

    let schema = match schema_opt {
        Some(s) => s,
        None => return Err(js_err("No schema stored. Call csvtoarrow() first.")),
    };

    let mut cols = Vec::new();

    for field in schema.fields() {
        let simple_type = to_simple_type(field.data_type());

        cols.push(serde_json::json!({
            "name": field.name(),
            "type": simple_type,
            "nullable": field.is_nullable()
        }));
    }

    let meta = serde_json::json!({
        "columns": cols,
        "column_count": schema.fields().len(),
    });

        let json_string = serde_json::to_string(&meta).map_err(|e| js_err(&format!("Serialization error: {}", e)))?;
        Ok(JsValue::from_str(&json_string))
    })
}


/// Advanced get_data with filters, sorting, and pivot support
#[wasm_bindgen]
pub fn get_data(query_json: &str) -> Result<Vec<u8>, JsValue> {
    timed("get_data", || {
        // Parse query JSON
        let query: DataQuery = serde_json::from_str(query_json)
            .map_err(|e| js_err(&format!("Invalid query JSON: {}", e)))?;

    // Load stored schema and batches
    let schema = STORED_SCHEMA
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| js_err("No schema stored. Call seed() first."))?;

    let mut batches = STORED_BATCHES
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| js_err("No batches stored."))?;

    // Apply filters
    if let Some(ref filter_conditions) = query.filters {
        batches = filters::apply_filters(batches, filter_conditions)?;
    }

    // Apply pivot (grouping)
    if let Some(ref pivot_spec) = query.pivot {
        batches = pivot::apply_pivot(batches, pivot_spec)?;
    }

    // Apply sorting
    if let Some(ref sort_specs) = query.sort {
        batches = sorting::apply_sorting(batches, sort_specs)?;
    }

    // Apply column projection
    if let Some(ref cols) = query.columns {
        if !cols.is_empty() {
            let mut indices = Vec::new();
            let current_schema = if batches.is_empty() {
                schema.clone()
            } else {
                batches[0].schema()
            };

            for name in cols {
                match current_schema.index_of(name) {
                    Ok(i) => indices.push(i),
                    Err(_) => return Err(js_err(&format!("Column not found: {}", name))),
                }
            }

            let projected_fields = indices
                .iter()
                .map(|i| current_schema.field(*i).clone())
                .collect::<Vec<_>>();

            let projected_schema: SchemaRef = Arc::new(Schema::new(projected_fields));

            let mut projected_batches = Vec::new();
            for batch in batches {
                let cols = indices
                    .iter()
                    .map(|i| batch.column(*i).clone())
                    .collect::<Vec<_>>();

                let projected = RecordBatch::try_new(projected_schema.clone(), cols)
                    .map_err(js_err_arrow)?;

                projected_batches.push(projected);
            }

            batches = projected_batches;
        }
    }

    // Apply limit and offset
    if query.limit.is_some() || query.offset.is_some() {
        batches = apply_limit_offset(batches, query.limit, query.offset)?;
    }

        // Encode to IPC
        let final_schema = if batches.is_empty() {
            schema
        } else {
            batches[0].schema()
        };

        encode_ipc(&final_schema, &batches)
    })
}

/// Apply limit and offset to batches
fn apply_limit_offset(
    batches: Vec<RecordBatch>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<RecordBatch>, JsValue> {
    if batches.is_empty() {
        return Ok(batches);
    }

    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(usize::MAX);

    // Concatenate batches
    let combined = if batches.len() > 1 {
        arrow_select::concat::concat_batches(&batches[0].schema(), &batches)
            .map_err(|e| js_err(&format!("Failed to concatenate: {}", e)))?
    } else {
        batches[0].clone()
    };

    let total_rows = combined.num_rows();

    if offset >= total_rows {
        // Return empty batch with same schema
        let empty_batch = RecordBatch::new_empty(combined.schema());
        return Ok(vec![empty_batch]);
    }

    let start = offset;
    let end = (offset + limit).min(total_rows);

    let sliced = combined.slice(start, end - start);
    Ok(vec![sliced])
}

#[wasm_bindgen]
pub fn aggregate(col_names: &str, aggregation_type: &str) -> Result<JsValue, JsValue> {
    timed("aggregate", || {
        operations::aggregate(col_names, aggregation_type)
    })
}

#[wasm_bindgen]
pub fn get_filter_options(col_name: &str) -> Result<JsValue, JsValue> {
    timed("get_filter_options", || {
        operations::get_filter_options(col_name)
    })
}

/// Async version of get_data_advanced
#[wasm_bindgen]
pub fn get_data_async(query_json: String) -> js_sys::Promise {
    future_to_promise(async move {
        timed_async("get_data_async", || async {
            let result = get_data(&query_json)?;
            Ok(js_sys::Uint8Array::from(&result[..]).into())
        }).await
    })
}

/// Async version of get_filter_options
#[wasm_bindgen]
pub fn get_filter_options_async(col_name: String) -> js_sys::Promise {
    future_to_promise(async move {
        timed_async("get_filter_options_async", || async {
            operations::get_filter_options(&col_name)
        }).await
    })
}
