import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SortBuilder } from './SortBuilder';
import { dataService, type FilterCondition, type SortSpec } from '../services/dataService';
import { useStore } from '@/store/fieldsStore';

interface FilterBuilderProps {
    onApply?: () => void;
}

export function SortPane({ onApply }: FilterBuilderProps) {
    const [sorts, setSorts] = useState<SortSpec[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortOpen, setSortOpen] = useState(false);
    const filterOptions = useStore.getState().filterCondition;

    const applySorts = async () => {
        setLoading(true);
        setError(null);
        try {
            const query: { sort?: SortSpec[]; filters?: FilterCondition[] } = {};
            if (sorts.length > 0) query.sort = sorts;
            if (filterOptions.length > 0) query.filters = filterOptions;

            dataService.getData(query);
            onApply?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply filters/sorts');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Sort Options */}
            <Collapsible open={sortOpen} onOpenChange={setSortOpen}>
                <CollapsibleTrigger className="w-full">
                    <Button variant="outline" size="sm" className="w-full justify-between" type="button">
                        <span className="text-xs font-semibold">Sort Options {sorts.length > 0 && `(${sorts.length})`}</span>
                        <span className="text-xs">{sortOpen ? '▲' : '▼'}</span>
                    </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="pt-3">
                    <SortBuilder onSort={setSorts} />
                </CollapsibleContent>
            </Collapsible>

            {/* Apply Button */}
            <Button onClick={applySorts} disabled={loading || sorts.length === 0} className="w-full">
                {loading ? (
                    'Applying...'
                ) : (
                    <>
                        <Play className="h-4 w-4 mr-2" /> Apply Sort
                    </>
                )}
            </Button>

            {/* Error */}
            {error && <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</div>}
        </div>
    );
}
