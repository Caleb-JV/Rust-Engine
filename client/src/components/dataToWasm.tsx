import { Code2, Cpu } from 'lucide-react';

export function DataToWasmAnimation({ active, progress }: { active: boolean; progress: number }) {
    const packets = Array.from({ length: 16 });

    const speed = 1.3 - Math.min(progress / 100, 0.8);

    return (
        <div className="w-full flex justify-center items-center py-10">
            <div className="relative flex items-center justify-between gap-10 rounded-3xl border bg-background/80 px-10 py-8 shadow-lg backdrop-blur-xl max-w-4xl w-full">
                {/* JS Panel */}
                <div className="flex flex-col items-start gap-2">
                    <div className="inline-flex items-center gap-2 border px-4 py-2 rounded-xl text-sm bg-muted/20 shadow-sm">
                        <Code2 className="h-5 w-5" />
                        <span className="font-medium">JavaScript</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Query • Filters • Sort</span>
                </div>

                {/* Flow Zone */}
                <div className="relative flex-1 h-24 mx-4">
                    {/* Glow Background */}
                    <div className="absolute inset-0 blur-xl opacity-50 bg-linear-to-r from-primary/10 via-primary/30 to-primary/10 rounded-full" />

                    {/* Main Line */}
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-linear-to-r from-border via-primary/50 to-border rounded-full" />

                    {/* Packets */}
                    {active &&
                        packets.map((_, i) => (
                            <div
                                key={i}
                                className="packet"
                                style={{
                                    animationDelay: `${i * 0.18}s`,
                                    animationDuration: `${speed}s`,
                                }}
                            />
                        ))}

                    {/* Arrow */}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2">
                        <div className="h-0 w-0 border-y-[9px] border-l-14 border-y-transparent border-l-primary/60" />
                    </div>
                </div>

                {/* WASM Panel */}
                <div className="flex flex-col items-end gap-2">
                    <div className="inline-flex items-center gap-2 border px-4 py-2 rounded-xl text-sm bg-muted/20 shadow-sm">
                        <Cpu className="h-5 w-5" />
                        <span className="font-medium">WASM Engine</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Arrow • Pivot • Agg</span>
                </div>

                {/* Status */}
                <div className="absolute bottom-4 text-xs text-muted-foreground">{active ? `Streaming… ${progress}%` : 'Idle'}</div>
            </div>

            <style>{`
                .packet {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 14px;
                    height: 14px;
                    background: hsl(var(--primary));
                    border-radius: 9999px;
                    opacity: 0.95;
                    filter: drop-shadow(0 0 10px hsl(var(--primary) / 0.8));
                    animation-name: flow;
                    animation-timing-function: linear;
                    animation-iteration-count: infinite;
                }

                @keyframes flow {
                    from {
                        left: -8%;
                        transform: translateY(-50%) scale(0.9);
                    }
                    to {
                        left: 105%;
                        transform: translateY(-50%) scale(1.1);
                    }
                }
            `}</style>
        </div>
    );
}
