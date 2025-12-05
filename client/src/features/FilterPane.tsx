import { useAppStore, selectFiltersPaneCollapsed } from '@/store/appStore';
import { FilterComponent } from '@/components/FilterComponent';
import { useState } from 'react';
import { SortPane } from '@/components/SortPane';
import { CollapsedPaneComponent, PanelHeader } from '@/components/PaneChrome';
import { PANEL_WIDTH } from '@/lib/common.constants';

export const FilterPane = () => {
    // state
    const isCollapsed = useAppStore(selectFiltersPaneCollapsed);
    const [activeTab, setActiveTab] = useState('filters');

    // dispatch
    const setIsCollapsed = useAppStore((state) => state.setFiltersPaneCollapsed);

    // paint
    if (isCollapsed) return <CollapsedPaneComponent label="Filters & Sorts" onExpand={() => setIsCollapsed(false)} />;

    return (
        <div className=" flex flex-col border-r bg-background overflow-auto shrink-0" style={{ width: PANEL_WIDTH }}>
            <PanelHeader title="Filters & Sorts" onCollapse={() => setIsCollapsed(true)} />
            <div className="flex border-b">
                <button
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        activeTab === 'filters' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('filters')}
                >
                    Filters
                </button>
                <button
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        activeTab === 'sorts' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('sorts')}
                >
                    Sorts
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{activeTab === 'filters' ? <FilterComponent /> : <SortPane />}</div>
        </div>
    );
};
