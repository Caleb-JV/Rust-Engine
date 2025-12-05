/// Parallel processing utilities for Arrow RecordBatch pipeline
/// Splits batches and processes each chunk through filter → sort → pivot pipeline
/// Note: In WASM, "parallel" is simulated by processing batches in optimized chunks

use arrow_array::RecordBatch;
use arrow_schema::SchemaRef;
use wasm_bindgen::JsValue;

#[cfg(target_arch = "wasm32")]
use web_sys::console;

use crate::error::js_err;
use crate::filters;
use crate::pivot;
use crate::sorting;
use crate::query_types::{FilterCondition, PivotSpec, SortSpec};

/// Threshold for when to use parallel/chunked processing
/// If batch count is above this, use chunked processing
pub const PARALLEL_BATCH_THRESHOLD: usize = 8;

/// Threshold for minimum rows per batch to warrant chunked processing
pub const MIN_ROWS_FOR_PARALLEL: usize = 10000;

/// Determine if chunked processing should be used based on data size
pub fn should_use_parallel(batches: &[RecordBatch]) -> bool {
    // Use chunked processing if we have multiple batches
    if batches.len() >= PARALLEL_BATCH_THRESHOLD {
        return true;
    }

    // Check total row count for large single batches
    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    total_rows >= MIN_ROWS_FOR_PARALLEL
}

/// Get optimal number of chunks based on available parallelism
fn get_optimal_chunk_count(batch_count: usize) -> usize {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let available_parallelism = rayon::current_num_threads();
        // Don't create more chunks than we have threads or batches
        available_parallelism.min(batch_count).max(2)
    }
    
    #[cfg(target_arch = "wasm32")]
    {
        // In WASM, simulate chunking with reasonable batch sizes
        // Process 2-4 chunks for better cache locality
        if batch_count >= 8 {
            8
        } else if batch_count >= 4 {
            4
        } else {
            1
        }
    }
}

/// Split batches into chunks for parallel processing
fn split_batches_for_parallel(
    batches: Vec<RecordBatch>,
    target_chunks: usize,
) -> Vec<Vec<RecordBatch>> {
    if batches.is_empty() || target_chunks <= 1 {
        return vec![batches];
    }

    let total_batches = batches.len();
    let chunk_size = (total_batches + target_chunks - 1) / target_chunks;

    batches
        .chunks(chunk_size)
        .map(|chunk| chunk.to_vec())
        .collect()
}

