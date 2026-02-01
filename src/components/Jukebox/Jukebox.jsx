// ========================================
// TURBO KART RACING - Jukebox Component
// ========================================

import { useState, useEffect, useCallback } from 'react';
import { audioManager } from '../../game/systems/audio';
import './Jukebox.css';

const Jukebox = ({ onBack }) => {
    const [tracks, setTracks] = useState([]);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [musicAssignments, setMusicAssignments] = useState({});
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTrack, setAssignTrack] = useState(null);
    const [editingState, setEditingState] = useState(null); // Which game state we're editing

    // Categories for filtering
    const categories = [
        { id: 'all', label: 'All Tracks' },
        { id: 'menu', label: 'Menu' },
        { id: 'select', label: 'Selection' },
        { id: 'race', label: 'Race' },
        { id: 'battle', label: 'Battle' },
        { id: 'results', label: 'Results' },
        { id: 'custom', label: 'Custom MP3s' }
    ];

    // Game states for assignment
    const gameStates = [
        { id: 'menu', label: 'Main Menu' },
        { id: 'character_select', label: 'Character Select' },
        { id: 'vehicle_select', label: 'Vehicle Select' },
        { id: 'track_select', label: 'Track Select' },
        { id: 'countdown', label: 'Countdown' },
        { id: 'race', label: 'Race' },
        { id: 'battle', label: 'Battle Mode' },
        { id: 'victory', label: 'Victory Screen' }
    ];

    // Determine category for a track based on its ID
    const getCategoryForTrack = useCallback((trackId) => {
        if (trackId.includes('menu')) return 'menu';
        if (trackId.includes('select') || trackId.includes('character') || trackId.includes('vehicle') || trackId.includes('track')) return 'select';
        if (trackId.includes('race') || trackId.includes('lap') || trackId.includes('countdown')) return 'race';
        if (trackId.includes('battle')) return 'battle';
        if (trackId.includes('victory') || trackId.includes('podium')) return 'results';
        return 'race'; // Default
    }, []);

    // Load tracks from audio manager
    useEffect(() => {
        const loadTracks = () => {
            const playlist = audioManager.jukebox.playlist || [];
            const trackList = playlist.map(track => ({
                ...track,
                category: getCategoryForTrack(track.id)
            }));
            setTracks(trackList);
            setMusicAssignments({ ...audioManager.musicAssignments });
            
            // Set current track if music is playing
            if (audioManager.currentMusicName) {
                setCurrentTrack(audioManager.currentMusicName);
                setIsPlaying(true);
            }
        };

        loadTracks();
    }, [getCategoryForTrack]);

    // Filter tracks by category
    const filteredTracks = tracks.filter(track => {
        if (selectedCategory === 'all') return true;
        if (selectedCategory === 'custom') return track.isCustom;
        return track.category === selectedCategory;
    });

    // Play/Pause toggle
    const handlePlayPause = useCallback(() => {
        audioManager.resumeContext(); // Ensure audio context is active
        if (isPlaying) {
            audioManager.stopMusic();
            setIsPlaying(false);
        } else if (currentTrack) {
            audioManager.playMusic(currentTrack);
            setIsPlaying(true);
        } else if (filteredTracks.length > 0) {
            audioManager.playMusic(filteredTracks[0].id);
            setCurrentTrack(filteredTracks[0].id);
            setIsPlaying(true);
        }
    }, [isPlaying, currentTrack, filteredTracks]);

    // Play specific track
    const handlePlayTrack = useCallback((trackId) => {
        audioManager.resumeContext(); // Ensure audio context is active
        audioManager.playMusic(trackId);
        setCurrentTrack(trackId);
        setIsPlaying(true);
    }, []);

    // Next track
    const handleNext = useCallback(() => {
        if (shuffle) {
            const randomIndex = Math.floor(Math.random() * filteredTracks.length);
            const track = filteredTracks[randomIndex];
            handlePlayTrack(track.id);
        } else {
            const currentIndex = filteredTracks.findIndex(t => t.id === currentTrack);
            const nextIndex = (currentIndex + 1) % filteredTracks.length;
            handlePlayTrack(filteredTracks[nextIndex].id);
        }
    }, [shuffle, filteredTracks, currentTrack, handlePlayTrack]);

    // Previous track
    const handlePrevious = useCallback(() => {
        const currentIndex = filteredTracks.findIndex(t => t.id === currentTrack);
        const prevIndex = (currentIndex - 1 + filteredTracks.length) % filteredTracks.length;
        handlePlayTrack(filteredTracks[prevIndex].id);
    }, [filteredTracks, currentTrack, handlePlayTrack]);

    // Toggle shuffle
    const handleToggleShuffle = useCallback(() => {
        setShuffle(prev => !prev);
    }, []);

    // Open assignment modal for a track
    const handleOpenAssign = useCallback((track) => {
        setAssignTrack(track);
        setEditingState(null);
        setShowAssignModal(true);
    }, []);

    // Open modal to edit a game state's music
    const handleEditStateMusic = useCallback((stateId) => {
        setEditingState(stateId);
        setAssignTrack(null);
        setShowAssignModal(true);
    }, []);

    // Assign track to a game state
    const handleAssignTrack = useCallback((stateId, trackId) => {
        if (trackId) {
            audioManager.setMusicAssignment(stateId, trackId);
            setMusicAssignments(prev => ({
                ...prev,
                [stateId]: trackId
            }));
        }
    }, []);

    // Remove music from a game state (set to silent)
    const handleRemoveMusic = useCallback((stateId) => {
        audioManager.setMusicAssignment(stateId, 'none');
        setMusicAssignments(prev => ({
            ...prev,
            [stateId]: 'none'
        }));
    }, []);

    // Get current assignment for a state
    const getAssignmentDisplay = (stateId) => {
        const trackId = musicAssignments[stateId];
        if (trackId === 'none') return '🔇 No Music';
        const track = tracks.find(t => t.id === trackId);
        return track?.name || trackId || 'Default';
    };

    // Stop music when leaving jukebox (return to menu music)
    const handleBack = useCallback(() => {
        audioManager.playMusicForState('menu');
        onBack();
    }, [onBack]);

    return (
        <div className="jukebox">
            <div className="jukebox-header">
                <button className="back-button" onClick={handleBack}>← Back</button>
                <h1>🎵 Jukebox</h1>
            </div>

            {/* Category Filters */}
            <div className="jukebox-categories">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat.id)}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Now Playing */}
            <div className="now-playing">
                <div className="now-playing-info">
                    <span className="now-playing-label">Now Playing:</span>
                    <span className="now-playing-track">
                        {currentTrack ? tracks.find(t => t.id === currentTrack)?.name || currentTrack : 'Nothing playing'}
                    </span>
                </div>
                
                {/* Playback Controls */}
                <div className="playback-controls">
                    <button 
                        className={`control-btn shuffle ${shuffle ? 'active' : ''}`}
                        onClick={handleToggleShuffle}
                        title="Shuffle"
                    >
                        🔀
                    </button>
                    <button className="control-btn" onClick={handlePrevious} title="Previous">
                        ⏮️
                    </button>
                    <button className="control-btn play-btn" onClick={handlePlayPause}>
                        {isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <button className="control-btn" onClick={handleNext} title="Next">
                        ⏭️
                    </button>
                </div>
            </div>

            {/* Track List */}
            <div className="track-list">
                <h2>
                    {selectedCategory === 'all' ? 'All Tracks' : 
                     selectedCategory === 'custom' ? 'Custom MP3s' :
                     categories.find(c => c.id === selectedCategory)?.label + ' Tracks'}
                    <span className="track-count">({filteredTracks.length})</span>
                </h2>
                
                {filteredTracks.length === 0 ? (
                    <div className="no-tracks">
                        {selectedCategory === 'custom' ? (
                            <>
                                <p>No custom MP3s loaded yet!</p>
                                <p className="hint">Add MP3 files to <code>public/music/</code> and configure them in <code>music-config.json</code></p>
                            </>
                        ) : (
                            <p>No tracks in this category</p>
                        )}
                    </div>
                ) : (
                    <ul>
                        {filteredTracks.map(track => (
                            <li 
                                key={track.id}
                                className={`track-item ${currentTrack === track.id ? 'playing' : ''}`}
                            >
                                <div className="track-info">
                                    <span className="track-name">{track.name}</span>
                                    <span className="track-meta">
                                        {track.bpm && `${track.bpm} BPM`}
                                        {track.isCustom && ' • Custom MP3'}
                                    </span>
                                </div>
                                <div className="track-actions">
                                    <button 
                                        className="play-track-btn"
                                        onClick={() => handlePlayTrack(track.id)}
                                    >
                                        {currentTrack === track.id && isPlaying ? '🔊' : '▶️'}
                                    </button>
                                    <button 
                                        className="assign-btn"
                                        onClick={() => handleOpenAssign(track)}
                                        title="Assign to game state"
                                    >
                                        ⚙️
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Music Assignments Panel */}
            <div className="assignments-panel">
                <h2>🎮 Music Assignments</h2>
                <p className="assignments-hint">Click to change music for each screen</p>
                <div className="assignments-grid">
                    {gameStates.map(state => (
                        <div 
                            key={state.id}
                            className={`assignment-item ${musicAssignments[state.id] === 'none' ? 'no-music' : ''}`}
                            onClick={() => handleEditStateMusic(state.id)}
                        >
                            <span className="state-name">{state.label}</span>
                            <span className="assigned-track">{getAssignmentDisplay(state.id)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Assignment Modal */}
            {showAssignModal && (
                <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        {editingState ? (
                            // Mode: Select track for a game state
                            <>
                                <h3>Select Music for {gameStates.find(s => s.id === editingState)?.label}</h3>
                                <div className="modal-tracks">
                                    <button
                                        className={`modal-track-btn no-music-btn ${musicAssignments[editingState] === 'none' ? 'active' : ''}`}
                                        onClick={() => {
                                            handleRemoveMusic(editingState);
                                            setShowAssignModal(false);
                                        }}
                                    >
                                        🔇 No Music
                                    </button>
                                    {tracks.map(track => (
                                        <button
                                            key={track.id}
                                            className={`modal-track-btn ${musicAssignments[editingState] === track.id ? 'active' : ''}`}
                                            onClick={() => {
                                                handleAssignTrack(editingState, track.id);
                                                setShowAssignModal(false);
                                            }}
                                        >
                                            {track.name}
                                            {musicAssignments[editingState] === track.id && ' ✓'}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            // Mode: Assign track to game states
                            <>
                                <h3>Assign Track</h3>
                                <p>Select screens for: <strong>{assignTrack?.name || 'Select a track first'}</strong></p>
                                <div className="modal-states">
                                    {gameStates.map(state => (
                                        <button
                                            key={state.id}
                                            className={`modal-state-btn ${musicAssignments[state.id] === assignTrack?.id ? 'active' : ''}`}
                                            onClick={() => {
                                                handleAssignTrack(state.id, assignTrack?.id);
                                            }}
                                        >
                                            {state.label}
                                            {musicAssignments[state.id] === assignTrack?.id && ' ✓'}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        <button className="modal-close" onClick={() => setShowAssignModal(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Custom Music Instructions */}
            <div className="custom-music-info">
                <h3>📁 Add Your Own Music</h3>
                <ol>
                    <li>Place MP3 files in <code>public/music/</code></li>
                    <li>Edit <code>public/music/music-config.json</code> to add track info</li>
                    <li>Refresh the game to load new tracks</li>
                </ol>
            </div>
        </div>
    );
};

export default Jukebox;
