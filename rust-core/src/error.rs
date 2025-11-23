use arrow_schema::ArrowError;
use js_sys::Error as JsError;
use wasm_bindgen::JsValue;

/// A clean "string → JsValue" error builder
pub fn js_err(msg: &str) -> JsValue {
    JsError::new(msg).into()
}

/// ArrowError → JsValue mapper
pub fn js_err_arrow(e: ArrowError) -> JsValue {
    JsError::new(&format!("Arrow Error: {}", e)).into()
}
