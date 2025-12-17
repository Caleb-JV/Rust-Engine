use arrow_array::RecordBatch;
use arrow_csv::reader::{Format, ReaderBuilder};
use arrow_schema::{Schema, SchemaRef};
use std::io::Cursor;
use std::sync::Arc;
use wasm_bindgen::JsValue;

// Module declarations
mod api;
#[path = "dataHelpers/mod.rs"]
mod data_helpers;
mod filters;
mod operations;
mod parallel;
mod pivot;
mod sorting;
mod storage;
mod types;
mod utils;

// Imports from modules
use utils::error::{js_err, js_err_arrow};
use data_helpers::helpers::to_simple_type;
use types::query_types::DataQuery;
use storage::{STORED_BATCHES, STORED_SCHEMA};

// Re-export async WASM API
pub use api::{
    get_data_async,
    get_filter_options_async,
    get_meta_data_async,
    seed_async
};

// Re-export data generator
pub use utils::data_generator::generate_sample_data;

// Re-export streaming seed functions
use wasm_bindgen::prelude::*;

use crate::data_helpers::output::flatten_batches_to_js;

/// ------------------------------------------------------------------
///   STREAMING API: Initialize with CSV header to infer schema
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn seed_start(header_bytes: &[u8]) -> Result<(), JsValue> {
    let mut cursor = Cursor::new(header_bytes);

    let fmt = Format::default().with_header(true);
    let (schema, _) = fmt.infer_schema(&mut cursor, None).map_err(js_err_arrow)?;
    let schema: SchemaRef = Arc::new(schema);

    // Initialize with schema and empty batches
    *STORED_SCHEMA.lock().unwrap() = Some(schema.clone());
    *STORED_BATCHES.lock().unwrap() = Some(Vec::new());

    Ok(())
}

/// ------------------------------------------------------------------
///   STREAMING API: Process and append a chunk of CSV data
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn seed_chunk(chunk_bytes: &[u8], has_header: bool) -> Result<(), JsValue> {
    let schema_guard = STORED_SCHEMA.lock().unwrap();
    let schema = schema_guard
        .as_ref()
        .ok_or_else(|| js_err("Schema not initialized. Call seed_start first."))?;

    let cursor = Cursor::new(chunk_bytes);

    let reader = ReaderBuilder::new(schema.clone())
        .with_header(has_header)
        .build(cursor)
        .map_err(js_err_arrow)?;

    let new_batches: Vec<RecordBatch> = reader
        .collect::<Result<Vec<_>, _>>()
        .map_err(js_err_arrow)?;

    // Drop the schema guard before acquiring the batches lock
    drop(schema_guard);

    // Append to existing batches
    let mut batches_guard = STORED_BATCHES.lock().unwrap();
    if let Some(ref mut batches) = *batches_guard {
        batches.extend(new_batches);
    }

    Ok(())
}

/// ------------------------------------------------------------------
///   STREAMING API: Finalize streaming (returns total row count)
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn seed_finalize() -> Result<usize, JsValue> {
    let batches_guard = STORED_BATCHES.lock().unwrap();
    let total_rows = batches_guard
        .as_ref()
        .map(|batches| batches.iter().map(|b| b.num_rows()).sum())
        .unwrap_or(0);
    Ok(total_rows)
}

/// ------------------------------------------------------------------
///   Get current memory usage in bytes
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn get_memory_usage() -> usize {
    storage::get_memory_usage()
}

/// ------------------------------------------------------------------
///   Generate sample data and store it directly
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn generate_and_seed_sample_data(row_count: usize, seed: u64) -> Result<usize, JsValue> {
    let batch = utils::data_generator::generate_sample_batch(row_count, seed)
        .map_err(|e| js_err(&e))?;

    let schema = batch.schema();
    let total_rows = batch.num_rows();

    // Store globally
    {
        let mut schema_lock = STORED_SCHEMA.lock().unwrap();
        let mut batches_lock = STORED_BATCHES.lock().unwrap();
        *schema_lock = Some(schema);
        *batches_lock = Some(vec![batch]);
    }

    Ok(total_rows)
}

