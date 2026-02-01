// ========================================
// TURBO KART RACING - Loading Screen Component
// ========================================

import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

export function LoadingScreen({ onLoadComplete }) {
    const [progress, setProgress] = useState(0);
    const [loadingText, setLoadingText] = useState('Loading assets...');
    
    useEffect(() => {
        const loadingSteps = [
            { progress: 10, text: 'Loading game engine...' },
            { progress: 25, text: 'Loading textures...' },
            { progress: 40, text: 'Loading characters...' },
            { progress: 55, text: 'Loading vehicles...' },
            { progress: 70, text: 'Loading tracks...' },
            { progress: 85, text: 'Loading audio...' },
            { progress: 95, text: 'Initializing...' },
            { progress: 100, text: 'Ready!' }
        ];
        
        let currentStep = 0;
        
        const interval = setInterval(() => {
            if (currentStep < loadingSteps.length) {
                setProgress(loadingSteps[currentStep].progress);
                setLoadingText(loadingSteps[currentStep].text);
                currentStep++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    onLoadComplete?.();
                }, 500);
            }
        }, 300);
        
        return () => clearInterval(interval);
    }, [onLoadComplete]);
    
    return (
        <div className="loading-screen">
            <div className="loading-content">
                <h1 className="loading-title">TURBO KART RACING</h1>
                <div className="loading-kart">🏎️</div>
                <div className="loading-bar-container">
                    <div 
                        className="loading-bar" 
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <p className="loading-text">{loadingText}</p>
                <p className="loading-progress">{progress}%</p>
            </div>
        </div>
    );
}

export default LoadingScreen;
