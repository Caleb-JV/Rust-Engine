/**
 * Types matching Rust metadata format from lib.rs
 */

export interface IColumnMeta {
  name: string;
  type: "number" | "text" | "boolean" | "date" | "datetime" | "list" | "unknown";
  nullable: boolean;
}

export interface IGetMetaDataResponse {
  columns: IColumnMeta[];
  column_count: number;
}

/**
 * Convert Rust type to our internal type
 */
export function rustTypeToDataType(rustType: string): "string" | "number" | "boolean" {
  switch (rustType) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "text":
    case "date":
    case "datetime":
    case "list":
    case "unknown":
    default:
      return "string";
  }
}
