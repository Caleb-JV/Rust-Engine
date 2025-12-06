import { MainHeader } from './features/MainHeader';
import { DataPane } from './features/DataPane';
import { PivotPane } from './features/PivotPane';
import { TableView } from './features/TableView';
import { ProcessingIndicator } from './components/ProcessingIndicator';
import './features/fields-keeper-custom.css';
import DataProvider from './features/DataProvider';
import { FilterPane } from './features/FilterPane';
import { Toaster } from './components/ui/sonner';

const App: React.FC = () => {
    return (
        <div className=" bg-background grid grid-rows-[auto_1fr] overflow-y-hidden">
            <MainHeader />

            <DataProvider>
                <DataPane />
                <PivotPane />
                <FilterPane />
                <TableView />
            </DataProvider>

            {/* Smooth rotating loader - demonstrates no UI freezes */}
            <ProcessingIndicator />

            {/* Global toast notifications */}
            <Toaster />
        </div>
    );
};

export default App;
