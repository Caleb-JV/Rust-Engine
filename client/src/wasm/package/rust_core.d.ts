/* tslint:disable */
/* eslint-disable */
/**
 * Get all timing log entries
 */
export function get_timing_log(): any;
/**
 * Clear the timing log
 */
export function clear_timing_log(): void;
/**
 * Async version of get_data with a structured response envelope
 */
export function get_data_async(query_json: string): Promise<any>;
/**
 * Async WASM export: get meta data with a structured response
 */
export function get_meta_data_async(): Promise<any>;
/**
 * Async WASM export: seed data and return a structured response with timing
 */
export function seed_async(bytes: Uint8Array): Promise<any>;
/**
 * Async version of get_filter_options with a structured response envelope
 */
export function get_filter_options_async(col_name: string): Promise<any>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly clear_timing_log: () => void;
  readonly get_timing_log: () => any;
  readonly get_data_async: (a: number, b: number) => any;
  readonly get_filter_options_async: (a: number, b: number) => any;
  readonly get_meta_data_async: () => any;
  readonly seed_async: (a: number, b: number) => any;
  readonly wasm_bindgen__convert__closures_____invoke__ha5d69b44cd93c456: (a: number, b: number, c: any) => void;
  readonly wasm_bindgen__closure__destroy__hefaf3f048dda7301: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h927080c8d2bb44ba: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
