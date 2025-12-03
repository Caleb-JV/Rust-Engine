use std::sync::Mutex;
use wasm_bindgen::prelude::*;
use once_cell::sync::Lazy;
use js_sys::Date;

// Global timing log storage using Lazy for proper initialization
static TIMING_LOG: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));

/// Simple timing helper for synchronous functions
#[allow(dead_code)]
pub fn timed<F, R>(label: &str, func: F) -> R
where
    F: FnOnce() -> R,
{
    let start = Date::now();
    let result = func();
    let duration = Date::now() - start;
    
    let log_entry = format!("{}: {:.2} ms", label, duration);
    
    if let Ok(mut log) = TIMING_LOG.lock() {
        log.push(log_entry);
    }

    result
}

/// Measure a synchronous function and return both its result and duration in ms.
/// This is useful when the caller needs the numeric duration (e.g. for timeTaken
/// fields) in addition to logging.
pub fn measure<F, R>(func: F) -> (R, f64)
where
    F: FnOnce() -> R,
{
    let start = Date::now();
    let result = func();
    let duration = Date::now() - start;
    (result, duration)
}

/// Simple timing helper for async functions
#[allow(dead_code)]
pub async fn timed_async<F, Fut, R>(label: &str, func: F) -> R
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = R>,
{
    let start = Date::now();
    let result = func().await;
    let duration = Date::now() - start;
    
    let log_entry = format!("{}: {:.2} ms", label, duration);
    
    if let Ok(mut log) = TIMING_LOG.lock() {
        log.push(log_entry);
    }
    
    result
}

/// Get all timing log entries
#[wasm_bindgen]
pub fn get_timing_log() -> JsValue {
    let log = TIMING_LOG.lock().unwrap();
    let entries: Vec<String> = log.clone();
    
    // Convert to JsValue using serde
    serde_wasm_bindgen::to_value(&entries).unwrap_or(JsValue::NULL)
}

/// Clear the timing log
#[wasm_bindgen]
pub fn clear_timing_log() {
    if let Ok(mut log) = TIMING_LOG.lock() {
        log.clear();
    }
}
