import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStore, selectFieldsPaneCollapsed } from '@/store/fieldsStore';
import { FilterComponent } from '@/components/FilterComponent';
import { useState } from 'react';
import { SortPane } from '@/components/SortPane';

export const FilterPane = () => {
    // Use store for all state management

    const isCollapsed = useStore(selectFieldsPaneCollapsed);
    const setIsCollapsed = useStore((state) => state.setFieldsPaneCollapsed);
    const [activeTab, setActiveTab] = useState('filters');

    if (isCollapsed) {
        return (
            <div className="h-full w-12 border-r bg-background flex flex-col items-center py-2">
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="mb-4">
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="[writing-mode:vertical-lr] text-sm font-semibold">Filters & Sorts</div>
            </div>
        );
    }

    return (
        <div className=" flex flex-col border-r bg-background overflow-auto shrink-0" style={{ width: '280px' }}>
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <h3 className="font-semibold">Filters & Sorts</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex border-b">
                <button
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'filters' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActiveTab('filters')}
                >
                    Filters
                </button>
                <button
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
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
