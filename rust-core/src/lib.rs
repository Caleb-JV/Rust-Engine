use wasm_bindgen::prelude::*;
use js_sys::Error as JsError;

use arrow_array::{RecordBatch};
use arrow_array::{
    Array, Float64Array, Int64Array
};
use serde_json::json;
use arrow_schema::{ArrowError, Schema, SchemaRef};
use arrow_ipc::writer::StreamWriter;
use arrow_csv::reader::{ReaderBuilder, Format};


use once_cell::sync::Lazy;
use std::sync::{Mutex, Arc};
use std::io::Cursor;

/// Global schema + batches
static STORED_SCHEMA: Lazy<Mutex<Option<SchemaRef>>> =
    Lazy::new(|| Mutex::new(None));

static STORED_BATCHES: Lazy<Mutex<Option<Vec<RecordBatch>>>> =
    Lazy::new(|| Mutex::new(None));

/// A clean "string → JsValue" error builder
fn js_err(msg: &str) -> JsValue {
    JsError::new(msg).into()
}

/// ArrowError → JsValue mapper
fn js_err_arrow(e: ArrowError) -> JsValue {
    JsError::new(&format!("Arrow Error: {}", e)).into()
}


/// ------------------------------------------------------------------
///   CSV → Arrow IPC → store schema + batches
/// ------------------------------------------------------------------
#[wasm_bindgen]
pub fn seed(bytes: &[u8]) -> Result<(), JsValue> {

    let mut cursor = Cursor::new(bytes);

    let fmt = Format::default().with_header(true);
    let (schema, _) = fmt.infer_schema(&mut cursor, None).map_err(js_err_arrow)?;
    let schema: SchemaRef = Arc::new(schema);

    cursor.set_position(0);


    let reader = ReaderBuilder::new(schema.clone())
        .with_header(true)
        .build(cursor)
        .map_err(js_err_arrow)?;

    let batches: Vec<RecordBatch> =
        reader.collect::<Result<Vec<_>, _>>().map_err(js_err_arrow)?;

    // store globally
    *STORED_SCHEMA.lock().unwrap() = Some(schema.clone());
    *STORED_BATCHES.lock().unwrap() = Some(batches.clone());

    Ok(())
}

fn to_simple_type(dt: &arrow_schema::DataType) -> &'static str {
    use arrow_schema::DataType::*;

    match dt {
        Int8 | Int16 | Int32 | Int64 |
        UInt8 | UInt16 | UInt32 | UInt64 |
        Float16 | Float32 | Float64 |
        Decimal128(_, _) | Decimal256(_, _) => "number",

        Utf8 | LargeUtf8 => "text",

        Boolean => "boolean",

        Date32 | Date64 => "date",

        Timestamp(_, _) => "datetime",

        List(_) | LargeList(_) | FixedSizeList(_, _) => "list",

        _ => "unknown",
    }
}


#[wasm_bindgen]
pub fn get_meta_data() -> Result<JsValue, JsValue> {
    let schema_opt = STORED_SCHEMA
        .lock()
        .unwrap()
        .clone();

    let schema = match schema_opt {
        Some(s) => s,
        None => return Err(js_err("No schema stored. Call csvtoarrow() first.")),
    };

    let mut cols = Vec::new();

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
        "column_count": schema.fields().len(),
    });

    let json_string = serde_json::to_string(&meta).map_err(|e| js_err(&format!("Serialization error: {}", e)))?;
    Ok(JsValue::from_str(&json_string))
}

