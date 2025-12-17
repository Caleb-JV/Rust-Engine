use std::collections::HashMap;
use std::sync::Arc;

use arrow_array::{
    Array, BooleanArray, Float64Array, Int64Array, RecordBatch, StringArray,
};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use wasm_bindgen::JsValue;

use smallvec::SmallVec;

use crate::utils::error::js_err;
use crate::types::query_types::{PivotAggregation, PivotSpec};

//
// ======================================================
//  DICTIONARY ENCODER (DuckDB-style)
// ======================================================
//

#[derive(Default)]
struct DictEncoder {
    map: HashMap<String, u32>,
    values: Vec<String>,
}

impl DictEncoder {
    fn encode(&mut self, value: &str) -> u32 {
        if let Some(&id) = self.map.get(value) {
            id
        } else {
            let id = self.values.len() as u32;
            self.map.insert(value.to_string(), id);
            self.values.push(value.to_string());
            id
        }
    }

    fn decode(&self, id: u32) -> &str {
        &self.values[id as usize]
    }
}

//
// ======================================================
//  COMPACT GROUP KEY (NO STRING HASHING)
// ======================================================
//

#[derive(Hash, Eq, PartialEq)]
struct GroupKey {
    keys: SmallVec<[u32; 4]>, // inline for up to 4 row columns
}

//
// ======================================================
//  AGGREGATION STATE (FUSED, SINGLE PASS)
// ======================================================
//

#[derive(Clone)]
struct AggState {
    count: usize,
    sum: f64,
    min: f64,
    max: f64,

    // Welford stddev
    mean: f64,
    m2: f64,

    first: Option<f64>,
    last: Option<f64>,
}

impl AggState {
    fn new() -> Self {
        Self {
            count: 0,
            sum: 0.0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
            mean: 0.0,
            m2: 0.0,
            first: None,
            last: None,
        }
    }

    fn update(&mut self, v: f64) {
        self.count += 1;
        self.sum += v;

        if v < self.min {
            self.min = v;
        }
        if v > self.max {
            self.max = v;
        }

        // Welford
        let delta = v - self.mean;
        self.mean += delta / self.count as f64;
        let delta2 = v - self.mean;
        self.m2 += delta * delta2;

        if self.first.is_none() {
            self.first = Some(v);
        }
        self.last = Some(v);
    }

    fn finalize(&self, agg: &PivotAggregation) -> f64 {
        match agg {
            PivotAggregation::Sum => self.sum,
            PivotAggregation::Average =>
                if self.count == 0 { 0.0 } else { self.sum / self.count as f64 },
            PivotAggregation::Min =>
                if self.count == 0 { 0.0 } else { self.min },
            PivotAggregation::Max =>
                if self.count == 0 { 0.0 } else { self.max },
            PivotAggregation::StdDev =>
                if self.count == 0 { 0.0 } else { (self.m2 / self.count as f64).sqrt() },
            PivotAggregation::First =>
                self.first.unwrap_or(0.0),
            PivotAggregation::Last =>
                self.last.unwrap_or(0.0),
            PivotAggregation::Count =>
                self.count as f64,
        }
    }
}

//
// ======================================================
//  MAIN DUCKDB-STYLE GROUP + AGGREGATE
// ======================================================
//

