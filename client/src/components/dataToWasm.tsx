export function DataToWasmAnimation({ active, progress, context }: { active: boolean; progress: number; context?: string }) {
    // Subtle random packet widths and stagger
    const packets = Array.from({ length: 14 }).map(() => ({
        w: 2 + Math.random() * 3,
        d: Math.random() * 0.4, // random delay offset
    }));

    const speed = 1.2 - (progress / 100) * 0.7; // 1.2s → 0.5s

    if (context === 'generating') {
        return (
            <div className="flex items-center justify-center py-10">
                <div className="relative w-40 h-32 bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
                    {/* LABEL */}
                    <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[11px] text-gray-600 font-medium tracking-wide">WASM</span>

                    {/* PROCESSING LANES */}
                    <div className="absolute inset-0 mt-5 px-4 flex flex-col gap-2 py-6">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="lane">
                                <div className="bar" style={{ animationDelay: `${i * 0.25}s` }} />
                            </div>
                        ))}
                    </div>
                </div>

                <style>{`
                .lane {
                    width: 100%;
                    height: 6px;
                    background: #eef0f3;
                    border-radius: 4px;
                    overflow: hidden;
                    position: relative;
                }

                .bar {
                    position: absolute;
                    top: 0;
                    left: -40%;
                    width: 40%;
                    height: 100%;
                    background: linear-gradient(
                        to right,
                        rgba(120, 144, 156, 0) 0%,
                        rgba(120, 144, 156, 0.4) 50%,
                        rgba(120, 144, 156, 0) 100%
                    );
                    animation: slideBar 1.4s ease-in-out infinite;
                }

                @keyframes slideBar {
                    0% { left: -40%; }
                    100% { left: 110%; }
                }
            `}</style>
            </div>
        );
    }

    return (
        <div className="w-full flex items-center justify-center py-6">
            <div className="flex items-center gap-10">
                {/* DATA */}
                <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-md border border-gray-300 bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-700">
                        JS
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1">Source(file)</span>
                </div>

                {/* PACKET STREAM */}
                <div className="relative w-72 h-10 overflow-hidden">
                    {/* line */}
                    <div className="absolute top-1/2 left-0 right-0 h-[px -translate-y-1/2 bg-linear-to-r from-gray-300 via-gray-400 to-gray-300" />

                    {/* Packets */}
                    {packets.map((p, i) => (
                        <span
                            key={i}
                            className="data-packet absolute top-1/2 -translate-y-1/2 rounded-sm bg-gray-600"
                            style={
                                {
                                    width: `${p.w * 1.2}px`,
                                    height: '6px',
                                    '--i': i,
                                    '--d': p.d,
                                    '--speed': `${speed}s`,
                                    animationPlayState: active ? 'running' : 'paused',
                                } as React.CSSProperties & { '--i': number; '--d': number; '--speed': string }
                            }
                        />
                    ))}
                </div>

                {/* WASM */}
                <div
                    className="flex flex-col items-center transition-transform duration-200"
                    style={{
                        transform: active ? `scale(${1 + progress * 0.0008})` : 'scale(1)',
                    }}
                >
                    <div className="h-10 w-10 rounded-md border border-gray-300 bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-700">
                        WASM
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1">{Math.round(progress)}%</span>
                </div>
            </div>

            <style
                dangerouslySetInnerHTML={{
                    __html: `
                .data-packet {
                    left: -20px;
                    opacity: 0;
                    animation: movePacket var(--speed) ease-in-out infinite;
                    animation-delay: calc(var(--i) * -0.22s - var(--d) * 0.4s);
                }

                @keyframes movePacket {
                    0% {
                        opacity: 0;
                        transform: translate3d(0, -50%, 0) scale(0.9);
                    }
                    10% {
                        opacity: 0.7;
                    }
                    50% {
                        opacity: 0.9;
                        transform: translate3d(50%, -50%, 0) scale(1);
                    }
                    90% {
                        opacity: 0.7;
                    }
                    100% {
                        opacity: 0;
                        transform: translate3d(300px, -50%, 0) scale(0.85);
                    }
                }
            `,
                }}
            />
        </div>
    );
}
