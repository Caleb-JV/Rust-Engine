import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { IFieldsKeeperBucket } from 'react-fields-keeper';

export interface IColumnField {
    id: string;
    name: string;
    dataType: 'string' | 'number' | 'boolean';
}

export type ActiveTab = 'pivot' | 'filters';

export type ProcessingStatus = 'idle' | 'loading' | 'processing' | 'success' | 'error';

export interface TimingLog {
    operation: string;
    duration_ms: number;
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
    activeTab: ActiveTab;
    isDataPaneCollapsed: boolean;
    isFieldsPaneCollapsed: boolean;

    // Pivot Buckets
    pivotBuckets: IFieldsKeeperBucket<IColumnField>[];

    // Filter Buckets
    filterBuckets: IFieldsKeeperBucket<IColumnField>[];

    // Actions
    setProcessingStatus: (status: ProcessingStatus) => void;
    setTableRowCount: (count: number) => void;
    setFileName: (name: string) => void;
    setError: (error: string | null) => void;
    setActiveTab: (tab: ActiveTab) => void;
    incrementTableRenderCounter: () => void;
    setLatestTiming: (log: TimingLog | null) => void;
    setDataPaneCollapsed: (collapsed: boolean) => void;
    setFieldsPaneCollapsed: (collapsed: boolean) => void;
    setPivotBuckets: (buckets: IFieldsKeeperBucket<IColumnField>[]) => void;
    setFilterBuckets: (buckets: IFieldsKeeperBucket<IColumnField>[]) => void;
    clearPivotBuckets: () => void;
    resetStore: () => void;
}

const initialState = {
    processingStatus: 'idle' as ProcessingStatus,
    error: null,
    activeTab: 'pivot' as ActiveTab,
    isDataPaneCollapsed: false,
    isFieldsPaneCollapsed: false,
    tableRenderCounter: 0,
    latestTiming: null,
    pivotBuckets: [
        { id: 'columns', items: [] },
        { id: 'values', items: [] },
    ],
    filterBuckets: [{ id: 'filters', items: [] }],
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
            setActiveTab: (tab) => set({ activeTab: tab }, false, 'setActiveTab'),

            setDataPaneCollapsed: (collapsed) => set({ isDataPaneCollapsed: collapsed }, false, 'setDataPaneCollapsed'),

            setFieldsPaneCollapsed: (collapsed) => set({ isFieldsPaneCollapsed: collapsed }, false, 'setFieldsPaneCollapsed'),

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
        }),
        { name: 'FieldsStore' },
    ),
);

// Selectors for optimized re-renders
export const selectProcessingStatus = (state: IRootState) => state.processingStatus;
export const selectError = (state: IRootState) => state.error;
export const selectActiveTab = (state: IRootState) => state.activeTab;
export const selectPivotBuckets = (state: IRootState) => state.pivotBuckets;
export const selectFilterBuckets = (state: IRootState) => state.filterBuckets;
export const selectDataPaneCollapsed = (state: IRootState) => state.isDataPaneCollapsed;
export const selectFieldsPaneCollapsed = (state: IRootState) => state.isFieldsPaneCollapsed;
