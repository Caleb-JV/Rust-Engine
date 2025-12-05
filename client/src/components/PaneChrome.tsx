import { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ICollapsedPaneComponentProps {
    label: string;
    onExpand: () => void;
    icon?: ReactNode;
}

interface IPanelHeaderProps {
    title: string;
    onCollapse: () => void;
    children?: ReactNode;
    className?: string;
    collapseIconDirection?: 'left' | 'right';
}

export const CollapsedPaneComponent = (props: ICollapsedPaneComponentProps) => {
    // props
    const { label, onExpand, icon } = props;

    // paint
    return (
        <div className="h-full w-12 border-r bg-background flex flex-col items-center py-2">
            <Button variant="ghost" size="icon" onClick={onExpand} className="mb-4">
                {icon ?? <ChevronRight className="h-4 w-4" />}
            </Button>
            <div className="[writing-mode:vertical-lr] text-sm font-semibold">{label}</div>
        </div>
    );
};

export const PanelHeader = (props: IPanelHeaderProps) => {
    // props
    const { title, onCollapse, children, className, collapseIconDirection = 'left' } = props;

    // compute
    const iconClassName = collapseIconDirection === 'left' ? 'h-4 w-4' : 'h-4 w-4 rotate-180';

    // paint
    return (
        <div className={`flex items-center justify-between px-3 py-1.5 border-b w-full ${className ?? ''}`}>
            <div className="flex items-center w-full gap-2 justify-between">
                <h4 className="text-[15px] font-semibold">{title}</h4>
                {children}
            </div>
            <Button variant="ghost" size="icon" onClick={onCollapse}>
                <ChevronLeft className={iconClassName} />
            </Button>
        </div>
    );
};
