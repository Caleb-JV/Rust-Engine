use arrow_array::{Array, BooleanArray, Float64Array, Int64Array, RecordBatch, StringArray};
use arrow_schema::DataType;
use wasm_bindgen::JsValue;

use crate::error::js_err;
use crate::query_types::{FilterCondition, FilterOperator, FilterValue};

/// Apply filters to record batches
pub fn apply_filters(
    batches: Vec<RecordBatch>,
    filters: &[FilterCondition],
) -> Result<Vec<RecordBatch>, JsValue> {
    if filters.is_empty() {
        return Ok(batches);
    }

    let mut filtered_batches = Vec::new();

    for batch in batches {
        let mut filter_mask: Option<BooleanArray> = None;

        for condition in filters {
            let col_index = batch
                .schema()
                .index_of(&condition.column)
                .map_err(|_| js_err(&format!("Column not found: {}", condition.column)))?;

            let array = batch.column(col_index);
            let condition_mask = apply_filter_condition(array.as_ref(), condition)?;

            filter_mask = match filter_mask {
                None => Some(condition_mask),
                Some(existing) => Some(and_masks(&existing, &condition_mask)?),
            };
        }

        if let Some(mask) = filter_mask {
            let filtered = arrow_select::filter::filter_record_batch(&batch, &mask)
                .map_err(|e| js_err(&format!("Filter error: {}", e)))?;

            if filtered.num_rows() > 0 {
                filtered_batches.push(filtered);
            }
        } else {
            filtered_batches.push(batch);
        }
    }

    Ok(filtered_batches)
}

/// Apply a single filter condition to an array
fn apply_filter_condition(
    array: &dyn Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    use arrow_array::{Float64Array, Int64Array, StringArray};

    match array.data_type() {
        DataType::Utf8 | DataType::LargeUtf8 => {
            let arr = array
                .as_any()
                .downcast_ref::<StringArray>()
                .ok_or_else(|| js_err("Failed to downcast to StringArray"))?;
            apply_string_filter(arr, condition)
        }
        DataType::Int64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Int64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Int64Array"))?;
            apply_numeric_filter_i64(arr, condition)
        }
        DataType::Float64 => {
            let arr = array
                .as_any()
                .downcast_ref::<Float64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Float64Array"))?;
            apply_numeric_filter_f64(arr, condition)
        }
        DataType::Boolean => {
            let arr = array
                .as_any()
                .downcast_ref::<BooleanArray>()
                .ok_or_else(|| js_err("Failed to downcast to BooleanArray"))?;
            apply_boolean_filter(arr, condition)
        }
        dt => Err(js_err(&format!("Filtering not supported for type {:?}", dt))),
    }
}

/// Apply filter to string array
fn apply_string_filter(
    array: &dyn Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let array = array
        .as_any()
        .downcast_ref::<StringArray>()
        .ok_or_else(|| js_err("Failed to downcast to StringArray"))?;
    let len = array.len();
    let mut builder = arrow_array::builder::BooleanBuilder::with_capacity(len);

    match &condition.operator {
        FilterOperator::Equals => {
            if let FilterValue::String(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) == val);
                    }
                }
            } else {
                return Err(js_err("String filter requires string value"));
            }
        }
        FilterOperator::NotEquals => {
            if let FilterValue::String(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) != val);
                    }
                }
            } else {
                return Err(js_err("String filter requires string value"));
            }
        }
        FilterOperator::Contains => {
            if let FilterValue::String(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i).contains(val.as_str()));
                    }
                }
            } else {
                return Err(js_err("Contains filter requires string value"));
            }
        }
        FilterOperator::NotContains => {
            if let FilterValue::String(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(!array.value(i).contains(val.as_str()));
                    }
                }
            } else {
                return Err(js_err("NotContains filter requires string value"));
            }
        }
        FilterOperator::In => {
            if let FilterValue::Array(vals) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(vals.contains(&array.value(i).to_string()));
                    }
                }
            } else {
                return Err(js_err("In filter requires array value"));
            }
        }
        FilterOperator::NotIn => {
            if let FilterValue::Array(vals) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(!vals.contains(&array.value(i).to_string()));
                    }
                }
            } else {
                return Err(js_err("NotIn filter requires array value"));
            }
        }
        _ => return Err(js_err("Unsupported operator for string type")),
    }

    Ok(builder.finish())
}

