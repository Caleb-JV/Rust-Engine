import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface FieldSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export const FieldSearch = ({ value, onChange, placeholder = 'Search fields...' }: FieldSearchProps) => {
    return (
        <div className="relative w-full">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-8 pl-7 text-xs shadow-none border-foreground/30"
            />
        </div>
    );
};
