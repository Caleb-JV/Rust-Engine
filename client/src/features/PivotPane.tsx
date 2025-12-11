import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useAppStore, selectPivotBuckets, selectPivotPaneCollapsed, type IColumnField } from '@/store/appStore';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FieldsKeeperBucket, type IFieldsKeeperBucket, type IFieldsKeeperItem, type ISuffixBucketNodeRendererProps } from 'react-fields-keeper';
import { CollapsedPaneComponent, PanelHeader } from '@/components/PaneChrome';
import { dataService } from '@/services/dataService';
import { PANEL_WIDTH } from '@/lib/common.constants';
import React from 'react';

const AGGREGATION_OPTIONS = ['sum', 'average', 'min', 'max', 'count', 'stddev', 'first', 'last'];

export const PivotPane = () => {
    // state
    const pivotBuckets = useAppStore(selectPivotBuckets);
    const isCollapsed = useAppStore(selectPivotPaneCollapsed);

    // dispatch
    const setIsCollapsed = useAppStore((state) => state.setPivotPaneCollapsed);
    const setPivotBuckets = useAppStore((state) => state.setPivotBuckets);

    // compute
    const columnsBucket = pivotBuckets.find((b) => b.id === 'columns');
    const valuesBucket = pivotBuckets.find((b) => b.id === 'values');

    // renderer for aggregation dropdown
    const renderSuffixNode = (props: ISuffixBucketNodeRendererProps) => {
        if (!valuesBucket || !columnsBucket) return null;

        const { fieldItem } = props;

        const pivotItem = valuesBucket?.items.find((i) => i.id === fieldItem.id);

        const aggregation = pivotItem?.value?.aggregate;

        const handleAggChange = (option: string) => {
            const newBuckets: IFieldsKeeperBucket<IColumnField> = { ...valuesBucket };
            if (newBuckets && newBuckets.items) {
                newBuckets.items = newBuckets.items.map((item) => {
                    if (item.id === fieldItem.id) {
                        return {
                            ...item,
                            value: { ...item.value, aggregate: option },
                        } as IFieldsKeeperItem<IColumnField>;
                    }
                    return item;
                });
            }
            setPivotBuckets([columnsBucket, newBuckets]);

            // Trigger data refresh with new aggregation
            setTimeout(() => {
                dataService.getData();
            }, 100);
        };

        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {AGGREGATION_OPTIONS.map((option) => (
                        <DropdownMenuItem
                            className="flex items-center justify-between capitalize text-xs cursor-pointer"
                            key={option}
                            onClick={() => handleAggChange(option)}
                        >
                            {option}
                            {aggregation === option && <CheckIcon className="ml-2 h-4 w-4" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    // paint
    if (isCollapsed) {
        return <CollapsedPaneComponent label="Pivot" onExpand={() => setIsCollapsed(false)} />;
    }

    return (
        <div className="h-full flex flex-col border-r bg-background overflow-y-auto shrink-0" style={{ width: PANEL_WIDTH }}>
            <PanelHeader title="Pivot" onCollapse={() => setIsCollapsed(true)} />

            <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold">Columns</h4>
                            <span className="text-xs text-muted-foreground">{columnsBucket?.items.length || 0}</span>
                        </div>
                        <FieldsKeeperBucket instanceId="pivot" id="columns" allowRemoveFields emptyFieldPlaceholder="Drag fields here" />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold">Values</h4>
                            <span className="text-xs text-muted-foreground">{valuesBucket?.items.length || 0}</span>
                        </div>
                        <FieldsKeeperBucket
                            instanceId="pivot"
                            id="values"
                            suffixNodeRenderer={renderSuffixNode}
                            allowRemoveFields
                            emptyFieldPlaceholder="Drag fields here"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
