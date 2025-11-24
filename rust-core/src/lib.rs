use arrow_array::RecordBatch;
use arrow_csv::reader::{Format, ReaderBuilder};
use arrow_schema::{Schema, SchemaRef};
use std::io::Cursor;
use std::sync::Arc;
use wasm_bindgen::JsValue;

// Module declarations
mod api;
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

// Re-export async WASM API
pub use api::{
    get_data_async,
    get_filter_options_async,
    get_meta_data_async,
    seed_async,
};


/// ------------------------------------------------------------------
///   CSV → Arrow IPC → store schema + batches
///   Optimized: Avoid unnecessary clones, single pass
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
    // Lock once and clone only the Arc (cheap)
    let schema = STORED_SCHEMA
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| js_err("No schema stored. Call seed() first."))?  
        .clone();

    // Pre-allocate with exact capacity
    let field_count = schema.fields().len();
    let mut cols = Vec::with_capacity(field_count);

    // Iterate efficiently
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
        "column_count": field_count,
    });

    // Serialize directly to string
    let json_string = serde_json::to_string(&meta)
        .map_err(|e| js_err(&format!("Serialization error: {}", e)))?;
    
    Ok(JsValue::from_str(&json_string))
}


/// Advanced get_data with filters, sorting, and pivot support
pub(crate) fn get_data(query_json: &str) -> Result<Vec<u8>, JsValue> {
	// Parse query JSON
	let query: DataQuery = serde_json::from_str(query_json)
			.map_err(|e| js_err(&format!("Invalid query JSON: {}", e)))?;

    // Load stored data (single lock acquisition per store)
    let schema = STORED_SCHEMA
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| js_err("No schema stored. Call seed() first."))?  
        .clone();

    let mut batches = STORED_BATCHES
        .lock()
        .unwrap()
        .as_ref()
        .ok_or_else(|| js_err("No batches stored."))?  
        .clone();

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

	// Encode to IPC
	let final_schema = if batches.is_empty() {
		schema
	} else {
		batches[0].schema()
	};

	encode_ipc(&final_schema, &batches)
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

pub(crate) fn get_filter_options(col_name: &str) -> Result<JsValue, JsValue> {
	operations::get_filter_options(col_name)
}