/// ------------------------------------------------------------------
///   CSV → Arrow IPC → store schema + batches
///   Optimized: Avoid unnecessary clones, single pass
///   This is the non-streaming version for smaller files
/// ------------------------------------------------------------------
pub(crate) fn seed(bytes: &[u8]) -> Result<(), JsValue> {
    let mut cursor = Cursor::new(bytes);

    // Infer schema with optimized format
    let fmt = Format::default().with_header(true);
    let (schema, _) = fmt.infer_schema(&mut cursor, None).map_err(js_err_arrow)?;
    let schema: SchemaRef = Arc::new(schema);

    // Reset cursor for reading
    cursor.set_position(0);

    // Build reader with optimized settings
    let reader = ReaderBuilder::new(Arc::clone(&schema))
        .with_header(true)
        .build(cursor)
        .map_err(js_err_arrow)?;

    // Collect batches with pre-allocated capacity hint
    let batches: Vec<RecordBatch> = reader
        .collect::<Result<Vec<_>, _>>()
        .map_err(js_err_arrow)?;

    // Store globally (single lock acquisition)
    {
        let mut schema_lock = STORED_SCHEMA.lock().unwrap();
        let mut batches_lock = STORED_BATCHES.lock().unwrap();
        *schema_lock = Some(schema);
        *batches_lock = Some(batches);
    }

    Ok(())
}

pub(crate) fn get_meta_data() -> Result<JsValue, JsValue> {
    // --- SCHEMA ---
    let schema = STORED_SCHEMA
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| js_err("No schema stored. Call seed() first."))?
        .clone();

    // --- ROW COUNT ---
    let batches_opt = STORED_BATCHES
        .lock()
        .unwrap();

    let batches = batches_opt
        .as_ref()
        .ok_or_else(|| js_err("No batches stored. Call seed() first."))?;

    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();

    // --- COLUMN META ---
    let fields = schema.fields();
    let mut cols = Vec::with_capacity(fields.len());

    for field in fields {
        let simple_type = to_simple_type(field.data_type());
        cols.push(serde_json::json!({
            "name": field.name(),
            "type": simple_type,
            "nullable": field.is_nullable(),
        }));
    }

    // --- FINAL JSON ---
    let meta = serde_json::json!({
        "columns": cols,
        "column_count": fields.len(),
        "row_count": total_rows,
    });

    let json_string = serde_json::to_string(&meta)
        .map_err(|e| js_err(&format!("Serialization error: {}", e)))?;

    Ok(JsValue::from_str(&json_string))
}


