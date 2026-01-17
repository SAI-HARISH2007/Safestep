"use client";

import { useState, useRef, useEffect } from 'react';

export default function FakeCall({ onClose }: { onClose: () => void }) {
    const [status, setStatus] = useState<'incoming' | 'active'>('incoming');
    const [timer, setTimer] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Auto-close if not answered logic could go here
    useEffect(() => {
        if (status === 'active') {
            const interval = setInterval(() => setTimer(t => t + 1), 1000);
            return () => clearInterval(interval);
        }
    }, [status]);

    const handleAnswer = () => {
        setStatus('active');
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center pt-20 text-white font-sans">

            {/* Caller Info */}
            <div className="flex flex-col items-center mb-auto">
                <div className="h-24 w-24 rounded-full bg-slate-700 mb-4 flex items-center justify-center overflow-hidden border-2 border-slate-600">
                    <span className="material-symbols-outlined text-6xl text-slate-400">person</span>
                </div>
                <h2 className="text-3xl font-medium mb-1">Dad</h2>
                <p className="text-slate-400 text-lg">{status === 'incoming' ? 'Incoming call...' : formatTime(timer)}</p>
            </div>

            {/* Controls */}
            <div className="w-full pb-20 px-12 flex justify-between items-center">
                {status === 'incoming' ? (
                    <>
                        {/* Decline */}
                        <button
                            onClick={onClose}
                            className="flex flex-col items-center gap-2"
                        >
                            <div className="h-16 w-16 bg-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition">
                                <span className="material-symbols-outlined text-3xl">call_end</span>
                            </div>
                            <span className="text-sm font-medium">Decline</span>
                        </button>

                        {/* Accept */}
                        <button
                            onClick={handleAnswer}
                            className="flex flex-col items-center gap-2"
                        >
                            <div className="h-16 w-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition animate-bounce">
                                <span className="material-symbols-outlined text-3xl">call</span>
                            </div>
                            <span className="text-sm font-medium">Accept</span>
                        </button>
                    </>
                ) : (
                    <div className="w-full flex justify-center">
                        <button
                            onClick={onClose}
                            className="h-20 w-20 bg-red-500 rounded-full flex items-center justify-center shadow-red-900/50 shadow-xl hover:bg-red-600 transition"
                        >
                            <span className="material-symbols-outlined text-4xl">call_end</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Audio Element (Hidden) */}
            {status === 'active' && (
                <audio autoPlay loop src="https://actions.google.com/sounds/v1/human_voices/male_speech_uk_english.ogg">
                </audio>
            )}
        </div>
    );
}
