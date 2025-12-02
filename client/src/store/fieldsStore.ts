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

    /**
     * table gets rerendered only when this value changes
     */
    tableRenderCounter: number;

    // File Name
    fileName?: string;

    // Timing Logs (only latest operation)
    latestTiming: TimingLog | null;

    // UI State
    panelState: {
        activeTab: ActiveTab;
        isDataPaneCollapsed: boolean;
        isFiltersPaneCollapsed: boolean;
        isPivotPaneCollapsed: boolean;
    };

    // Pivot Buckets
    pivotBuckets: IFieldsKeeperBucket<IColumnField>[];

    // Filter Buckets
    filterBuckets: IFieldsKeeperBucket<IColumnField>[];

    // Filter condition
    filterCondition: FilterCondition[];

    // Actions
    setProcessingStatus: (status: ProcessingStatus) => void;
    setTableRowCount: (count: number) => void;
    setFileName: (name: string) => void;
    setError: (error: string | null) => void;
    setActiveTab: (tab: ActiveTab) => void;
    incrementTableRenderCounter: () => void;
    setLatestTiming: (log: TimingLog | null) => void;
    setDataPaneCollapsed: (collapsed: boolean) => void;
    setFiltersPaneCollapsed: (collapsed: boolean) => void;
    setPivotPaneCollapsed: (collapsed: boolean) => void;
    setPivotBuckets: (buckets: IFieldsKeeperBucket<IColumnField>[]) => void;
    setFilterBuckets: (buckets: IFieldsKeeperBucket<IColumnField>[]) => void;
    clearPivotBuckets: () => void;
    resetStore: () => void;
    addOrUpdateFilterCondition: ({ column, operator, value }: FilterCondition) => void;
    removeFilterCondition: (column: string) => void;
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
    pivotBuckets: [
        { id: 'columns', items: [] },
        { id: 'values', items: [] },
    ],
    filterBuckets: [{ id: 'filters', items: [] }],
    filterCondition: [] as FilterCondition[],
};

export const useStore = create<IRootState>()(
    devtools(
        (set) => ({
            ...initialState,

            // App Status Actions
            setProcessingStatus: (status) => set({ processingStatus: status }, false, 'setProcessingStatus'),

            setTableRowCount: (count) => set({ tableRowCount: count }, false, 'setTableRowCount'),

            setFileName: (name) => set({ fileName: name }, false, 'setFileName'),

            setError: (error) => set({ error }, false, 'setError'),

            incrementTableRenderCounter: () =>
                set((state) => ({ tableRenderCounter: state.tableRenderCounter + 1 }), false, 'incrementTableRenderCounter'),

            // Timing Actions
            setLatestTiming: (log) => set({ latestTiming: log }, false, 'setLatestTiming'),

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

            // Filter Actions
            setFilterBuckets: (buckets) => set({ filterBuckets: buckets }, false, 'setFilterBuckets'),

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
        }),
        { name: 'FieldsStore' },
    ),
);

// Selectors for optimized re-renders
export const selectProcessingStatus = (state: IRootState) => state.processingStatus;
export const selectError = (state: IRootState) => state.error;
export const selectActiveTab = (state: IRootState) => state.panelState.activeTab;
export const selectPivotBuckets = (state: IRootState) => state.pivotBuckets;
export const selectFilterBuckets = (state: IRootState) => state.filterBuckets;
export const selectDataPaneCollapsed = (state: IRootState) => state.panelState.isDataPaneCollapsed;
export const selectFiltersPaneCollapsed = (state: IRootState) => state.panelState.isFiltersPaneCollapsed;
export const selectPivotPaneCollapsed = (state: IRootState) => state.panelState.isPivotPaneCollapsed;
export const selectFiltercondition = (state: IRootState) => state.filterCondition;
