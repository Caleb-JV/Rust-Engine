use arrow_array::{Array, Float64Array, Int64Array};
use wasm_bindgen::{ JsValue};

use crate::error::js_err;
use crate::helpers::parse_cols;
use crate::storage::{STORED_BATCHES, STORED_SCHEMA};
use crate::types::AggregationType;

// Imports required for the grouping/aggregation logic:
use serde::{Serialize,Deserialize};
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AggregationConfig {
    pub fields: HashMap<String, String>,
}

/// Perform aggregation operations on a column
pub fn aggregate(col_names: &str, aggregation_type: &str) -> Result<JsValue, JsValue> {
    let agg_type = match aggregation_type.to_lowercase().as_str() {
        "sum" => AggregationType::Sum,
        "average" | "avg" => AggregationType::Average,
        "count" => AggregationType::Count,
        "max" => AggregationType::Max,
        "min" => AggregationType::Min,
        _ => {
            return Err(js_err(&format!(
                "Unknown aggregation type: {}",
                aggregation_type
            )))
        }
    };

    // Load stored schema + batches
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

    let cols = parse_cols(col_names);

    if cols.len() != 1 {
        return Err(js_err("Aggregation supports exactly ONE column"));
    }

    let col_name = &cols[0];

    let col_index = schema
        .index_of(col_name)
        .map_err(|_| js_err(&format!("Column not found: {}", col_name)))?;

    // Extract values across all batches and perform aggregation
    let mut total_count: u64 = 0;
    let mut sum_f64: f64 = 0.0;
    let mut max_f64: f64 = f64::MIN;
    let mut min_f64: f64 = f64::MAX;

    for batch in batches {
        let array = batch.column(col_index);

        if array.is_null(0) && array.len() == 0 {
            continue;
        }

        match array.data_type() {
            // INT64
            arrow_schema::DataType::Int64 => {
                let a = array.as_any().downcast_ref::<Int64Array>().unwrap();

                for i in 0..a.len() {
                    if a.is_null(i) {
                        continue;
                    }

                    let v = a.value(i) as f64;

                    total_count += 1;
                    sum_f64 += v;
                    if v > max_f64 {
                        max_f64 = v;
                    }
                    if v < min_f64 {
                        min_f64 = v;
                    }
                }
            }

            // FLOAT64
            arrow_schema::DataType::Float64 => {
                let a = array.as_any().downcast_ref::<Float64Array>().unwrap();

                for i in 0..a.len() {
                    if a.is_null(i) {
                        continue;
                    }

                    let v = a.value(i);

                    total_count += 1;
                    sum_f64 += v;
                    if v > max_f64 {
                        max_f64 = v;
                    }
                    if v < min_f64 {
                        min_f64 = v;
                    }
                }
            }

            dt => {
                return Err(js_err(&format!(
                    "Aggregation not supported for type {:?}",
                    dt
                )));
            }
        }
    }

    if total_count == 0 {
        return Err(js_err("Column has no numeric values"));
    }

    // Build result
    let result = match agg_type {
        AggregationType::Sum => json!({ "aggregation": "sum", "column": col_name, "value": sum_f64 }),

        AggregationType::Average => json!({ "aggregation": "average", "column": col_name, "value": sum_f64 / total_count as f64 }),

        AggregationType::Count => json!({ "aggregation": "count", "column": col_name, "value": total_count }),

        AggregationType::Max => json!({ "aggregation": "max", "column": col_name, "value": max_f64 }),

        AggregationType::Min => json!({ "aggregation": "min", "column": col_name, "value": min_f64 }),
    };

    Ok(JsValue::from_str(&result.to_string()))
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

        // DATE & DATETIME
        DataType::Date32 | DataType::Date64 | DataType::Timestamp(_, _) => {
            use arrow_array::{Date32Array, Date64Array, TimestampNanosecondArray};

            let mut min = i64::MAX;
            let mut max = i64::MIN;

            for arr in arrays {
                if let Some(a) = arr.as_any().downcast_ref::<Date32Array>() {
                    for i in 0..a.len() {
                        if a.is_valid(i) {
                            let v = a.value(i) as i64;
                            if v < min {
                                min = v;
                            }
                            if v > max {
                                max = v;
                            }
                        }
                    }
                } else if let Some(a) = arr.as_any().downcast_ref::<Date64Array>() {
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
                } else if let Some(a) = arr.as_any().downcast_ref::<TimestampNanosecondArray>() {
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
            }

            json!({
                "column": col_name,
                "type": "date",
                "min": min,
                "max": max
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



fn get_field_as_string<'a>(row: &'a Value, field: &str) -> Option<&'a str> {
    row.get(field).and_then(Value::as_str)
}


pub fn get_processed_data(
    rows_json: &str,
    group_by_json: &str,
    aggregation_config_json: &str,
) -> Result<JsValue, JsValue> {
    let rows: Vec<Value> = serde_json::from_str(rows_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse rows JSON: {}", e)))?;

    let group_by: Vec<String> = serde_json::from_str(group_by_json).unwrap_or_default();
    if group_by.is_empty() {
        return Ok(JsValue::from_str(rows_json));
    }

    let aggregation_map: HashMap<String, String> =
        serde_json::from_str(aggregation_config_json).unwrap_or_default();
    let has_aggregation = !aggregation_map.is_empty();

    let mut groups: HashMap<String, Vec<Value>> = HashMap::new();
    let mut ungrouped: Vec<Value> = Vec::new();

    // group rows
    for row in rows.into_iter() {
        let mut key_parts = Vec::new();
        let mut missing_key = false;

        for k in &group_by {
            match row.get(k) {
                Some(v) => key_parts.push(v.to_string()),
                None => {
                    missing_key = true;
                    break;
                }
            }
        }

        if missing_key {
            ungrouped.push(row);
        } else {
            groups.entry(key_parts.join("|")).or_default().push(row);
        }
    }

    let mut output: Vec<Value> = Vec::new();

    for (_key, children) in groups {
        if children.is_empty() {
            continue;
        }

        let first = &children[0];
        let mut parent = json!({});

        // set pivot fields
        for k in &group_by {
            if let Some(v) = first.get(k) {
                parent[k] = v.clone();
            }
        }

      if has_aggregation {
      for (col, method) in &aggregation_map {
        let m = method.to_lowercase();
        match m.as_str() {
            "sum" => {
                let mut total = 0.0;
                for ch in &children {
                    let value = ch.get(col);
                    if let Some(n) = value.and_then(Value::as_f64) {
                        total += n;
                    } else if let Some(s) = value.and_then(Value::as_str) {
                        if let Ok(n) = s.parse::<f64>() {
                            total += n;
                        }
                    }
                }
                parent[col] = json!(total);
            }

            "count" => {
                parent[col] = json!(children.len());
            }

            "avg" | "average" => {
                let mut total = 0.0;
                let mut count = 0.0;
                for ch in &children {
                    let value = ch.get(col);
                    if let Some(n) = value.and_then(Value::as_f64) {
                        total += n;
                        count += 1.0;
                    } else if let Some(s) = value.and_then(Value::as_str) {
                        if let Ok(n) = s.parse::<f64>() {
                            total += n;
                            count += 1.0;
                        }
                    }
                }
                parent[col] = json!(if count > 0.0 { total / count } else { 0.0 });
            }

            _ => {}
        }
    }
}

        parent["isParent"] = json!(true);
        output.push(parent);
        output.extend(children);
    }

    // finally append rows that didn't match group keys
    output.extend(ungrouped);

   serde_json::to_string(&output)
    .map(|s: String| JsValue::from_str(&s))
    .map_err(|e| JsValue::from_str(&format!("Failed to serialize output JSON: {}", e)))

}


