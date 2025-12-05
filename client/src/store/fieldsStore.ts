import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { IFieldsKeeperBucket } from 'react-fields-keeper';
import type { TAggregationType } from '../services/dataService';

export interface IColumnField {
    id: string;
    name: string;
    dataType: 'string' | 'number' | 'boolean';
    aggregate?: TAggregationType;
}

export interface IAdditionalOptions {
    showSubtotal: boolean;
    multithreading: boolean;
}

export interface IUIOptions {
    formatValues: boolean;
}

export type ActiveTab = 'sorts' | 'filters';

export type ProcessingStatus = 'idle' | 'loading' | 'processing' | 'success' | 'error';

export interface TimingLog {
    operation: string;
    duration_ms: number;
}

export interface FilterCondition {
    column: string;
    operator:
        | 'equals'
        | 'notequals'
        | 'greaterthan'
        | 'lessthan'
        | 'greaterthanorequal'
        | 'lessthanorequal'
        | 'contains'
        | 'notcontains'
        | 'in'
        | 'notin'
        | 'between';
    value: string | number | boolean | string[] | { min: number; max: number };
}

interface IRootState {
    // App Status
    processingStatus: ProcessingStatus;
    error: string | null;
    tableRowCount?: number;
    tableColumnCount?: number;

    /**
     * table gets rerendered only when this value changes
     */
    tableRenderCounter: number;

    // File Name
    fileName?: string;

    // Timing Logs (only latest operation)
    latestTiming: TimingLog | null;

    // Memory Usage
    memoryUsageBytes: number;

    // UI State
    panelState: {
        activeTab: ActiveTab;
        isDataPaneCollapsed: boolean;
        isFiltersPaneCollapsed: boolean;
        isPivotPaneCollapsed: boolean;
    };

    // Pivot Buckets
    pivotBuckets: IFieldsKeeperBucket<IColumnField>[];

    // Filter condition
    filterCondition: FilterCondition[];

    // Additional UI / computation options
    additionalOptions: IAdditionalOptions;

    // Additional UI / computation options
    uiOptions: IUIOptions;

    // Actions
    setProcessingStatus: (status: ProcessingStatus) => void;
    setTableRowCount: (count: number) => void;
    setTableColumnCount: (count: number) => void;
    setFileName: (name: string) => void;
    setError: (error: string | null) => void;
    setActiveTab: (tab: ActiveTab) => void;
    incrementTableRenderCounter: () => void;
    setLatestTiming: (log: TimingLog | null) => void;
    setMemoryUsage: (bytes: number) => void;
    setDataPaneCollapsed: (collapsed: boolean) => void;
    setFiltersPaneCollapsed: (collapsed: boolean) => void;
    setPivotPaneCollapsed: (collapsed: boolean) => void;
    setPivotBuckets: (buckets: IFieldsKeeperBucket<IColumnField>[]) => void;
    clearPivotBuckets: () => void;
    clearAllAssignments: () => void;
    resetStore: () => void;
    addOrUpdateFilterCondition: ({ column, operator, value }: FilterCondition) => void;
    removeFilterCondition: (column: string) => void;
    removeAllFilters: () => void;
    setAdditionalOptions: (options: Partial<IAdditionalOptions>) => void;
    setUIOptions: (options: Partial<IUIOptions>) => void;
    loadingProgress: number;
    setLoadingProgress: (p: number) => void;
}

const initialState = {
    processingStatus: 'idle' as ProcessingStatus,
    error: null,
    panelState: {
        activeTab: 'filters' as ActiveTab,
        isDataPaneCollapsed: false,
        isFiltersPaneCollapsed: true,
        isPivotPaneCollapsed: true,
    },
    tableRenderCounter: 0,
    latestTiming: null,
    memoryUsageBytes: 0,
    pivotBuckets: [
        { id: 'columns', items: [] },
        { id: 'values', items: [] },
    ],
    filterBuckets: [{ id: 'filters', items: [] }],
    filterCondition: [] as FilterCondition[],
    sortConditions: {
        column: [],
        direction: 'asc',
    },
    additionalOptions: {
        showSubtotal: true,
        multithreading: false,
    } as IAdditionalOptions,
    uiOptions: {
        formatValues: true,
    } as IUIOptions,
    loadingProgress: 0,
};

