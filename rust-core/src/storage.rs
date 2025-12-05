use arrow_array::RecordBatch;
use arrow_schema::SchemaRef;
use once_cell::sync::Lazy;
use std::sync::Mutex;

/// Global schema storage
pub static STORED_SCHEMA: Lazy<Mutex<Option<SchemaRef>>> = Lazy::new(|| Mutex::new(None));

/// Global batches storage
pub static STORED_BATCHES: Lazy<Mutex<Option<Vec<RecordBatch>>>> = Lazy::new(|| Mutex::new(None));

/// Calculate approximate memory usage of stored batches in bytes
pub fn get_memory_usage() -> usize {
    let batches_guard = STORED_BATCHES.lock().unwrap();
    
    if let Some(batches) = batches_guard.as_ref() {
        batches.iter().map(|batch| {
            // Calculate memory for each batch
            // Schema overhead (approximate)
            let schema_size = batch.schema().fields().len() * 100; // ~100 bytes per field metadata
            
            // Data arrays
            let columns_size: usize = batch.columns().iter().map(|col| {
                col.get_array_memory_size()
            }).sum();
            
            schema_size + columns_size
        }).sum()
    } else {
        0
    }
}


