"use client";

import { useEffect, useState, useRef } from "react";

interface SafetyTimerProps {
    onTriggerSOS: () => void;
    isActive: boolean;
    onStop: () => void;
    initialDuration?: number; // Duration in seconds
}

export default function SafetyTimer({ onTriggerSOS, isActive, onStop, initialDuration = 1200 }: SafetyTimerProps) {
    const [timeLeft, setTimeLeft] = useState(initialDuration);
    const [isPaused, setIsPaused] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isActive && initialDuration) {
            setTimeLeft(initialDuration);
        }
    }, [isActive, initialDuration]);

    useEffect(() => {
        if (isActive && !isPaused && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current!);
                        onTriggerSOS();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isActive, isPaused, timeLeft, onTriggerSOS]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const addTime = (minutes: number) => {
        setTimeLeft(prev => prev + (minutes * 60));
    };

    if (!isActive) return null;

    return (
        <div className="fixed bottom-24 left-4 z-40 animate-in slide-in-from-left">
            <div className="bg-slate-900 border-2 border-neon-mint rounded-3xl p-4 shadow-2xl w-64">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-neon-mint font-bold text-xs uppercase tracking-wider animate-pulse flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">timer</span>
                        Safety Check
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className="text-slate-400 hover:text-white"
                        >
                            <span className="material-symbols-outlined text-sm">{isPaused ? "play_arrow" : "pause"}</span>
                        </button>
                        <button
                            onClick={onStop}
                            className="text-slate-400 hover:text-red-400"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                </div>

                <div className="text-4xl font-black text-white text-center font-mono my-2">
                    {formatTime(timeLeft)}
                </div>

                <div className="flex gap-2 mb-3 justify-center">
                    <button
                        onClick={() => addTime(5)}
                        className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded hover:bg-slate-700"
                    >
                        +5m
                    </button>
                    <button
                        onClick={() => addTime(15)}
                        className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded hover:bg-slate-700"
                    >
                        +15m
                    </button>
                </div>

                <button
                    onClick={onStop}
                    className="w-full bg-neon-mint text-slate-900 font-bold py-2 rounded-xl text-sm hover:bg-emerald-400 flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined">check_circle</span>
                    I'M SAFE
                </button>
            </div>
        </div>
    );
}
