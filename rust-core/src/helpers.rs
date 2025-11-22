use arrow_array::RecordBatch;
use arrow_ipc::writer::StreamWriter;
use arrow_schema::SchemaRef;
use wasm_bindgen::JsValue;

use crate::error::js_err_arrow;

/// Parse comma-separated column names
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

        Date32 | Date64 => "date",

        Timestamp(_, _) => "datetime",

        List(_) | LargeList(_) | FixedSizeList(_, _) => "list",

        _ => "unknown",
    }
}

/// Encode RecordBatches into Arrow IPC format
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