export const useStore = create<IRootState>()(
    devtools(
        (set) => ({
            ...initialState,

            // App Status Actions
            setProcessingStatus: (status) => set({ processingStatus: status }, false, 'setProcessingStatus'),
            setLoadingProgress: (p) => set({ loadingProgress: p }),
            setTableRowCount: (count) => set({ tableRowCount: count }, false, 'setTableRowCount'),

            setTableColumnCount: (count) => set({ tableColumnCount: count }, false, 'setTableColumnCount'),

            setFileName: (name) => set({ fileName: name }, false, 'setFileName'),

            setError: (error) => set({ error }, false, 'setError'),

            incrementTableRenderCounter: () =>
                set((state) => ({ tableRenderCounter: state.tableRenderCounter + 1 }), false, 'incrementTableRenderCounter'),

            // Timing Actions
            setLatestTiming: (log) => set({ latestTiming: log }, false, 'setLatestTiming'),

            // Memory Actions
            setMemoryUsage: (bytes) => set({ memoryUsageBytes: bytes }, false, 'setMemoryUsage'),

            // UI Actions
            setActiveTab: (tab) =>
                set(
                    (state) => ({
                        panelState: { ...state.panelState, activeTab: tab },
                    }),
                    false,
                    'setActiveTab',
                ),

            setDataPaneCollapsed: (collapsed: boolean) =>
                set(
                    (state) => ({
                        panelState: { ...state.panelState, isDataPaneCollapsed: collapsed },
                    }),
                    false,
                    'setDataPaneCollapsed',
                ),

            setFiltersPaneCollapsed: (collapsed: boolean) =>
                set(
                    (state) => ({
                        panelState: { ...state.panelState, isFiltersPaneCollapsed: collapsed },
                    }),
                    false,
                    'setFiltersPaneCollapsed',
                ),

            setPivotPaneCollapsed: (collapsed: boolean) =>
                set(
                    (state) => ({
                        panelState: { ...state.panelState, isPivotPaneCollapsed: collapsed },
                    }),
                    false,
                    'setPivotPaneCollapsed',
                ),

            // Pivot Actions
            setPivotBuckets: (buckets) => set({ pivotBuckets: buckets }, false, 'setPivotBuckets'),

            clearAllAssignments: () =>
                set(
                    {
                        pivotBuckets: initialState.pivotBuckets.map((b) => ({
                            ...b,
                            items: [],
                        })),
                        filterCondition: [],
                        error: null,
                    },
                    false,
                    'clearAllAssignments',
                ),

            clearPivotBuckets: () =>
                set(
                    {
                        pivotBuckets: initialState.pivotBuckets.map((b) => ({
                            ...b,
                            items: [],
                        })),
                    },
                    false,
                    'clearPivotBuckets',
                ),

            // Reset
            resetStore: () => set(initialState, false, 'resetStore'),

            // Filter Condition Actions
            addOrUpdateFilterCondition: ({ column, operator, value }: FilterCondition) =>
                set(
                    (state) => {
                        const exists = state.filterCondition.find((f) => f.column === column);

                        if (exists) {
                            return {
                                filterCondition: state.filterCondition.map((f) =>
                                    f.column === column
                                        ? { ...f, operator, value } // <--- Updated
                                        : f,
                                ),
                            };
                        }

                        return {
                            filterCondition: [...state.filterCondition, { column, operator, value }],
                        };
                    },
                    false,
                    'addOrUpdateFilterCondition',
                ),
            removeFilterCondition: (column) =>
                set(
                    (state) => ({
                        filterCondition: state.filterCondition.filter((f) => f.column !== column),
                    }),
                    false,
                    'removeFilterCondition',
                ),

            removeAllFilters: () => set(() => ({ filterCondition: [] }), false, 'removeAllFilters'),

            setAdditionalOptions: (options) =>
                set((state) => ({ additionalOptions: { ...state.additionalOptions, ...options } }), false, 'setAdditionalOptions'),

            setUIOptions: (options) => set((state) => ({ uiOptions: { ...state.uiOptions, ...options } }), false, 'setUIOptions'),
        }),
        { name: 'FieldsStore' },
    ),
);

// Selectors for optimized re-renders
export const selectProcessingStatus = (state: IRootState) => state.processingStatus;
export const selectError = (state: IRootState) => state.error;
export const selectActiveTab = (state: IRootState) => state.panelState.activeTab;
export const selectPivotBuckets = (state: IRootState) => state.pivotBuckets;
export const selectDataPaneCollapsed = (state: IRootState) => state.panelState.isDataPaneCollapsed;
export const selectFiltersPaneCollapsed = (state: IRootState) => state.panelState.isFiltersPaneCollapsed;
export const selectPivotPaneCollapsed = (state: IRootState) => state.panelState.isPivotPaneCollapsed;
export const selectFiltercondition = (state: IRootState) => state.filterCondition;
export const selectLoadingProgress = (state: IRootState) => state.loadingProgress;
export const selectAdditionalOptions = (state: IRootState) => state.additionalOptions;
export const selectUIOptions = (state: IRootState) => state.uiOptions;
