use arrow_array::{Array, RecordBatch, StringArray};
use arrow_ipc::writer::StreamWriter;
use arrow_schema::{DataType, SchemaRef};
use wasm_bindgen::JsValue;
use js_sys::{Object, Reflect, Uint8Array};
use std::sync::Arc;

use crate::utils::error::{js_err_arrow, js_err};

/// Parse comma-separated column names
#[allow(dead_code)]
pub fn parse_cols(input: &str) -> Vec<String> {
    input
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Convert Arrow DataType to simple type string
pub fn to_simple_type(dt: &arrow_schema::DataType) -> &'static str {
    use arrow_schema::DataType::*;

    match dt {
        Int8 | Int16 | Int32 | Int64 | UInt8 | UInt16 | UInt32 | UInt64 | Float16 | Float32
        | Float64 | Decimal128(_, _) | Decimal256(_, _) => "number",

        Utf8 | LargeUtf8 => "text",

        Boolean => "boolean",

        // Treat dates as text for now - date support will be added later
        Date32 | Date64 | Timestamp(_, _) => "text",

        List(_) | LargeList(_) | FixedSizeList(_, _) => "list",

        _ => "unknown",
    }
}

/// Encode RecordBatches into Arrow IPC format
#[allow(dead_code)]
pub fn encode_ipc(schema: &SchemaRef, batches: &[RecordBatch]) -> Result<Vec<u8>, JsValue> {
    let mut out = Vec::new();

    // Create IPC writer
    let mut writer = StreamWriter::try_new(&mut out, schema.as_ref()).map_err(js_err_arrow)?;

    // Write each batch
    for batch in batches {
        writer.write(batch).map_err(js_err_arrow)?;
    }

    // Finish IPC stream
    writer.finish().map_err(js_err_arrow)?;

    Ok(out)
}

/// Combine multiple RecordBatches into a single batch for contiguous memory
#[allow(dead_code)]
pub fn combine_batches(schema: &SchemaRef, batches: &[RecordBatch]) -> Result<RecordBatch, JsValue> {
    if batches.is_empty() {
        return Ok(RecordBatch::new_empty(Arc::clone(schema)));
    }
    
    if batches.len() == 1 {
        return Ok(batches[0].clone());
    }
    
    arrow::compute::concat_batches(schema, batches).map_err(js_err_arrow)
}

/// Extract raw Arrow column buffers for zero-copy transfer to JS
/// Returns a JS array of column buffer objects
#[allow(dead_code)]
pub fn extract_column_buffers(batch: &RecordBatch) -> Result<JsValue, JsValue> {
    let js_array = js_sys::Array::new();
    
    for (field, array) in batch.schema().fields().iter().zip(batch.columns().iter()) {
        let col_obj = extract_single_column(field.name(), array)?;
        js_array.push(&col_obj);
    }
    
    Ok(js_array.into())
}

