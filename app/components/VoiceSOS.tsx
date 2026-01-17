"use client";

import { useEffect, useState } from 'react';

interface VoiceSOSProps {
    onTrigger: () => void;
}

export default function VoiceSOS({ onTrigger }: VoiceSOSProps) {
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            // @ts-ignore
            const recognition = new window.webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);

            recognition.onerror = (event: any) => {
                console.warn("Speech Recognition Error:", event.error);
                setIsListening(false);
            };

            recognition.onresult = (event: any) => {
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        const transcript = event.results[i][0].transcript.trim().toLowerCase();
                        console.log("Heard:", transcript);
                        if (transcript.includes("help") || transcript.includes("safe") || transcript.includes("step")) {
                            console.log("SOS Triggered via Voice!");
                            onTrigger();
                        }
                    }
                }
            };

            try {
                recognition.start();
            } catch (e) { console.error(e); }

            return () => {
                recognition.stop();
            };
        } else {
            setError("Voice Not Supported");
        }
    }, [onTrigger]);

    if (error) return null;

    return (
        <div className={`fixed bottom-24 left-4 z-40 transition-all ${isListening ? 'opacity-100' : 'opacity-50'}`}>
            <div className={`bg-slate-900/80 backdrop-blur-md p-3 rounded-full border border-slate-700 shadow-xl flex items-center justify-center ${isListening ? 'animate-pulse border-neon-mint' : ''}`}>
                <span className={`material-symbols-outlined text-xl ${isListening ? 'text-neon-mint' : 'text-slate-500'}`}>mic</span>
            </div>
        </div>
    );
}