/// Advanced get_data with filters, sorting, and pivot support
/// Returns a JS object with { columns: [...], rowCount: number }
pub(crate) fn get_data(query_json: &str) -> Result<JsValue, JsValue> {
	// Parse query JSON
	let query: DataQuery = serde_json::from_str(query_json)
			.map_err(|e| js_err(&format!("Invalid query JSON: {}", e)))?;

	// Additional options from the frontend
	let (show_subtotal, multithreading): (bool, bool) = match query.options {
		Some(ref opts) => (opts.show_subtotal, opts.multithreading),
		None => (true, false),
	};

    // Load stored data (single lock acquisition per store)
    let schema = STORED_SCHEMA
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| js_err("No schema stored. Call seed() first."))?  
        .clone();

    let batches_ref = STORED_BATCHES
        .lock()
        .unwrap();
    let stored_batches = batches_ref
        .as_ref()
        .ok_or_else(|| js_err("No batches stored."))?;

    let mut batches = stored_batches.clone();
    drop(batches_ref);

    // Check if we should use parallel processing
    let use_parallel = parallel::should_use_parallel(&batches);
    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    let batch_count = batches.len();
    
    // Check if there are any operations to perform
    let has_filters = query.filters.as_ref().map_or(false, |f| !f.is_empty());
    let has_pivot = query.pivot.as_ref().map_or(false, |p| !p.rows.is_empty() && !p.values.is_empty());
    let has_sort = query.sort.as_ref().map_or(false, |s| !s.is_empty());
    let has_operations = has_filters || has_pivot || has_sort;
    
    if use_parallel && multithreading && has_operations {
        // Parallel pipeline: split batches and process each chunk independently
        web_sys::console::log_1(&format!(
            "⚡ Using PARALLEL processing for {} batches ({} rows)",
            batch_count, total_rows
        ).into());
        
        batches = parallel::process_pipeline_parallel(
            batches,
            query.filters.as_deref(),
            query.pivot.as_ref(),
            query.sort.as_deref(),
            show_subtotal,
        )?;
    } else {
        // Sequential pipeline for small datasets or when no operations needed
        let reason = if !has_operations {
            "no operations"
        } else if !multithreading {
            "multithreading disabled"
        } else if !use_parallel {
            "dataset too small"
        } else {
            "unknown reason"
        };
        
        web_sys::console::log_1(&format!(
            "🐌 Using SEQUENTIAL processing for {} batches ({} rows) - {}",
            batch_count, total_rows, reason
        ).into());
        
        let seq_start = web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now());
        
        // Apply filters
        if let Some(ref filter_conditions) = query.filters {
            if !filter_conditions.is_empty() {
            batches = filters::apply_filters(batches, filter_conditions)?;
            }
        }

        // Apply pivot (grouping)
        if let Some(ref pivot_spec) = query.pivot {
            if !pivot_spec.rows.is_empty() || !pivot_spec.values.is_empty() {
            batches = pivot::apply_pivot(batches, pivot_spec , show_subtotal)?;
            }
        }

        // Apply sorting
        if let Some(ref sort_specs) = query.sort {
            if !sort_specs.is_empty() {
            batches = sorting::apply_sorting(batches, sort_specs)?;
            }
        }
        
        // Log sequential completion time
        if let Some(start) = seq_start {
            if let Some(performance) = web_sys::window().and_then(|w| w.performance()) {
                let duration = performance.now() - start;
                let final_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
                web_sys::console::log_1(&format!(
                    "✅ SEQUENTIAL COMPLETE: {} rows → {} rows, Time: {:.2}ms",
                    total_rows, final_rows, duration
                ).into());
            }
        }
    }

    // Apply column projection (optimized)
    if let Some(ref cols) = query.columns {
        if !cols.is_empty() {
            let current_schema = if batches.is_empty() {
                Arc::clone(&schema)
            } else {
                batches[0].schema()
            };

            // Pre-allocate indices vector
            let mut indices = Vec::with_capacity(cols.len());
            for name in cols {
                match current_schema.index_of(name) {
                    Ok(i) => indices.push(i),
                    Err(_) => return Err(js_err(&format!("Column not found: {}", name))),
                }
            }

            // Build projected schema once
            let projected_fields: Vec<_> = indices
                .iter()
                .map(|&i| current_schema.field(i).clone())
                .collect();
            let projected_schema: SchemaRef = Arc::new(Schema::new(projected_fields));

            // Project batches with pre-allocated capacity
            let mut projected_batches = Vec::with_capacity(batches.len());
            for batch in batches {
                let cols: Vec<_> = indices
                    .iter()
                    .map(|&i| Arc::clone(batch.column(i)))
                    .collect();

                let projected = RecordBatch::try_new(Arc::clone(&projected_schema), cols)
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

let js_output = flatten_batches_to_js(&batches)?;
Ok(js_output)

}


/// Apply limit and offset to batches (for owned batches after other operations)
fn apply_limit_offset(
    batches: Vec<RecordBatch>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<RecordBatch>, JsValue> {
    if batches.is_empty() {
        return Ok(batches);
    }

    let mut remaining_offset = offset.unwrap_or(0);
    let mut remaining_limit = limit.unwrap_or(usize::MAX);

    // If nothing to skip and no limit, just return as-is (zero work)
    if remaining_offset == 0 && remaining_limit == usize::MAX {
        return Ok(batches);
    }

    // Save schema before moving batches
    let schema = batches[0].schema();
    let mut result = Vec::with_capacity(batches.len());

    for batch in batches {
        let rows = batch.num_rows();

        // Skip whole batches while offset is larger than current batch
        if remaining_offset >= rows {
            remaining_offset -= rows;
            continue;
        }

        // We are inside this batch now
        let start_in_batch = remaining_offset;
        let available_here = rows - start_in_batch;
        let take = remaining_limit.min(available_here);

        if take == 0 {
            break;
        }

        let sliced = batch.slice(start_in_batch, take);
        result.push(sliced);

        remaining_limit -= take;
        remaining_offset = 0;

        if remaining_limit == 0 {
            break;
        }
    }

    // If nothing left (offset beyond end), return empty batch with same schema
    if result.is_empty() {
        let empty = RecordBatch::new_empty(schema);
        return Ok(vec![empty]);
    }

    Ok(result)
}

pub(crate) fn get_filter_options(col_name: &str) -> Result<JsValue, JsValue> {
	operations::get_filter_options(col_name)
}
