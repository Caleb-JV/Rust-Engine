use arrow_array::{
    ArrayRef, Float64Array, Int64Array, RecordBatch, StringArray, BooleanArray,
};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use std::sync::Arc;
use wasm_bindgen::prelude::*;

/// Simple pseudo-random number generator (LCG)
/// Using parameters from Numerical Recipes
struct SimpleRng {
    state: u64,
}

impl SimpleRng {
    fn new(seed: u64) -> Self {
        Self {
            state: seed.wrapping_add(1),
        }
    }

    fn next(&mut self) -> u64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        self.state
    }

    fn next_f64(&mut self) -> f64 {
        (self.next() >> 11) as f64 / ((1u64 << 53) as f64)
    }

    fn next_range(&mut self, min: i64, max: i64) -> i64 {
        min + (self.next_f64() * (max - min) as f64) as i64
    }

    fn next_u32(&mut self, max: u32) -> u32 {
        (self.next_f64() * max as f64) as u32
    }
}

/// Generate realistic sample data with 5 million rows
/// 
/// Schema:
/// - id: Integer (1 to row_count)
/// - customer_name: String (realistic names)
/// - region: String (North, South, East, West, Central)
/// - product_category: String (Electronics, Clothing, Food, Furniture, Books, Toys, Sports, Health)
/// - product_name: String (combinations of category-specific items)
/// - quantity: Integer (1 to 100)
/// - unit_price: Float (10.0 to 999.99)
/// - total_amount: Float (quantity * unit_price)
/// - discount_percent: Float (0, 5, 10, 15, 20, 25)
/// - payment_method: String (Credit Card, Debit Card, Cash, PayPal, Crypto)
/// - is_premium_customer: Boolean
/// - satisfaction_score: Integer (1 to 5)
/// - year: Integer (2020-2024)
/// - quarter: String (Q1, Q2, Q3, Q4)
/// - month: String (Jan-Dec)
#[wasm_bindgen]
pub fn generate_sample_data(row_count: usize, seed: u64) -> Result<JsValue, JsValue> {
    let batch = generate_sample_batch(row_count, seed)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate data: {}", e)))?;

    // Convert to IPC format for return
    let mut buffer = Vec::new();
    {
        let mut writer = arrow_ipc::writer::FileWriter::try_new(&mut buffer, &batch.schema())
            .map_err(|e| JsValue::from_str(&format!("Failed to create IPC writer: {}", e)))?;
        
        writer
            .write(&batch)
            .map_err(|e| JsValue::from_str(&format!("Failed to write batch: {}", e)))?;
        
        writer
            .finish()
            .map_err(|e| JsValue::from_str(&format!("Failed to finish IPC: {}", e)))?;
    }

    Ok(serde_wasm_bindgen::to_value(&buffer).unwrap())
}

