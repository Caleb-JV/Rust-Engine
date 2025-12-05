import { Toaster as SonnerToaster } from 'sonner';

export const Toaster = () => (
    <SonnerToaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
            classNames: {
                toast: 'border border-border bg-background text-foreground shadow-sm',
                description: 'text-xs text-muted-foreground',
            },
        }}
    />
);
