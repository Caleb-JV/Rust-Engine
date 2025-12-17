use arrow_array::RecordBatch;
use arrow_ord::sort::{lexsort_to_indices, SortColumn, SortOptions};
use arrow_select::take::take;
use wasm_bindgen::JsValue;

use crate::utils::error::js_err;
use crate::types::query_types::{SortDirection, SortSpec};

pub fn apply_sorting(
    batches: Vec<RecordBatch>,
    sort_specs: &[SortSpec],
) -> Result<Vec<RecordBatch>, JsValue> {

    if sort_specs.is_empty() {
        return Ok(batches);
    }

    if batches.is_empty() {
        return Ok(batches);
    }


    let combined = if batches.len() == 1 {
        batches.into_iter().next().unwrap()
    } else {
        arrow_select::concat::concat_batches(&batches[0].schema(), &batches)
            .map_err(|e| js_err(&format!("Failed to concatenate batches: {}", e)))?
    };

    if combined.num_rows() <= 1 {
        return Ok(vec![combined]);
    }

    let mut sort_columns = Vec::with_capacity(sort_specs.len());

    for spec in sort_specs {
        let col_index = combined
            .schema()
            .index_of(&spec.column)
            .map_err(|_| js_err(&format!("Sort column not found: {}", spec.column)))?;

        sort_columns.push(SortColumn {
            values: combined.column(col_index).clone(),
            options: Some(SortOptions {
                descending: matches!(spec.direction, SortDirection::Desc),
                nulls_first: false,
            }),
        });
    }

    let indices = lexsort_to_indices(&sort_columns, None)
        .map_err(|e| js_err(&format!("Sort failed: {}", e)))?;

    let sorted_columns: Vec<_> = combined
        .columns()
        .iter()
        .map(|col| {
            take(col.as_ref(), &indices, None)
                .map_err(|e| js_err(&format!("Failed to apply sort: {}", e)))
        })
        .collect::<Result<_, _>>()?;

    let sorted_batch = RecordBatch::try_new(combined.schema(), sorted_columns)
        .map_err(|e| js_err(&format!("Failed to create sorted batch: {}", e)))?;

    Ok(vec![sorted_batch])
}
