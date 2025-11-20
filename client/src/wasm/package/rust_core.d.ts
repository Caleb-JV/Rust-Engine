/* tslint:disable */
/* eslint-disable */
export function get_data(col_names: string): Uint8Array;
export function aggregate(col_names: string, aggregation_type: string): any;
export function get_meta_data(): any;
/**
 * ------------------------------------------------------------------
 *   CSV → Arrow IPC → store schema + batches
 * ------------------------------------------------------------------
 */
export function seed(bytes: Uint8Array): void;
export function get_filter_options(col_name: string): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly aggregate: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly get_data: (a: number, b: number) => [number, number, number, number];
  readonly get_filter_options: (a: number, b: number) => [number, number, number];
  readonly get_meta_data: () => [number, number, number];
  readonly seed: (a: number, b: number) => [number, number];
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