/// Apply filter to Int64 array
fn apply_numeric_filter_i64(
    array: &dyn Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let array = array
        .as_any()
        .downcast_ref::<Int64Array>()
        .ok_or_else(|| js_err("Failed to downcast to Int64Array"))?;
    let len = array.len();
    let mut builder = arrow_array::builder::BooleanBuilder::with_capacity(len);

    match &condition.operator {
        FilterOperator::Equals => {
            if let FilterValue::Number(val) = &condition.value {
                let val_i64 = *val as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) == val_i64);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::NotEquals => {
            if let FilterValue::Number(val) = &condition.value {
                let val_i64 = *val as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) != val_i64);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::GreaterThan => {
            if let FilterValue::Number(val) = &condition.value {
                let val_i64 = *val as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) > val_i64);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::LessThan => {
            if let FilterValue::Number(val) = &condition.value {
                let val_i64 = *val as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) < val_i64);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::GreaterThanOrEqual => {
            if let FilterValue::Number(val) = &condition.value {
                let val_i64 = *val as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) >= val_i64);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::LessThanOrEqual => {
            if let FilterValue::Number(val) = &condition.value {
                let val_i64 = *val as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) <= val_i64);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::Between => {
            if let FilterValue::Range { min, max } = &condition.value {
                let min_i64 = *min as i64;
                let max_i64 = *max as i64;
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        let v = array.value(i);
                        builder.append_value(v >= min_i64 && v <= max_i64);
                    }
                }
            } else {
                return Err(js_err("Between filter requires range value"));
            }
        }
        _ => return Err(js_err("Unsupported operator for numeric type")),
    }

    Ok(builder.finish())
}

/// Apply filter to Float64 array
fn apply_numeric_filter_f64(
    array: &dyn Array,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let array = array
        .as_any()
        .downcast_ref::<Float64Array>()
        .ok_or_else(|| js_err("Failed to downcast to Float64Array"))?;
    let len = array.len();
    let mut builder = arrow_array::builder::BooleanBuilder::with_capacity(len);

    match &condition.operator {
        FilterOperator::Equals => {
            if let FilterValue::Number(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value((array.value(i) - val).abs() < f64::EPSILON);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::NotEquals => {
            if let FilterValue::Number(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value((array.value(i) - val).abs() >= f64::EPSILON);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::GreaterThan => {
            if let FilterValue::Number(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) > *val);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::LessThan => {
            if let FilterValue::Number(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) < *val);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::GreaterThanOrEqual => {
            if let FilterValue::Number(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) >= *val);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::LessThanOrEqual => {
            if let FilterValue::Number(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) <= *val);
                    }
                }
            } else {
                return Err(js_err("Numeric filter requires number value"));
            }
        }
        FilterOperator::Between => {
            if let FilterValue::Range { min, max } = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        let v = array.value(i);
                        builder.append_value(v >= *min && v <= *max);
                    }
                }
            } else {
                return Err(js_err("Between filter requires range value"));
            }
        }
        _ => return Err(js_err("Unsupported operator for numeric type")),
    }

    Ok(builder.finish())
}

/// Apply filter to Boolean array
fn apply_boolean_filter(
    array: &BooleanArray,
    condition: &FilterCondition,
) -> Result<BooleanArray, JsValue> {
    let len = array.len();
    let mut builder = arrow_array::builder::BooleanBuilder::with_capacity(len);

    match &condition.operator {
        FilterOperator::Equals => {
            if let FilterValue::Boolean(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) == *val);
                    }
                }
            } else {
                return Err(js_err("Boolean filter requires boolean value"));
            }
        }
        FilterOperator::NotEquals => {
            if let FilterValue::Boolean(val) = &condition.value {
                for i in 0..len {
                    if array.is_null(i) {
                        builder.append_value(false);
                    } else {
                        builder.append_value(array.value(i) != *val);
                    }
                }
            } else {
                return Err(js_err("Boolean filter requires boolean value"));
            }
        }
        _ => return Err(js_err("Unsupported operator for boolean type")),
    }

    Ok(builder.finish())
}

/// AND two boolean masks together
fn and_masks(a: &BooleanArray, b: &BooleanArray) -> Result<BooleanArray, JsValue> {
    let len = a.len();
    if len != b.len() {
        return Err(js_err("Mask length mismatch"));
    }

    let mut builder = arrow_array::builder::BooleanBuilder::with_capacity(len);
    for i in 0..len {
        let a_val = !a.is_null(i) && a.value(i);
        let b_val = !b.is_null(i) && b.value(i);
        builder.append_value(a_val && b_val);
    }

    Ok(builder.finish())
}
