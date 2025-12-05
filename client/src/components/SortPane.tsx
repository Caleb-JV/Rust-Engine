import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SortBuilder } from './SortBuilder';
import { dataService } from '../services/dataService';
import { useAppStore } from '../store/appStore';

export function SortPane() {
    const sorts = useAppStore((state) => state.sortOptions);

    const applySorts = async () => {
        dataService.getData();
    };

    return (
        <div className="space-y-4">
            {/* Sort Options */}
            <SortBuilder sorts={sorts} />

            {/* Apply Button */}
            <Button onClick={applySorts} disabled={sorts.length === 0} className="w-full">
                <Play className="h-4 w-4 mr-2" /> Apply Sort
            </Button>
        </div>
    );
}
