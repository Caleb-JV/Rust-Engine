use arrow_array::Array;
use wasm_bindgen::JsValue;

use crate::utils::error::js_err;
use crate::storage::{STORED_BATCHES, STORED_SCHEMA};

// Imports required for the grouping/aggregation logic:
use serde::{Serialize,Deserialize};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[allow(dead_code)]
pub struct AggregationConfig {
    pub fields: HashMap<String, String>,
}

/// Get filter options for a column (unique values for text, min/max for numbers)
pub fn get_filter_options(col_name: &str) -> Result<JsValue, JsValue> {
    let schema = STORED_SCHEMA
        .lock()
        .unwrap()
        .clone()
        .ok_or(js_err("No schema stored. Call seed() first."))?;

    let batches = STORED_BATCHES
        .lock()
        .unwrap()
        .clone()
        .ok_or(js_err("No batches stored."))?;

    // Find column index
    let col_index = schema
        .index_of(col_name)
        .map_err(|_| js_err(&format!("Column not found: {}", col_name)))?;

    let field = schema.field(col_index);
    let dt = field.data_type();

    // Collect all column arrays
    let mut arrays = Vec::new();
    for batch in batches {
        arrays.push(batch.column(col_index).clone());
    }

    use arrow_schema::DataType;

    let json_result = match dt {
        // TEXT COLUMNS
        DataType::Utf8 | DataType::LargeUtf8 => {
            use arrow_array::{LargeStringArray, StringArray};
            use std::collections::BTreeSet;

            let mut set: BTreeSet<String> = BTreeSet::new();

            for arr in arrays {
                if let Some(a) = arr.as_any().downcast_ref::<StringArray>() {
                    for i in 0..a.len() {
                        if a.is_valid(i) {
                            set.insert(a.value(i).to_string());
                        }
                    }
                } else if let Some(a) = arr.as_any().downcast_ref::<LargeStringArray>() {
                    for i in 0..a.len() {
                        if a.is_valid(i) {
                            set.insert(a.value(i).to_string());
                        }
                    }
                }
            }

            json!({
                "column": col_name,
                "type": "text",
                "values": set.into_iter().collect::<Vec<_>>()
            })
        }

        // NUMBER COLUMNS
        DataType::Int64 => {
            use arrow_array::Int64Array;

            let mut min = i64::MAX;
            let mut max = i64::MIN;

            for arr in arrays {
                let a = arr.as_any().downcast_ref::<Int64Array>().unwrap();
                for i in 0..a.len() {
                    if a.is_valid(i) {
                        let v = a.value(i);
                        if v < min {
                            min = v;
                        }
                        if v > max {
                            max = v;
                        }
                    }
                }
            }

            json!({
                "column": col_name,
                "type": "number",
                "min": min,
                "max": max
            })
        }

        DataType::Float64 => {
            use arrow_array::Float64Array;

            let mut min = f64::MAX;
            let mut max = f64::MIN;

            for arr in arrays {
                let a = arr.as_any().downcast_ref::<Float64Array>().unwrap();
                for i in 0..a.len() {
                    if a.is_valid(i) {
                        let v = a.value(i);
                        if v < min {
                            min = v;
                        }
                        if v > max {
                            max = v;
                        }
                    }
                }
            }

            json!({
                "column": col_name,
                "type": "number",
                "min": min,
                "max": max
            })
        }

        // BOOLEAN COLUMNS
        DataType::Boolean => {
            use arrow_array::BooleanArray;
            let mut has_true = false;
            let mut has_false = false;

            for arr in arrays {
                let a = arr.as_any().downcast_ref::<BooleanArray>().unwrap();
                for i in 0..a.len() {
                    if a.is_valid(i) {
                        if a.value(i) {
                            has_true = true;
                        } else {
                            has_false = true;
                        }
                    }
                }
            }

            json!({
                "column": col_name,
                "type": "boolean",
                "options": {
                    "true": has_true,
                    "false": has_false
                }
            })
        }

        // UNSUPPORTED TYPE
        other => {
            return Err(js_err(&format!(
                "Filter options not supported for type {:?}",
                other
            )))
        }
    };

    Ok(JsValue::from_str(&json_result.to_string()))
}


#[allow(dead_code)]
fn get_field_as_string<'a>(row: &'a Value, field: &str) -> Option<&'a str> {
    row.get(field).and_then(Value::as_str)
}