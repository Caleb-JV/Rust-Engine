# Rust Core Data Query API

## Overview

The Rust Core module has been refactored with advanced data querying capabilities including filtering, sorting, pivoting, and async support.

## New Module Structure

```
src/
├── lib.rs              # Main WASM bindings
├── error.rs            # Error handling utilities
├── storage.rs          # Global state management
├── types.rs            # Type definitions
├── query_types.rs      # Query specification types
├── helpers.rs          # Helper functions
├── filters.rs          # Filtering operations
├── sorting.rs          # Sorting operations
├── pivot.rs            # Pivot/grouping operations
├── operations.rs       # Aggregation operations
└── utils.rs            # Mathematical utilities
```

## API Functions

### Core Functions

#### `seed(bytes: &[u8]) -> Result<(), JsValue>`

Load CSV data into Arrow format and store globally.

#### `get_meta_data() -> Result<JsValue, JsValue>`

Get schema metadata including column names, types, and nullability.

#### `get_data(col_names: &str) -> Result<Vec<u8>, JsValue>`

Get data with simple column projection (comma-separated column names).

### Advanced Query Function

#### `get_data_advanced(query_json: &str) -> Result<Vec<u8>, JsValue>`

Execute advanced queries with filters, sorting, pivoting, and pagination.

**Query JSON Schema:**

```json
{
    "columns": ["col1", "col2"], // Optional: columns to select
    "filters": [
        // Optional: filter conditions
        {
            "column": "age",
            "operator": "greaterthan",
            "value": 25
        }
    ],
    "sort": [
        // Optional: sort specifications
        {
            "column": "name",
            "direction": "asc"
        }
    ],
    "pivot": {
        // Optional: pivot/grouping
        "rows": ["category"],
        "values": [
            {
                "column": "amount",
                "aggregation": "sum"
            }
        ]
    },
    "limit": 100, // Optional: max rows
    "offset": 0 // Optional: skip rows
}
```

### Filter Operators

- `equals` - Exact match
- `notequals` - Not equal
- `greaterthan` - Greater than (numeric)
- `lessthan` - Less than (numeric)
- `greaterthanorequal` - Greater than or equal (numeric)
- `lessthanorequal` - Less than or equal (numeric)
- `contains` - String contains
- `notcontains` - String does not contain
- `in` - Value in array
- `notin` - Value not in array
- `between` - Numeric range

### Filter Value Types

```typescript
type FilterValue =
    | string // For string operations
    | number // For numeric operations
    | boolean // For boolean operations
    | string[] // For 'in'/'notin' operations
    | { min: number; max: number }; // For 'between' operation
```

### Sort Directions

- `asc` - Ascending order
- `desc` - Descending order

### Pivot Aggregations

- `sum` - Sum of values
- `average` - Average of values
- `count` - Count of values
- `min` - Minimum value
- `max` - Maximum value

### Aggregation Functions

#### `aggregate(col_names: &str, aggregation_type: &str) -> Result<JsValue, JsValue>`

Perform aggregation on a single column.

**Supported aggregations:** `sum`, `average`, `count`, `min`, `max`

#### `get_filter_options(col_name: &str) -> Result<JsValue, JsValue>`

#### `get_processed_data(data: String,pivot:String,aggregationMap:String) -> Result<JsValue, JsValue>`

Get available filter options for a column:

- Text columns: unique values
- Numeric columns: min/max range
- Boolean columns: available values
- Date columns: min/max range

## Async Functions

All main functions have async variants that return JavaScript Promises:

#### `get_data_advanced_async(query_json: String) -> Promise`

Async version of `get_data_advanced`.

#### `aggregate_async(col_names: String, aggregation_type: String) -> Promise`

Async version of `aggregate`.

#### `get_filter_options_async(col_name: String) -> Promise`

Async version of `get_filter_options`.

#### `get_processed_data_async(data: String,pivot:String,aggregationMap:String) -> Promise`

Async version of `get_processed_data`.

## Example Usage

### Basic Query with Filters

```javascript
const query = {
    columns: ['name', 'age', 'city'],
    filters: [
        {
            column: 'age',
            operator: 'greaterthan',
            value: 25,
        },
        {
            column: 'city',
            operator: 'in',
            value: ['New York', 'Los Angeles'],
        },
    ],
    sort: [
        {
            column: 'age',
            direction: 'desc',
        },
    ],
    limit: 50,
};

const result = await get_data_advanced_async(JSON.stringify(query));
```

### Pivot/Grouping Query

```javascript
const pivotQuery = {
    pivot: {
        rows: ['category', 'region'],
        values: [
            {
                column: 'sales',
                aggregation: 'sum',
            },
            {
                column: 'quantity',
                aggregation: 'average',
            },
        ],
    },
};

const pivotResult = await get_data_advanced_async(JSON.stringify(pivotQuery));
```

### Complex Query

```javascript
const complexQuery = {
    columns: ['product', 'total_sales'],
    filters: [
        {
            column: 'date',
            operator: 'between',
            value: { min: 1640995200, max: 1672531199 },
        },
        {
            column: 'status',
            operator: 'equals',
            value: 'completed',
        },
    ],
    sort: [
        {
            column: 'total_sales',
            direction: 'desc',
        },
    ],
    limit: 10,
};

const topProducts = await get_data_advanced_async(JSON.stringify(complexQuery));
```

## Performance Notes

- **Filtering**: Applied first to reduce data size early
- **Pivoting**: Combines all batches for grouping
- **Sorting**: Requires combining all batches (most expensive operation)
- **Column Projection**: Applied after other operations for efficiency
- **Limit/Offset**: Applied last for pagination

## Data Types Supported

- **Text**: `Utf8`, `LargeUtf8`
- **Numbers**: `Int64`, `Float64`
- **Boolean**: `Boolean`
- **Dates**: `Date32`, `Date64`, `Timestamp`

## Error Handling

All functions return `Result` types. Errors include:

- Schema/batch not loaded
- Invalid column names
- Unsupported data types for operations
- Invalid query JSON
- Type mismatches in filter values

## Building

```bash
cargo build --release --target wasm32-unknown-unknown
```

## Dependencies

- `arrow` family: Core data structures
- `serde`: JSON serialization
- `wasm-bindgen`: JavaScript bindings
- `wasm-bindgen-futures`: Async support