/// Extract buffers from a single Arrow array
#[allow(dead_code)]
fn extract_single_column(name: &str, array: &Arc<dyn Array>) -> Result<JsValue, JsValue> {
    let obj = Object::new();
    let array_data = array.to_data();
    
    // Basic metadata
    Reflect::set(&obj, &"name".into(), &JsValue::from_str(name))?;
    Reflect::set(&obj, &"length".into(), &JsValue::from_f64(array.len() as f64))?;
    Reflect::set(&obj, &"nullCount".into(), &JsValue::from_f64(array.null_count() as f64))?;
    
    // Extract null bitmap if present
    if let Some(nulls) = array_data.nulls() {
        let null_buffer = nulls.buffer();
        let null_bytes = null_buffer.as_slice();
        let null_array = Uint8Array::from(null_bytes);
        Reflect::set(&obj, &"nullBitmap".into(), &null_array.buffer())?;
    } else {
        Reflect::set(&obj, &"nullBitmap".into(), &JsValue::NULL)?;
    }
    
    // Extract data buffers based on type
    match array.data_type() {
        DataType::Int8 | DataType::UInt8 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Int8"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Int16 | DataType::UInt16 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Int16"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Int32 | DataType::UInt32 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Int32"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Int64 | DataType::UInt64 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Int64"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Float32 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Float32"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Float64 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Float64"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Boolean => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Boolean"))?;
            let buffer = &array_data.buffers()[0];
            let bytes = buffer.as_slice();
            let arr = Uint8Array::from(bytes);
            Reflect::set(&obj, &"values".into(), &arr.buffer())?;
            Reflect::set(&obj, &"offsets".into(), &JsValue::NULL)?;
        }
        
        DataType::Utf8 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Utf8"))?;
            
            // Buffer 0: offsets (i32), Buffer 1: values (u8)
            let offset_buffer = &array_data.buffers()[0];
            let value_buffer = &array_data.buffers()[1];
            
            let offset_bytes = offset_buffer.as_slice();
            let value_bytes = value_buffer.as_slice();
            
            let offset_array = Uint8Array::from(offset_bytes);
            let value_array = Uint8Array::from(value_bytes);
            
            Reflect::set(&obj, &"offsets".into(), &offset_array.buffer())?;
            Reflect::set(&obj, &"values".into(), &value_array.buffer())?;
        }
        
        DataType::LargeUtf8 => {
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("LargeUtf8"))?;
            
            // Buffer 0: offsets (i64), Buffer 1: values (u8)
            let offset_buffer = &array_data.buffers()[0];
            let value_buffer = &array_data.buffers()[1];
            
            let offset_bytes = offset_buffer.as_slice();
            let value_bytes = value_buffer.as_slice();
            
            let offset_array = Uint8Array::from(offset_bytes);
            let value_array = Uint8Array::from(value_bytes);
            
            Reflect::set(&obj, &"offsets".into(), &offset_array.buffer())?;
            Reflect::set(&obj, &"values".into(), &value_array.buffer())?;
        }
        
        // Convert date/timestamp types to strings
        DataType::Date32 => {
            use arrow_array::Date32Array;
            
            let date_array = array.as_any()
                .downcast_ref::<Date32Array>()
                .ok_or_else(|| js_err("Failed to downcast to Date32Array"))?;
            
            let mut string_values = Vec::with_capacity(date_array.len());
            for i in 0..date_array.len() {
                if date_array.is_null(i) {
                    string_values.push(String::new());
                } else {
                    let days = date_array.value(i);
                    // Convert days since epoch to date string
                    let date_str = format_date32(days);
                    string_values.push(date_str);
                }
            }
            
            let string_array = StringArray::from(string_values);
            let string_data = string_array.to_data();
            
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Utf8"))?;
            
            let offset_buffer = &string_data.buffers()[0];
            let value_buffer = &string_data.buffers()[1];
            
            let offset_bytes = offset_buffer.as_slice();
            let value_bytes = value_buffer.as_slice();
            
            let offset_array = Uint8Array::from(offset_bytes);
            let value_array = Uint8Array::from(value_bytes);
            
            Reflect::set(&obj, &"offsets".into(), &offset_array.buffer())?;
            Reflect::set(&obj, &"values".into(), &value_array.buffer())?;
        }
        
        DataType::Date64 => {
            use arrow_array::Date64Array;
            
            let date_array = array.as_any()
                .downcast_ref::<Date64Array>()
                .ok_or_else(|| js_err("Failed to downcast to Date64Array"))?;
            
            let mut string_values = Vec::with_capacity(date_array.len());
            for i in 0..date_array.len() {
                if date_array.is_null(i) {
                    string_values.push(String::new());
                } else {
                    let millis = date_array.value(i);
                    // Convert milliseconds since epoch to date string
                    let date_str = format_date64(millis);
                    string_values.push(date_str);
                }
            }
            
            let string_array = StringArray::from(string_values);
            let string_data = string_array.to_data();
            
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Utf8"))?;
            
            let offset_buffer = &string_data.buffers()[0];
            let value_buffer = &string_data.buffers()[1];
            
            let offset_bytes = offset_buffer.as_slice();
            let value_bytes = value_buffer.as_slice();
            
            let offset_array = Uint8Array::from(offset_bytes);
            let value_array = Uint8Array::from(value_bytes);
            
            Reflect::set(&obj, &"offsets".into(), &offset_array.buffer())?;
            Reflect::set(&obj, &"values".into(), &value_array.buffer())?;
        }
        
        DataType::Timestamp(_, _) => {
            use arrow_array::TimestampMillisecondArray;
            
            let ts_array = array.as_any()
                .downcast_ref::<TimestampMillisecondArray>()
                .ok_or_else(|| js_err("Failed to downcast to TimestampMillisecondArray"))?;
            
            let mut string_values = Vec::with_capacity(ts_array.len());
            for i in 0..ts_array.len() {
                if ts_array.is_null(i) {
                    string_values.push(String::new());
                } else {
                    let millis = ts_array.value(i);
                    // Convert milliseconds since epoch to datetime string
                    let date_str = format_timestamp(millis);
                    string_values.push(date_str);
                }
            }
            
            let string_array = StringArray::from(string_values);
            let string_data = string_array.to_data();
            
            Reflect::set(&obj, &"dataType".into(), &JsValue::from_str("Utf8"))?;
            
            let offset_buffer = &string_data.buffers()[0];
            let value_buffer = &string_data.buffers()[1];
            
            let offset_bytes = offset_buffer.as_slice();
            let value_bytes = value_buffer.as_slice();
            
            let offset_array = Uint8Array::from(offset_bytes);
            let value_array = Uint8Array::from(value_bytes);
            
            Reflect::set(&obj, &"offsets".into(), &offset_array.buffer())?;
            Reflect::set(&obj, &"values".into(), &value_array.buffer())?;
        }
        
        _ => {
            return Err(js_err(&format!("Unsupported data type for buffer extraction: {:?}", array.data_type())));
        }
    }
    
    Ok(obj.into())
}

