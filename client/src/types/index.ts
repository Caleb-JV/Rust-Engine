export type Row = Record<string, string | number | boolean | null>;

export interface TableData {
  rows: Row[];
  columns: string[];
}

export interface MetaData {
  rowCount: number;
  columnCount: number;
  columns: string[];
}

export interface FilterOption {
  column: string;
  values: string[];
}

export interface PivotConfig {
  rows: string[];
  columns: string[];
  values: string[];
  aggregation: "sum" | "count" | "avg" | "min" | "max";
}

export interface FilterConfig {
  column: string;
  operator: "equals" | "contains" | "greater" | "less";
  value: string | number;
}

export type ProcessingStatus = "idle" | "loading" | "processing" | "success" | "error";

export interface AppState {
  tableData: TableData;
  metadata: MetaData | null;
  filterOptions: Map<string, string[]>;
  selectedFile: File | null;
  processingStatus: ProcessingStatus;
  error: string | null;
}
