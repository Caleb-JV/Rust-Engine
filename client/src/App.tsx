import { MainHeader } from './features/MainHeader';
import { DataPane } from './features/DataPane';
import { PivotPane } from './features/PivotPane';
import { TableView } from './features/TableView';
import { ProcessingIndicator } from './components/ProcessingIndicator';
import { useStore, selectError } from './store/fieldsStore';
import './features/fields-keeper-custom.css';
import DataProvider from './features/DataProvider';
import { FilterPane } from './features/FilterPane';

const App: React.FC = () => {
    // Store selectors
    const error = useStore(selectError);

    return (
        <div className="min-h-screen bg-background grid grid-rows-[auto_1fr]">
            <MainHeader />

            {error && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-4">
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive shadow-lg">
                        <p className="font-semibold">Error:</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}

            <DataProvider>
                <DataPane />
                <PivotPane />
                <FilterPane />
                <TableView />
            </DataProvider>

            {/* Smooth rotating loader - demonstrates no UI freezes */}
            <ProcessingIndicator />
        </div>
    );
};

export default App;
