use serde::{Deserialize, Serialize};

/// Filter operator types
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FilterOperator {
    Equals,
    NotEquals,
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    Contains,
    NotContains,
    In,
    NotIn,
    Between,
}

/// Filter condition for a column
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FilterCondition {
    pub column: String,
    pub operator: FilterOperator,
    pub value: FilterValue,
}

/// Filter value types
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum FilterValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Array(Vec<String>),
    Range { min: f64, max: f64 },
}

/// Sort direction
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

/// Sort specification for a column
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SortSpec {
    pub column: String,
    pub direction: SortDirection,
}

/// Aggregation function for pivot
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PivotAggregation {
    Sum,
    Average,
    Count,
    Min,
    Max,
}

/// Pivot specification
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PivotSpec {
    pub rows: Vec<String>,
    pub columns: Option<Vec<String>>,
    pub values: Vec<PivotValue>,
}

/// Pivot value with aggregation
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PivotValue {
    pub column: String,
    pub aggregation: PivotAggregation,
}

/// Complete query specification
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DataQuery {
    pub columns: Option<Vec<String>>,
    pub filters: Option<Vec<FilterCondition>>,
    pub sort: Option<Vec<SortSpec>>,
    pub pivot: Option<PivotSpec>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}