/// Format Date32 (days since epoch) to YYYY-MM-DD string
#[allow(dead_code)]
fn format_date32(days: i32) -> String {
    const SECONDS_PER_DAY: i64 = 86400;
    let seconds = days as i64 * SECONDS_PER_DAY;
    format_unix_timestamp(seconds)
}

/// Format Date64 (milliseconds since epoch) to YYYY-MM-DD string
#[allow(dead_code)]
fn format_date64(millis: i64) -> String {
    let seconds = millis / 1000;
    format_unix_timestamp(seconds)
}

/// Format Timestamp (milliseconds since epoch) to YYYY-MM-DD HH:MM:SS string
#[allow(dead_code)]
fn format_timestamp(millis: i64) -> String {
    let seconds = millis / 1000;
    let remaining_millis = millis % 1000;
    
    let (year, month, day, hour, minute, second) = seconds_to_datetime(seconds);
    
    if hour == 0 && minute == 0 && second == 0 && remaining_millis == 0 {
        format!("{:04}-{:02}-{:02}", year, month, day)
    } else {
        format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, hour, minute, second)
    }
}

/// Format Unix timestamp (seconds since epoch) to YYYY-MM-DD string
#[allow(dead_code)]
fn format_unix_timestamp(seconds: i64) -> String {
    let (year, month, day, _, _, _) = seconds_to_datetime(seconds);
    format!("{:04}-{:02}-{:02}", year, month, day)
}

/// Convert Unix timestamp to (year, month, day, hour, minute, second)
#[allow(dead_code)]
fn seconds_to_datetime(mut seconds: i64) -> (i32, u32, u32, u32, u32, u32) {
    const SECONDS_PER_DAY: i64 = 86400;
    const SECONDS_PER_HOUR: i64 = 3600;
    const SECONDS_PER_MINUTE: i64 = 60;
    
    // Handle negative timestamps (before epoch)
    let negative = seconds < 0;
    if negative {
        seconds = seconds.abs();
    }
    
    // Extract time components
    let days = seconds / SECONDS_PER_DAY;
    let remaining = seconds % SECONDS_PER_DAY;
    let hour = (remaining / SECONDS_PER_HOUR) as u32;
    let minute = ((remaining % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE) as u32;
    let second = (remaining % SECONDS_PER_MINUTE) as u32;
    
    // Convert days to calendar date (simplified algorithm)
    let mut year = 1970;
    let mut day_count = if negative { -days } else { days };
    
    if negative {
        // Go backwards from 1970
        while day_count < 0 {
            year -= 1;
            let days_in_year = if is_leap_year(year) { 366 } else { 365 };
            day_count += days_in_year;
        }
    } else {
        // Go forwards from 1970
        loop {
            let days_in_year = if is_leap_year(year) { 366 } else { 365 };
            if day_count < days_in_year {
                break;
            }
            day_count -= days_in_year;
            year += 1;
        }
    }
    
    // Convert day of year to month and day
    let (month, day) = day_of_year_to_month_day(day_count as u32, is_leap_year(year));
    
    (year as i32, month, day, hour, minute, second)
}

/// Check if a year is a leap year
#[allow(dead_code)]
fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Convert day of year to (month, day)
#[allow(dead_code)]
fn day_of_year_to_month_day(day_of_year: u32, is_leap: bool) -> (u32, u32) {
    let days_in_month = if is_leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    
    let mut remaining = day_of_year;
    for (month_idx, &days) in days_in_month.iter().enumerate() {
        if remaining < days {
            return ((month_idx + 1) as u32, remaining + 1);
        }
        remaining -= days;
    }
    
    // Should not reach here, but return December 31 as fallback
    (12, 31)
}
