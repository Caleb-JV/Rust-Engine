use arrow_array::RecordBatch;
use arrow_ord::sort::{SortColumn, SortOptions};
use wasm_bindgen::JsValue;

use crate::error::js_err;
use crate::query_types::{SortDirection, SortSpec};

/// Apply sorting to record batches
pub fn apply_sorting(
    batches: Vec<RecordBatch>,
    sort_specs: &[SortSpec],
) -> Result<Vec<RecordBatch>, JsValue> {
    if sort_specs.is_empty() {
        return Ok(batches);
    }

    // Concatenate all batches first if there are multiple
    let combined = if batches.len() > 1 {
        arrow_select::concat::concat_batches(&batches[0].schema(), &batches)
            .map_err(|e| js_err(&format!("Failed to concatenate batches: {}", e)))?
    } else if batches.len() == 1 {
        batches[0].clone()
    } else {
        return Ok(batches);
    };

    // Build sort columns
    let mut sort_columns = Vec::new();

    for spec in sort_specs {
        let col_index = combined
            .schema()
            .index_of(&spec.column)
            .map_err(|_| js_err(&format!("Sort column not found: {}", spec.column)))?;

        let options = SortOptions {
            descending: matches!(spec.direction, SortDirection::Desc),
            nulls_first: false,
        };

        sort_columns.push(SortColumn {
            values: combined.column(col_index).clone(),
            options: Some(options),
        });
    }

    // Perform sort
    let indices = arrow_ord::sort::lexsort_to_indices(&sort_columns, None)
        .map_err(|e| js_err(&format!("Sort failed: {}", e)))?;

    // Apply sort indices to all columns
    let sorted_columns: Result<Vec<_>, _> = combined
        .columns()
        .iter()
        .map(|col| arrow_select::take::take(col.as_ref(), &indices, None))
        .collect();

    let sorted_columns = sorted_columns.map_err(|e| js_err(&format!("Failed to apply sort: {}", e)))?;

    let sorted_batch = RecordBatch::try_new(combined.schema(), sorted_columns)
        .map_err(|e| js_err(&format!("Failed to create sorted batch: {}", e)))?;

    Ok(vec![sorted_batch])
}