fn parse_cols(input: &str) -> Vec<String> {
    input
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn encode_ipc(schema: &SchemaRef, batches: &[RecordBatch]) -> Result<Vec<u8>, JsValue> {
    let mut out = Vec::new();

    // Create IPC writer
    let mut writer =
        StreamWriter::try_new(&mut out, schema.as_ref()).map_err(js_err_arrow)?;

    // Write each batch
    for batch in batches {
        writer.write(batch).map_err(js_err_arrow)?;
    }

    // Finish IPC stream
    writer.finish().map_err(js_err_arrow)?;

    Ok(out)
}
#[wasm_bindgen]
pub fn get_data(col_names: &str) -> Result<Vec<u8>, JsValue> {
    // Load stored schema and batches
    let schema_opt = STORED_SCHEMA.lock().unwrap().clone();
    let batches_opt = STORED_BATCHES.lock().unwrap().clone();

    let schema = match schema_opt {
        Some(s) => s,
        None => return Err(js_err("No schema stored. Call csvtoarrow() first.")),
    };

    let batches = match batches_opt {
        Some(b) => b,
        None => return Err(js_err("No batches stored.")),
    };

    // Parse requested columns
    let cols = parse_cols(col_names);

    // If empty → return all original batches as IPC
    if cols.is_empty() {
        return encode_ipc(&schema, &batches);
    }

    // Validate & determine column indices
    let mut indices = Vec::new();

    for name in &cols {
        match schema.index_of(name) {
            Ok(i) => indices.push(i),
            Err(_) => return Err(js_err(&format!("Column not found: {}", name))),
        }
    }

    // Build projected schema
    let projected_fields = indices
        .iter()
        .map(|i| schema.field(*i).clone())
        .collect::<Vec<_>>();

    let projected_schema: SchemaRef = Arc::new(Schema::new(projected_fields));

    // Project each RecordBatch using take()
    let mut projected_batches = Vec::new();

    for batch in batches {
        // Slice columns
        let cols = indices
            .iter()
            .map(|i| batch.column(*i).clone())
            .collect::<Vec<_>>();

        let projected = RecordBatch::try_new(projected_schema.clone(), cols)
            .map_err(js_err_arrow)?;

        projected_batches.push(projected);
    }

    // Encode into IPC
    encode_ipc(&projected_schema, &projected_batches)
}


#[wasm_bindgen]
pub fn aggregate(col_names: &str, aggregation_type: &str) -> Result<JsValue, JsValue> {
    let agg_type = match aggregation_type.to_lowercase().as_str() {
        "sum" => AggregationType::Sum,
        "average" | "avg" => AggregationType::Average,
        "count" => AggregationType::Count,
        "max" => AggregationType::Max,
        "min" => AggregationType::Min,
        _ => return Err(js_err(&format!("Unknown aggregation type: {}", aggregation_type))),
    };

    // Load stored schema + batches
    let schema = STORED_SCHEMA.lock().unwrap().clone()
        .ok_or(js_err("No schema stored. Call seed() first."))?;

    let batches = STORED_BATCHES.lock().unwrap().clone()
        .ok_or(js_err("No batches stored."))?;

    let cols = parse_cols(col_names);

    if cols.len() != 1 {
        return Err(js_err("Aggregation supports exactly ONE column"));
    }

    let col_name = &cols[0];

    let col_index = schema.index_of(col_name)
        .map_err(|_| js_err(&format!("Column not found: {}", col_name)))?;

    // ---------------------------------------------------------------
    // Now extract values across all batches and perform aggregation
    // ---------------------------------------------------------------

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
            // ----------------------------
            // INT64
            // ----------------------------
            arrow_schema::DataType::Int64 => {
                let a = array.as_any().downcast_ref::<Int64Array>().unwrap();

                for i in 0..a.len() {
                    if a.is_null(i) { continue; }

                    let v = a.value(i) as f64;

                    total_count += 1;
                    sum_f64 += v;
                    if v > max_f64 { max_f64 = v; }
                    if v < min_f64 { min_f64 = v; }
                }
            }

            // ----------------------------
            // FLOAT64
            // ----------------------------
            arrow_schema::DataType::Float64 => {
                let a = array.as_any().downcast_ref::<Float64Array>().unwrap();

                for i in 0..a.len() {
                    if a.is_null(i) { continue; }

                    let v = a.value(i);

                    total_count += 1;
                    sum_f64 += v;
                    if v > max_f64 { max_f64 = v; }
                    if v < min_f64 { min_f64 = v; }
                }
            }

            dt => {
                return Err(js_err(&format!("Aggregation not supported for type {:?}", dt)));
            }
        }
    }

    if total_count == 0 {
        return Err(js_err("Column has no numeric values"));
    }

    // ---------------------------------------------------------------
    // Build result
    // ---------------------------------------------------------------
    let result = match agg_type {
        AggregationType::Sum =>
            json!({ "aggregation": "sum", "column": col_name, "value": sum_f64 }),

        AggregationType::Average =>
            json!({ "aggregation": "average", "column": col_name, "value": sum_f64 / total_count as f64 }),

        AggregationType::Count =>
            json!({ "aggregation": "count", "column": col_name, "value": total_count }),

        AggregationType::Max =>
            json!({ "aggregation": "max", "column": col_name, "value": max_f64 }),

        AggregationType::Min =>
            json!({ "aggregation": "min", "column": col_name, "value": min_f64 }),
    };

    Ok(JsValue::from_str(&result.to_string()))
}


