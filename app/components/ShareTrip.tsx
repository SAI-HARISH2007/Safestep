"use client";

import { useState } from 'react';

interface ShareTripProps {
    etaSeconds: number;
}

export default function ShareTrip({ etaSeconds }: ShareTripProps) {
    const [isSharing, setIsSharing] = useState(false);
    const [shareLink, setShareLink] = useState<string | null>(null);

    const toggleShare = () => {
        if (isSharing) {
            setIsSharing(false);
            setShareLink(null);
        } else {
            setIsSharing(true);
            // Mock Link Generation
            const mockId = Math.random().toString(36).substring(7);
            setShareLink(`https://safestep.app/track/${mockId}`);
        }
    };

    const copyLink = () => {
        if (shareLink) {
            navigator.clipboard.writeText(shareLink);
            alert("Tracking Link Copied!");
        }
    };

    return (
        <div className="mt-4">
            {!isSharing ? (
                <button
                    onClick={toggleShare}
                    className="w-full bg-blue-600/20 text-blue-400 border border-blue-500/30 font-bold py-3 rounded-xl hover:bg-blue-600/30 transition flex items-center justify-center gap-2"
                >
                    <span className="material-symbols-outlined">share_location</span>
                    Share Live Trip
                </button>
            ) : (
                <div className="bg-blue-900/40 border border-blue-500/50 rounded-xl p-3 animate-in fade-in">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-blue-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
                            </span>
                            Sharing Live
                        </span>
                        <button onClick={toggleShare} className="text-slate-400 hover:text-white">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <input
                            readOnly
                            value={shareLink || ''}
                            className="bg-slate-900/50 text-slate-300 text-xs rounded-lg px-2 py-1 flex-1 border border-slate-700/50 outline-none"
                        />
                        <button onClick={copyLink} className="bg-blue-600 text-white p-1.5 rounded-lg hover:bg-blue-500">
                            <span className="material-symbols-outlined text-sm">content_copy</span>
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                        Guardians alerted if trip delayed &gt; 5 mins.
                    </p>
                </div>
            )}
        </div>
    );
}