pub(crate) fn generate_sample_batch(row_count: usize, seed: u64) -> Result<RecordBatch, String> {
    let mut rng = SimpleRng::new(seed);

    // Pre-defined realistic data
    let first_names = vec![
        "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
        "William", "Barbara", "David", "Elizabeth", "Richard", "Susan", "Joseph", "Jessica",
        "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
        "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
        "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    ];

    let last_names = vec![
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
        "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
        "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
        "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
        "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    ];

    let regions = vec!["North", "South", "East", "West", "Central"];

    let categories = vec![
        "Electronics", "Clothing", "Food", "Furniture", "Books", "Toys", "Sports", "Health",
    ];

    let products_by_category = vec![
        vec!["Laptop", "Smartphone", "Tablet", "Headphones", "Camera", "Smartwatch", "TV", "Speaker"],
        vec!["T-Shirt", "Jeans", "Dress", "Jacket", "Shoes", "Hat", "Sweater", "Socks"],
        vec!["Coffee", "Tea", "Snacks", "Pasta", "Rice", "Vegetables", "Fruits", "Bread"],
        vec!["Chair", "Table", "Sofa", "Bed", "Desk", "Cabinet", "Shelf", "Lamp"],
        vec!["Novel", "Textbook", "Magazine", "Comic", "Dictionary", "Cookbook", "Biography", "Atlas"],
        vec!["Doll", "Puzzle", "Board Game", "Action Figure", "Lego", "Car", "Ball", "Robot"],
        vec!["Basketball", "Football", "Tennis Racket", "Yoga Mat", "Dumbbell", "Bicycle", "Skateboard", "Golf Club"],
        vec!["Vitamins", "Supplements", "First Aid", "Skincare", "Toothpaste", "Shampoo", "Soap", "Lotion"],
    ];

    let payment_methods = vec!["Credit Card", "Debit Card", "Cash", "PayPal", "Crypto"];

    let discount_options = vec![0.0, 5.0, 10.0, 15.0, 20.0, 25.0];

    let quarters = vec!["Q1", "Q2", "Q3", "Q4"];

    let months = vec![
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    // Build arrays
    let mut ids = Vec::with_capacity(row_count);
    let mut customer_names = Vec::with_capacity(row_count);
    let mut region_values = Vec::with_capacity(row_count);
    let mut category_values = Vec::with_capacity(row_count);
    let mut product_names = Vec::with_capacity(row_count);
    let mut quantities = Vec::with_capacity(row_count);
    let mut unit_prices = Vec::with_capacity(row_count);
    let mut total_amounts = Vec::with_capacity(row_count);
    let mut discount_percents = Vec::with_capacity(row_count);
    let mut payment_method_values = Vec::with_capacity(row_count);
    let mut is_premium = Vec::with_capacity(row_count);
    let mut satisfaction_scores = Vec::with_capacity(row_count);
    let mut years = Vec::with_capacity(row_count);
    let mut quarter_values = Vec::with_capacity(row_count);
    let mut month_values = Vec::with_capacity(row_count);

    for i in 0..row_count {
        // ID
        ids.push((i + 1) as i64);

        // Customer name
        let first_name = first_names[rng.next_u32(first_names.len() as u32) as usize];
        let last_name = last_names[rng.next_u32(last_names.len() as u32) as usize];
        customer_names.push(format!("{} {}", first_name, last_name));

        // Region
        let region = regions[rng.next_u32(regions.len() as u32) as usize];
        region_values.push(region.to_string());

        // Category and Product
        let category_idx = rng.next_u32(categories.len() as u32) as usize;
        let category = categories[category_idx];
        category_values.push(category.to_string());

        let product_list = &products_by_category[category_idx];
        let product = product_list[rng.next_u32(product_list.len() as u32) as usize];
        product_names.push(product.to_string());

        // Quantity (1-100)
        let quantity = rng.next_range(1, 101);
        quantities.push(quantity);

        // Unit price (10.0 - 999.99)
        let unit_price = 10.0 + rng.next_f64() * 989.99;
        unit_prices.push(unit_price);

        // Total amount
        let total = (quantity as f64) * unit_price;
        total_amounts.push(total);

        // Discount
        let discount = discount_options[rng.next_u32(discount_options.len() as u32) as usize];
        discount_percents.push(discount);

        // Payment method
        let payment = payment_methods[rng.next_u32(payment_methods.len() as u32) as usize];
        payment_method_values.push(payment.to_string());

        // Premium customer (30% chance)
        let premium = rng.next_f64() < 0.3;
        is_premium.push(premium);

        // Satisfaction score (1-5, weighted towards higher)
        let satisfaction = if rng.next_f64() < 0.6 {
            rng.next_range(4, 6) // 60% chance of 4-5
        } else {
            rng.next_range(1, 4) // 40% chance of 1-3
        };
        satisfaction_scores.push(satisfaction);

        // Year (2020-2024)
        let year = rng.next_range(2020, 2025);
        years.push(year);

        // Quarter
        let quarter = quarters[rng.next_u32(quarters.len() as u32) as usize];
        quarter_values.push(quarter.to_string());

        // Month
        let month = months[rng.next_u32(months.len() as u32) as usize];
        month_values.push(month.to_string());
    }

    // Create Arrow arrays
    let id_array: ArrayRef = Arc::new(Int64Array::from(ids));
    let customer_name_array: ArrayRef = Arc::new(StringArray::from(customer_names));
    let region_array: ArrayRef = Arc::new(StringArray::from(region_values));
    let category_array: ArrayRef = Arc::new(StringArray::from(category_values));
    let product_array: ArrayRef = Arc::new(StringArray::from(product_names));
    let quantity_array: ArrayRef = Arc::new(Int64Array::from(quantities));
    let unit_price_array: ArrayRef = Arc::new(Float64Array::from(unit_prices));
    let total_amount_array: ArrayRef = Arc::new(Float64Array::from(total_amounts));
    let discount_array: ArrayRef = Arc::new(Float64Array::from(discount_percents));
    let payment_array: ArrayRef = Arc::new(StringArray::from(payment_method_values));
    let premium_array: ArrayRef = Arc::new(BooleanArray::from(is_premium));
    let satisfaction_array: ArrayRef = Arc::new(Int64Array::from(satisfaction_scores));
    let year_array: ArrayRef = Arc::new(Int64Array::from(years));
    let quarter_array: ArrayRef = Arc::new(StringArray::from(quarter_values));
    let month_array: ArrayRef = Arc::new(StringArray::from(month_values));

    // Define schema
    let schema = Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("customer_name", DataType::Utf8, false),
        Field::new("region", DataType::Utf8, false),
        Field::new("product_category", DataType::Utf8, false),
        Field::new("product_name", DataType::Utf8, false),
        Field::new("quantity", DataType::Int64, false),
        Field::new("unit_price", DataType::Float64, false),
        Field::new("total_amount", DataType::Float64, false),
        Field::new("discount_percent", DataType::Float64, false),
        Field::new("payment_method", DataType::Utf8, false),
        Field::new("is_premium_customer", DataType::Boolean, false),
        Field::new("satisfaction_score", DataType::Int64, false),
        Field::new("year", DataType::Int64, false),
        Field::new("quarter", DataType::Utf8, false),
        Field::new("month", DataType::Utf8, false),
    ]);

    let schema_ref: SchemaRef = Arc::new(schema);

    // Create record batch
    let batch = RecordBatch::try_new(
        schema_ref,
        vec![
            id_array,
            customer_name_array,
            region_array,
            category_array,
            product_array,
            quantity_array,
            unit_price_array,
            total_amount_array,
            discount_array,
            payment_array,
            premium_array,
            satisfaction_array,
            year_array,
            quarter_array,
            month_array,
        ],
    )
    .map_err(|e| format!("Failed to create record batch: {}", e))?;

    Ok(batch)
}