#[wasm_bindgen]
pub fn get_filter_options(col_name: &str) -> Result<JsValue, JsValue> {
    let schema = STORED_SCHEMA.lock().unwrap().clone()
        .ok_or(js_err("No schema stored. Call seed() first."))?;

    let batches = STORED_BATCHES.lock().unwrap().clone()
        .ok_or(js_err("No batches stored."))?;

    // --------------------------
    // 1. Find column index
    // --------------------------
    let col_index = schema.index_of(col_name)
        .map_err(|_| js_err(&format!("Column not found: {}", col_name)))?;

    let field = schema.field(col_index);
    let dt = field.data_type();

    // --------------------------
    // 2. Collect all column arrays
    // --------------------------
    let mut arrays = Vec::new();
    for batch in batches {
        arrays.push(batch.column(col_index).clone());
    }

    // --------------------------
    // TEXT   → unique values
    // NUMBER → min/max
    // BOOL   → unique bool values
    // DATE   → min/max
    // --------------------------

    use arrow_schema::DataType;

    let json_result = match dt {
        // -----------------------------
        // TEXT COLUMNS
        // -----------------------------
        DataType::Utf8 | DataType::LargeUtf8 => {
            use arrow_array::{StringArray, LargeStringArray};
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

        // -----------------------------
        // NUMBER COLUMNS
        // -----------------------------
        DataType::Int64 => {
            use arrow_array::Int64Array;

            let mut min = i64::MAX;
            let mut max = i64::MIN;

            for arr in arrays {
                let a = arr.as_any().downcast_ref::<Int64Array>().unwrap();
                for i in 0..a.len() {
                    if a.is_valid(i) {
                        let v = a.value(i);
                        if v < min { min = v; }
                        if v > max { max = v; }
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
                        if v < min { min = v; }
                        if v > max { max = v; }
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

        // -----------------------------
        // BOOLEAN COLUMNS
        // -----------------------------
        DataType::Boolean => {
            use arrow_array::BooleanArray;
            let mut has_true = false;
            let mut has_false = false;

            for arr in arrays {
                let a = arr.as_any().downcast_ref::<BooleanArray>().unwrap();
                for i in 0..a.len() {
                    if a.is_valid(i) {
                        if a.value(i) { has_true = true; }
                        else { has_false = true; }
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

        // -----------------------------
        // DATE & DATETIME
        // -----------------------------
        DataType::Date32 | DataType::Date64 | DataType::Timestamp(_, _) => {
            use arrow_array::{Date32Array, Date64Array, TimestampNanosecondArray};

            let mut min = i64::MAX;
            let mut max = i64::MIN;

            for arr in arrays {
                if let Some(a) = arr.as_any().downcast_ref::<Date32Array>() {
                    for i in 0..a.len() {
                        if a.is_valid(i) {
                            let v = a.value(i) as i64;
                            if v < min { min = v; }
                            if v > max { max = v; }
                        }
                    }
                } else if let Some(a) = arr.as_any().downcast_ref::<Date64Array>() {
                    for i in 0..a.len() {
                        if a.is_valid(i) {
                            let v = a.value(i);
                            if v < min { min = v; }
                            if v > max { max = v; }
                        }
                    }
                } else if let Some(a) = arr.as_any().downcast_ref::<TimestampNanosecondArray>() {
                    for i in 0..a.len() {
                        if a.is_valid(i) {
                            let v = a.value(i);
                            if v < min { min = v; }
                            if v > max { max = v; }
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

        // -----------------------------
        // UNSUPPORTED TYPE
        // -----------------------------
        other => {
            return Err(js_err(&format!(
                "Filter options not supported for type {:?}", other
            )))
        }
    };

    Ok(JsValue::from_str(&json_result.to_string()))
}

enum AggregationType {
    Sum,
    Average,
    Count,
    Max,
    Min,
}
