use arrow_array::RecordBatch;
use arrow_schema::SchemaRef;
use once_cell::sync::Lazy;
use std::sync::Mutex;

/// Global schema storage
pub static STORED_SCHEMA: Lazy<Mutex<Option<SchemaRef>>> = Lazy::new(|| Mutex::new(None));

/// Global batches storage
pub static STORED_BATCHES: Lazy<Mutex<Option<Vec<RecordBatch>>>> = Lazy::new(|| Mutex::new(None));

/// Cached IPC encoding for fast retrieval without operations
pub static CACHED_IPC: Lazy<Mutex<Option<Vec<u8>>>> = Lazy::new(|| Mutex::new(None));