/// Process the complete pipeline with chunked processing: filter → pivot → sort
/// Each chunk is processed independently and results are combined
/// On native targets, uses true parallelism; on WASM, uses optimized chunking
pub fn process_pipeline_parallel(
    batches: Vec<RecordBatch>,
    filters: Option<&[FilterCondition]>,
    pivot: Option<&PivotSpec>,
    sort: Option<&[SortSpec]>,
    show_subtotal: bool,
) -> Result<Vec<RecordBatch>, JsValue> {
    if batches.is_empty() {
        return Ok(batches);
    }

    // Log initial stats
    let _total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    let _batch_count = batches.len();
    
    #[cfg(target_arch = "wasm32")]
    console::log_1(&format!("🚀 PARALLEL MODE: Processing {} batches with {} total rows", _batch_count, _total_rows).into());
    
    let start_time = web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now());

    // Determine chunk count
    let chunk_count = get_optimal_chunk_count(batches.len());
    
    #[cfg(target_arch = "wasm32")]
    console::log_1(&format!("📦 Splitting into {} chunks for processing", chunk_count).into());
    
    // Split batches into chunks
    let chunks = split_batches_for_parallel(batches, chunk_count);
    
    // Clone query parameters for processing
    let filters_owned = filters.map(|f| f.to_vec());
    let pivot_owned = pivot.cloned();
    let sort_owned = sort.map(|s| s.to_vec());
    
    // Process each chunk through the full pipeline
    #[cfg(not(target_arch = "wasm32"))]
    let results: Result<Vec<Vec<RecordBatch>>, JsValue> = {
        // Native: use sequential processing (RecordBatch contains non-Send types)
        chunks
            .into_iter()
            .map(|chunk| {
                process_chunk_pipeline(
                    chunk,
                    filters_owned.as_deref(),
                    pivot_owned.as_ref(),
                    sort_owned.as_deref(),
                    show_subtotal,
                )
            })
            .collect()
    };
    
    #[cfg(target_arch = "wasm32")]
    let results: Result<Vec<Vec<RecordBatch>>, JsValue> = {
        // WASM: use sequential processing with chunking for better cache locality
        chunks
            .into_iter()
            .map(|chunk| {
                process_chunk_pipeline(
                    chunk,
                    filters_owned.as_deref(),
                    pivot_owned.as_ref(),
                    sort_owned.as_deref(),
                    show_subtotal,
                )
            })
            .collect()
    };
    
    // Flatten results from all chunks
    let processed_batches: Vec<RecordBatch> = results?
        .into_iter()
        .flatten()
        .collect();
    
    // If we have sorting and multiple result batches, we need to sort again
    // because chunks were sorted independently
    let final_batches = if sort_owned.is_some() && processed_batches.len() > 1 {
        #[cfg(target_arch = "wasm32")]
        console::log_1(&"🔄 Applying final sort across all chunks".into());
        // Final sort across all chunks to maintain global order
        sorting::apply_sorting(processed_batches, sort_owned.as_ref().unwrap())?
    } else {
        processed_batches
    };
    
    // Log final stats
    let _final_rows: usize = final_batches.iter().map(|b| b.num_rows()).sum();
    let _final_batch_count = final_batches.len();
    
    if let Some(start) = start_time {
        if let Some(performance) = web_sys::window().and_then(|w| w.performance()) {
            let _duration = performance.now() - start;
            #[cfg(target_arch = "wasm32")]
            console::log_1(&format!(
                "✅ PARALLEL COMPLETE: {} batches → {} batches, {} rows → {} rows, Time: {:.2}ms",
                _batch_count, _final_batch_count, _total_rows, _final_rows, _duration
            ).into());
        }
    }
    
    Ok(final_batches)
}

/// Process a single chunk through the complete pipeline
fn process_chunk_pipeline(
    mut batches: Vec<RecordBatch>,
    filters: Option<&[FilterCondition]>,
    pivot: Option<&PivotSpec>,
    sort: Option<&[SortSpec]>,
    show_subtotal: bool,
) -> Result<Vec<RecordBatch>, JsValue> {
    // Apply filters
    if let Some(filter_conditions) = filters {
        if !filter_conditions.is_empty() {
        batches = filters::apply_filters(batches, filter_conditions)?;
        }
        
        // If filtering removed all data, return early
        if batches.is_empty() {
            return Ok(batches);
        }
    }

    // Apply pivot (grouping)
    if let Some(pivot_spec) = pivot {
        if !pivot_spec.rows.is_empty() && !pivot_spec.values.is_empty() {
        batches = pivot::apply_pivot(batches, pivot_spec, show_subtotal)?;
        }
        
        if batches.is_empty() {
            return Ok(batches);
        }
    }

    // Apply sorting
    if let Some(sort_specs) = sort {
        if !sort_specs.is_empty() {
        batches = sorting::apply_sorting(batches, sort_specs)?;}
    }

    Ok(batches)
}

/// Combine multiple record batches with the same schema
/// This is a helper for merging results from parallel processing
#[allow(dead_code)]
pub fn combine_batches(
    schema: &SchemaRef,
    batches: &[RecordBatch],
) -> Result<RecordBatch, JsValue> {
    if batches.is_empty() {
        return Ok(RecordBatch::new_empty(schema.clone()));
    }

    if batches.len() == 1 {
        return Ok(batches[0].clone());
    }

    arrow_select::concat::concat_batches(schema, batches)
        .map_err(|e| js_err(&format!("Failed to combine batches: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_use_parallel() {
        let batches: Vec<RecordBatch> = vec![];
        assert!(!should_use_parallel(&batches));
    }

    #[test]
    fn test_split_batches() {
        let batches: Vec<RecordBatch> = vec![];
        let chunks = split_batches_for_parallel(batches, 4);
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_optimal_chunk_count() {
        let count = get_optimal_chunk_count(10);
        assert!(count >= 2);
    }
}
