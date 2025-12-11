// -------------------------------------------------------------------------------------------------
// MotherDuck-Optimized Parallel Pipeline for Arrow RecordBatch Processing
// Chunking == FILTER ONLY
// Global == PIVOT + SORT
// -------------------------------------------------------------------------------------------------

use arrow_array::RecordBatch;
use arrow_schema::SchemaRef;
use wasm_bindgen::JsValue;

#[cfg(target_arch = "wasm32")]
use web_sys::console;

use crate::utils::error::js_err;
use crate::filters;
use crate::pivot;
use crate::sorting;
use crate::types::query_types::{FilterCondition, PivotSpec, SortSpec};

// -------------------------------------------------------------------------------------------------
// Thresholds
// -------------------------------------------------------------------------------------------------

pub const PARALLEL_BATCH_THRESHOLD: usize = 8;
pub const MIN_ROWS_FOR_PARALLEL: usize = 10000;

// -------------------------------------------------------------------------------------------------
// Decide if we should even use chunked processing
// -------------------------------------------------------------------------------------------------

pub fn should_use_parallel(batches: &[RecordBatch]) -> bool {
    if batches.len() >= PARALLEL_BATCH_THRESHOLD {
        return true;
    }
    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    total_rows >= MIN_ROWS_FOR_PARALLEL
}

// -------------------------------------------------------------------------------------------------
// Optimal chunk count
// -------------------------------------------------------------------------------------------------

fn get_optimal_chunk_count(batch_count: usize) -> usize {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let available_threads = rayon::current_num_threads();
        available_threads.min(batch_count).max(2)
    }

    #[cfg(target_arch = "wasm32")]
    {
        if batch_count >= 8 {
            8
        } else if batch_count >= 4 {
            4
        } else {
            1
        }
    }
}

// -------------------------------------------------------------------------------------------------
// Chunk split (by batch count)
// -------------------------------------------------------------------------------------------------

fn split_batches_for_parallel(
    batches: Vec<RecordBatch>,
    target_chunks: usize,
) -> Vec<Vec<RecordBatch>> 
{
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

// -------------------------------------------------------------------------------------------------
// MotherDuck Parallel Pipeline
// FILTER per chunk
// PIVOT globally
// SORT globally
// -------------------------------------------------------------------------------------------------

pub fn process_pipeline_parallel(
    batches: Vec<RecordBatch>,
    filters: Option<&[FilterCondition]>,
    pivot_spec: Option<&PivotSpec>,
    sort_specs: Option<&[SortSpec]>,
    show_subtotal: bool,
) -> Result<Vec<RecordBatch>, JsValue> 
{
    if batches.is_empty() {
        return Ok(vec![]);
    }

    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();

    #[cfg(target_arch = "wasm32")]
    console::log_1(&format!("🚀 MotherDuck Pipeline Start: {} rows", total_rows).into());

    // -----------------------------
    // 1. Chunk split
    // -----------------------------

    let chunk_count = get_optimal_chunk_count(batches.len());
    let chunks = split_batches_for_parallel(batches, chunk_count);

    #[cfg(target_arch = "wasm32")]
    console::log_1(&format!("📦 Split into {} chunks", chunks.len()).into());

    // clone filters only (pivot + sort stay global)
    let filters_owned = filters.map(|f| f.to_vec());

    // -----------------------------
    // 2. FILTER ONLY in each chunk
    // -----------------------------

    let mut filtered_batches: Vec<RecordBatch> = Vec::new();

    for mut chunk in chunks {
        if let Some(f) = filters_owned.as_deref() {
            if !f.is_empty() {
                chunk = filters::apply_filters(chunk, f)?;
            }
        }
        filtered_batches.extend(chunk);
    }

    if filtered_batches.is_empty() {
        #[cfg(target_arch = "wasm32")]
        console::log_1(&"⚠️ After filtering: 0 rows remain".into());
        return Ok(vec![]);
    }

    // -----------------------------
    // 3. GLOBAL PIVOT
    // -----------------------------

    let mut batches = filtered_batches;

    if let Some(p) = pivot_spec {
        if !p.rows.is_empty() && !p.values.is_empty() {
            #[cfg(target_arch = "wasm32")]
            console::log_1(&"🔄 Applying global pivot…".into());

            batches = pivot::apply_pivot(batches, p, show_subtotal)?;
        }
    }

    // -----------------------------
    // 4. GLOBAL SORT
    // -----------------------------

    if let Some(s) = sort_specs {
        if !s.is_empty() {
            #[cfg(target_arch = "wasm32")]
            console::log_1(&"📊 Applying global sort…".into());

            batches = sorting::apply_sorting(batches, s)?;
        }
    }

    // -----------------------------
    // DONE
    // -----------------------------

    let final_rows: usize = batches.iter().map(|b| b.num_rows()).sum();

    #[cfg(target_arch = "wasm32")]
    console::log_1(
        &format!("✅ MotherDuck Pipeline Complete: {} rows output", final_rows).into()
    );

    Ok(batches)
}

// -------------------------------------------------------------------------------------------------
// Combine batches (rarely used in MotherDuck flow)
// -------------------------------------------------------------------------------------------------

#[allow(dead_code)]
pub fn combine_batches(
    schema: &SchemaRef,
    batches: &[RecordBatch],
) -> Result<RecordBatch, JsValue> 
{
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
        assert!(count >= 1);
    }
}