pub fn group_and_aggregate(
    batch: &RecordBatch,
    pivot_spec: &PivotSpec,
) -> Result<RecordBatch, JsValue> {

    // --------------------------------------------------
    // Resolve row columns
    // --------------------------------------------------
    let row_col_indices: Vec<usize> = pivot_spec
        .rows
        .iter()
        .map(|r| {
            batch.schema()
                .index_of(&r.column)
                .map_err(|_| js_err(&format!("Row column not found: {}", r.column)))
        })
        .collect::<Result<_, _>>()?;

    let row_arrays: Vec<&dyn Array> =
        row_col_indices.iter().map(|&i| batch.column(i).as_ref()).collect();

    let mut encoders: Vec<DictEncoder> =
        (0..row_arrays.len()).map(|_| DictEncoder::default()).collect();

    // --------------------------------------------------
    // Resolve value columns
    // --------------------------------------------------
    let value_columns: Vec<(usize, &PivotAggregation)> = pivot_spec
        .values
        .iter()
        .map(|v| {
            batch.schema()
                .index_of(&v.column)
                .map(|idx| (idx, &v.aggregation))
                .map_err(|_| js_err(&format!("Value column not found: {}", v.column)))
        })
        .collect::<Result<_, _>>()?;

    // --------------------------------------------------
    // GROUP + AGGREGATE (ONE PASS)
    // --------------------------------------------------
    let mut groups: HashMap<GroupKey, Vec<AggState>> = HashMap::new();

    for row in 0..batch.num_rows() {
        let mut key = SmallVec::<[u32; 4]>::new();

        for (array, encoder) in row_arrays.iter().zip(encoders.iter_mut()) {
            let value = get_string_value(*array, row)?;
            key.push(encoder.encode(&value));
        }

        let states = groups
            .entry(GroupKey { keys: key })
            .or_insert_with(|| vec![AggState::new(); value_columns.len()]);

        for (state, (col_idx, _)) in states.iter_mut().zip(value_columns.iter()) {
            let arr = batch.column(*col_idx);

            if arr.is_null(row) {
                continue;
            }

            let v = match arr.data_type() {
                DataType::Int64 =>
                    arr.as_any().downcast_ref::<Int64Array>().unwrap().value(row) as f64,
                DataType::Float64 =>
                    arr.as_any().downcast_ref::<Float64Array>().unwrap().value(row),
                _ => continue,
            };

            state.update(v);
        }
    }

    // --------------------------------------------------
    // SORT GROUPS (STABLE OUTPUT)
    // --------------------------------------------------
    let mut entries: Vec<(GroupKey, Vec<AggState>)> = groups.into_iter().collect();
    entries.sort_by(|(a, _), (b, _)| a.keys.cmp(&b.keys));

    // --------------------------------------------------
    // BUILD OUTPUT COLUMNS
    // --------------------------------------------------
    let mut row_output: Vec<Vec<String>> =
        vec![Vec::with_capacity(entries.len()); pivot_spec.rows.len()];
    let mut value_output: Vec<Vec<f64>> =
        vec![Vec::with_capacity(entries.len()); pivot_spec.values.len()];

    for (key, states) in entries {
        for (i, id) in key.keys.iter().enumerate() {
            row_output[i].push(encoders[i].decode(*id).to_string());
        }

        for (i, state) in states.iter().enumerate() {
            value_output[i].push(
                state.finalize(&pivot_spec.values[i].aggregation)
            );
        }
    }

    // --------------------------------------------------
    // BUILD SCHEMA
    // --------------------------------------------------
    let mut fields = Vec::new();

    for r in &pivot_spec.rows {
        fields.push(Field::new(&r.column, DataType::Utf8, true));
    }

    for v in &pivot_spec.values {
        fields.push(Field::new(
            &format!("{}_{:?}", v.column, v.aggregation),
            DataType::Float64,
            true,
        ));
    }

    let schema: SchemaRef = Arc::new(Schema::new(fields));

    // --------------------------------------------------
    // BUILD RECORD BATCH
    // --------------------------------------------------
    let mut arrays: Vec<Arc<dyn Array>> = Vec::new();

    for col in row_output {
        arrays.push(Arc::new(StringArray::from(col)));
    }

    for col in value_output {
        arrays.push(Arc::new(Float64Array::from(col)));
    }

    RecordBatch::try_new(schema, arrays)
        .map_err(|e| js_err(&format!("Failed to create RecordBatch: {}", e)))
}

//
// ======================================================
//  VALUE → STRING (ONLY FOR DICTIONARY ENCODING)
// ======================================================
//

fn get_string_value(array: &dyn Array, idx: usize) -> Result<String, JsValue> {
    if array.is_null(idx) {
        return Ok("null".to_string());
    }

    match array.data_type() {
        DataType::Utf8 | DataType::LargeUtf8 =>
            Ok(array.as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
                .value(idx)
                .to_string()),

        DataType::Int64 =>
            Ok(array.as_any()
                .downcast_ref::<Int64Array>()
                .unwrap()
                .value(idx)
                .to_string()),

        DataType::Float64 =>
            Ok(array.as_any()
                .downcast_ref::<Float64Array>()
                .unwrap()
                .value(idx)
                .to_string()),

        DataType::Boolean =>
            Ok(array.as_any()
                .downcast_ref::<BooleanArray>()
                .unwrap()
                .value(idx)
                .to_string()),

        dt => Err(js_err(&format!("Unsupported grouping type {:?}", dt))),
    }
}
