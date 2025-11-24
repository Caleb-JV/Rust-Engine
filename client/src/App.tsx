import { MainHeader } from './features/MainHeader';
import { DataPane } from './features/DataPane';
import { FieldsPane } from './features/FieldsPane';
import { TableView } from './features/TableView';
import { useFieldsStore, selectError } from './store/fieldsStore';
import './features/fields-keeper-custom.css';
import DataProvider from './features/DataProvider';

const App: React.FC = () => {
    // Store selectors
    const error = useFieldsStore(selectError);

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
                <FieldsPane />
                <TableView />
            </DataProvider>
        </div>
    );
};

export default App;
