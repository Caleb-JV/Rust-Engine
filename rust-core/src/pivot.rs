pub mod aggregation;
pub mod grouping;

use arrow_array::RecordBatch;
use wasm_bindgen::JsValue;

use crate::utils::error::js_err;
use crate::types::query_types::PivotSpec;

use grouping::group_and_aggregate;

/// Apply pivot/grouping to record batches.
/// This is the public entrypoint used by lib.rs and elsewhere.
pub fn apply_pivot(
    batches: Vec<RecordBatch>,
    pivot_spec: &PivotSpec,
    show_subtotal: bool,
) -> Result<Vec<RecordBatch>, JsValue> {
    if batches.is_empty() {
        return Ok(batches);
    }

    // Concatenate all batches so grouping/aggregation logic operates on a
    // single RecordBatch. This preserves the previous behavior.
    let combined = if batches.len() > 1 {
        arrow_select::concat::concat_batches(&batches[0].schema(), &batches)
            .map_err(|e| js_err(&format!("Failed to concatenate batches: {}", e)))?
    } else {
        batches[0].clone()
    };

    let result = group_and_aggregate(&combined, pivot_spec, show_subtotal)?;
    Ok(vec![result])
}
