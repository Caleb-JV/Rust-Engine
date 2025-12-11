use arrow_array::{
    Array, BooleanArray, Date32Array, Date64Array, Float64Array, Int32Array, Int64Array, RecordBatch, StringArray,
};
use arrow_schema::DataType;
use wasm_bindgen::JsValue;

use crate::utils::error::js_err;

/// Flattens Vec<RecordBatch> → unified column buffers (MotherDuck style)
pub fn flatten_batches_to_js(
    batches: &[RecordBatch],
) -> Result<JsValue, JsValue> {
    if batches.is_empty() {
        let response = js_sys::Object::new();
        js_sys::Reflect::set(&response, &"columns".into(), &js_sys::Array::new())?;
        js_sys::Reflect::set(&response, &"rowCount".into(), &JsValue::from_f64(0.0))?;
        return Ok(response.into());
    }

    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    let schema = batches[0].schema();
    let fields = schema.fields();

    let js_columns = js_sys::Array::new();

    for (col_idx, field) in fields.iter().enumerate() {
        let name = field.name();
        let data_type = field.data_type();

        let col_obj = js_sys::Object::new();

        js_sys::Reflect::set(&col_obj, &"name".into(), &JsValue::from_str(name))?;

        match data_type {
            // -------------------------------------------------------------------------
            // FLOAT64
            // -------------------------------------------------------------------------
            DataType::Float64 => {
                let mut flat: Vec<f64> = Vec::with_capacity(total_rows);

                for batch in batches {
                    let arr = batch.column(col_idx)
                        .as_any()
                        .downcast_ref::<Float64Array>()
                        .ok_or_else(|| js_err(&format!("Column '{}' is not Float64Array", name)))?;

                    flat.extend_from_slice(arr.values());
                }

                let js_values = js_sys::Float64Array::new_with_length(flat.len() as u32);
                js_values.copy_from(&flat[..]);

                js_sys::Reflect::set(&col_obj, &"dataType".into(), &"float64".into())?;
                js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
            }

            // -------------------------------------------------------------------------
            // INT64
            // -------------------------------------------------------------------------
            DataType::Int64 => {
                let mut flat: Vec<i64> = Vec::with_capacity(total_rows);

                for batch in batches {
                    let arr = batch.column(col_idx)
                        .as_any()
                        .downcast_ref::<Int64Array>()
                        .ok_or_else(|| js_err(&format!("Column '{}' is not Int64Array", name)))?;

                    flat.extend_from_slice(arr.values());
                }

                let js_values = js_sys::BigInt64Array::new_with_length(flat.len() as u32);
                js_values.copy_from(&flat[..]);

                js_sys::Reflect::set(&col_obj, &"dataType".into(), &"int64".into())?;
                js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
            }

            // -------------------------------------------------------------------------
            // INT32
            // -------------------------------------------------------------------------
            DataType::Int32 => {
                let mut flat: Vec<i32> = Vec::with_capacity(total_rows);

                for batch in batches {
                    let arr = batch.column(col_idx)
                        .as_any()
                        .downcast_ref::<Int32Array>()
                        .ok_or_else(|| js_err(&format!("Column '{}' is not Int32Array", name)))?;

                    flat.extend_from_slice(arr.values());
                }

                let js_values = js_sys::Int32Array::new_with_length(flat.len() as u32);
                js_values.copy_from(&flat[..]);

                js_sys::Reflect::set(&col_obj, &"dataType".into(), &"int32".into())?;
                js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
            }

            // -------------------------------------------------------------------------
            // BOOLEAN (use raw packed bytes)
            // -------------------------------------------------------------------------
            DataType::Boolean => {
    // Store booleans as 1/0 bytes for JS
    let mut flat: Vec<u8> = Vec::with_capacity(total_rows);

    for batch in batches {
        let arr = batch.column(col_idx)
            .as_any()
            .downcast_ref::<BooleanArray>()
            .ok_or_else(|| js_err(&format!(
                "Column '{}' is not BooleanArray", name
            )))?;

        for i in 0..arr.len() {
            flat.push(if arr.value(i) { 1 } else { 0 });
        }
    }

    let js_values = js_sys::Uint8Array::new_with_length(flat.len() as u32);
    js_values.copy_from(&flat[..]);

    js_sys::Reflect::set(&col_obj, &"dataType".into(), &"bool".into())?;
    js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
}


            // -------------------------------------------------------------------------
            // UTF8 STRINGS
            // -------------------------------------------------------------------------
            DataType::Utf8 => {
                let mut values: Vec<u8> = Vec::new();
                let mut offsets: Vec<i32> = Vec::with_capacity(total_rows + 1);
                offsets.push(0);

                for batch in batches {
                    let arr = batch.column(col_idx)
                        .as_any()
                        .downcast_ref::<StringArray>()
                        .ok_or_else(|| js_err(&format!("Column '{}' is not StringArray", name)))?;

                    for i in 0..arr.len() {
                        let s = arr.value(i);
                        values.extend_from_slice(s.as_bytes());
                        offsets.push(values.len() as i32);
                    }
                }

                let js_values = js_sys::Uint8Array::new_with_length(values.len() as u32);
                js_values.copy_from(&values[..]);

                let js_offsets = js_sys::Int32Array::new_with_length(offsets.len() as u32);
                js_offsets.copy_from(&offsets[..]);

                js_sys::Reflect::set(&col_obj, &"dataType".into(), &"utf8".into())?;
                js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
                js_sys::Reflect::set(&col_obj, &"offsets".into(), &js_offsets)?;
            }

            // -------------------------------------------------------------------------
            // DATE32 (days since epoch)
            // -------------------------------------------------------------------------
            DataType::Date32 => {
                let mut flat: Vec<i32> = Vec::with_capacity(total_rows);

                for batch in batches {
                    let arr = batch.column(col_idx)
                        .as_any()
                        .downcast_ref::<Date32Array>()
                        .ok_or_else(|| js_err(&format!("Column '{}' is not Date32Array", name)))?;

                    flat.extend_from_slice(arr.values());
                }

                let js_values = js_sys::Int32Array::new_with_length(flat.len() as u32);
                js_values.copy_from(&flat[..]);

                js_sys::Reflect::set(&col_obj, &"dataType".into(), &"date32".into())?;
                js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
            }

            // -------------------------------------------------------------------------
            // DATE64 (milliseconds since epoch)
            // -------------------------------------------------------------------------
            DataType::Date64 => {
                let mut flat: Vec<i64> = Vec::with_capacity(total_rows);

                for batch in batches {
                    let arr = batch.column(col_idx)
                        .as_any()
                        .downcast_ref::<Date64Array>()
                        .ok_or_else(|| js_err(&format!("Column '{}' is not Date64Array", name)))?;

                    flat.extend_from_slice(arr.values());
                }

                let js_values = js_sys::BigInt64Array::new_with_length(flat.len() as u32);
                js_values.copy_from(&flat[..]);

                js_sys::Reflect::set(&col_obj, &"dataType".into(), &"date64".into())?;
                js_sys::Reflect::set(&col_obj, &"values".into(), &js_values)?;
            }

            // -------------------------------------------------------------------------
            // UNSUPPORTED TYPE
            // -------------------------------------------------------------------------
            other => {
                return Err(js_err(&format!(
                    "Unsupported data type for column '{}': {:?}",
                    name, other
                )));
            }
        }

        js_columns.push(&col_obj);
    }

    // Build JS response
    let response = js_sys::Object::new();
    js_sys::Reflect::set(&response, &"columns".into(), &js_columns)?;
    js_sys::Reflect::set(
        &response,
        &"rowCount".into(),
        &JsValue::from_f64(total_rows as f64),
    )?;

    Ok(response.into())
}
