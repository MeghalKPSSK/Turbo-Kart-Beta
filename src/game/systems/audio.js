// ========================================
// TURBO KART RACING - Audio System
// ========================================

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        
        this.sounds = {};
        this.music = {};
        this.customTracks = {}; // Loaded MP3 files
        this.currentMusic = null;
        this.currentMusicName = null;
        this.currentMusicSource = null; // For MP3 playback
        this.activeMusicNodes = [];
        
        this.settings = {
            masterVolume: 0.8,
            musicVolume: 0.6,
            sfxVolume: 0.8,
            muted: false
        };
        
        this.jukebox = {
            playlist: [],
            currentIndex: 0,
            shuffle: false,
            repeat: 'all'
        };
        
        this.musicLoopTimeoutId = null; // Track the loop timeout globally
        
        // Music assignments for different game states
        this.musicAssignments = {
            menu: 'menu',
            character_select: 'character_select',
            vehicle_select: 'character_select',
            track_select: 'track_select',
            countdown: 'countdown',
            race: 'race_1',
            battle: 'battle',
            victory: 'victory'
        };
        
        this.initialized = false;
    }
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            
            this.musicGain = this.audioContext.createGain();
            this.musicGain.connect(this.masterGain);
            
            this.sfxGain = this.audioContext.createGain();
            this.sfxGain.connect(this.masterGain);
            
            this.updateVolumes();
            await this.loadAllSounds();
            await this.loadCustomMusic();
            
            this.initialized = true;
            console.log('Audio system initialized');
            
        } catch (error) {
            console.error('Failed to initialize audio:', error);
        }
    }
    
    // Load custom MP3 files from public/music folder
    async loadCustomMusic() {
        try {
            const response = await fetch('/music/music-config.json');
            if (!response.ok) {
                console.log('No custom music config found');
                return;
            }
            
            const config = await response.json();
            
            if (config.tracks && Array.isArray(config.tracks)) {
                for (const track of config.tracks) {
                    try {
                        const audioResponse = await fetch(`/music/${track.file}`);
                        if (audioResponse.ok) {
                            const arrayBuffer = await audioResponse.arrayBuffer();
                            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                            
                            this.customTracks[track.id] = {
                                buffer: audioBuffer,
                                ...track
                            };
                            
                            // Add to music registry
                            this.music[track.id] = {
                                name: track.name,
                                bpm: track.bpm || 120,
                                isCustom: true,
                                buffer: audioBuffer
                            };
                            
                            // Update music assignments if specified
                            if (track.assignTo && Array.isArray(track.assignTo)) {
                                track.assignTo.forEach(state => {
                                    this.musicAssignments[state] = track.id;
                                });
                            }
                            
                            console.log('Loaded custom track:', track.name);
                        }
                    } catch (err) {
                        console.warn('Failed to load custom track:', track.file, err);
                    }
                }
                
                // Rebuild jukebox playlist
                this.rebuildJukeboxPlaylist();
            }
        } catch (error) {
            console.log('No custom music configuration found or error loading:', error);
        }
    }
    
    // Rebuild jukebox playlist with all music
    rebuildJukeboxPlaylist() {
        this.jukebox.playlist = Object.keys(this.music).map(key => ({
            id: key,
            name: this.music[key].name,
            bpm: this.music[key].bpm,
            isCustom: this.music[key].isCustom || false
        }));
    }
    
    // Get music for a specific game state
    getMusicForState(state) {
        return this.musicAssignments[state] || 'menu';
    }
    
    // Set music assignment for a game state
    setMusicAssignment(state, trackId) {
        if (this.music[trackId]) {
            this.musicAssignments[state] = trackId;
        }
    }
    
    async loadAllSounds() {
        // Menu sounds with longer duration for audibility
        const sfxList = {
            'menu_select': { type: 'synth', config: { waveform: 'sine', frequency: 600, duration: 0.1 } },
            'menu_confirm': { type: 'synth', config: { waveform: 'sine', frequency: 800, duration: 0.15 } },
            'menu_back': { type: 'synth', config: { waveform: 'sine', frequency: 400, duration: 0.1 } },
            'engine_idle': { type: 'synth', config: { waveform: 'sawtooth', frequency: 80 } },
            'engine_accelerate': { type: 'synth', config: { waveform: 'sawtooth', frequency: 150 } },
            'item_get': { type: 'synth', config: { waveform: 'sine', frequency: 880, duration: 0.2 } },
            'item_use': { type: 'synth', config: { waveform: 'square', frequency: 440, duration: 0.15 } },
            'item_throw': { type: 'noise', config: { duration: 0.25, filterFreq: 1800 } },
            'shell_throw': { type: 'noise', config: { duration: 0.3, filterFreq: 2000 } },
            'shell_fire': { type: 'synth', config: { waveform: 'sawtooth', frequency: 300, duration: 0.25 } },
            'shell_hit': { type: 'noise', config: { duration: 0.4, filterFreq: 1500 } },
            'banana_slip': { type: 'noise', config: { duration: 0.5, filterFreq: 800 } },
            'mushroom_boost': { type: 'synth', config: { waveform: 'sawtooth', frequency: 523, duration: 0.5 } },
            'star_power': { type: 'synth', config: { waveform: 'square', frequency: 784, duration: 0.6 } },
            'star_active': { type: 'synth', config: { waveform: 'square', frequency: 659, duration: 1.5 } },
            'lightning_strike': { type: 'noise', config: { duration: 0.8, filterFreq: 3000 } },
            'bomb_throw': { type: 'synth', config: { waveform: 'triangle', frequency: 200, duration: 0.3 } },
            'countdown_beep': { type: 'synth', config: { waveform: 'sine', frequency: 440, duration: 0.2 } },
            'countdown_go': { type: 'synth', config: { waveform: 'sine', frequency: 880, duration: 0.4 } },
            'drift_boost': { type: 'synth', config: { waveform: 'sawtooth', frequency: 392, duration: 0.5 } },
            'turbo_boost': { type: 'synth', config: { waveform: 'sawtooth', frequency: 494, duration: 0.4 } },
            'coin_collect': { type: 'synth', config: { waveform: 'sine', frequency: 988, duration: 0.15 } },
            'collision': { type: 'noise', config: { duration: 0.3, filterFreq: 1000 } },
            'lap_complete': { type: 'synth', config: { waveform: 'square', frequency: 659, duration: 0.4 } },
            'final_lap': { type: 'synth', config: { waveform: 'square', frequency: 880, duration: 0.8 } },
            'race_finish': { type: 'synth', config: { waveform: 'sine', frequency: 1047, duration: 1 } },
            'menu_error': { type: 'synth', config: { waveform: 'square', frequency: 220, duration: 0.2 } },
            'balloon_pop': { type: 'noise', config: { duration: 0.3, filterFreq: 2500 } },
            // New vehicle sounds
            'brake_screech': { type: 'custom', generator: 'brakeScreech' },
            'car_collision': { type: 'custom', generator: 'carCollision' },
            'railing_hit': { type: 'custom', generator: 'railingHit' },
            'wrong_way_beep': { type: 'custom', generator: 'wrongWayBeep' }
        };
        
        // Engine sound state
        this.engineSound = null;
        this.engineOscillators = [];
        this.engineGain = null;
        this.currentEngineSpeed = 0;
        
        for (const [name, config] of Object.entries(sfxList)) {
            if (config.type === 'custom') {
                this.sounds[name] = { ...config, play: () => this.playCustomSound(config.generator) };
            } else {
                this.sounds[name] = { ...config, play: () => this.playProceduralSound(config) };
            }
        }
        
        this.createProceduralMusic();
    }
    
    // Custom sound generators using sound math/synthesis
    playCustomSound(generator) {
        if (!this.audioContext || this.settings.muted) return null;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        switch (generator) {
            case 'brakeScreech':
                return this.generateBrakeScreech();
            case 'carCollision':
                return this.generateCarCollision();
            case 'railingHit':
                return this.generateRailingHit();
            case 'wrongWayBeep':
                return this.generateWrongWayBeep();
            default:
                return null;
        }
    }
    
    // Brake screech - high frequency noise with pitch bend
    generateBrakeScreech() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const duration = 0.4;
        
        // Create noise buffer for screech texture
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = Math.random() * 2 - 1;
        }
        
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        // High-pass filter for screech character
        const highPass = ctx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.setValueAtTime(2000, now);
        highPass.frequency.exponentialRampToValueAtTime(4000, now + duration * 0.3);
        highPass.Q.value = 5;
        
        // Band-pass for tonal quality
        const bandPass = ctx.createBiquadFilter();
        bandPass.type = 'bandpass';
        bandPass.frequency.setValueAtTime(3500, now);
        bandPass.frequency.exponentialRampToValueAtTime(2500, now + duration);
        bandPass.Q.value = 8;
        
        // Envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        
        // Connect chain
        noiseSource.connect(highPass);
        highPass.connect(bandPass);
        bandPass.connect(gain);
        gain.connect(this.sfxGain);
        
        noiseSource.start(now);
        noiseSource.stop(now + duration);
        
        return noiseSource;
    }
    
    // Car collision - metallic impact with crunch
    generateCarCollision() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const duration = 0.35;
        
        // Impact thump (low frequency)
        const impactOsc = ctx.createOscillator();
        impactOsc.type = 'sine';
        impactOsc.frequency.setValueAtTime(150, now);
        impactOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        
        const impactGain = ctx.createGain();
        impactGain.gain.setValueAtTime(0.5, now);
        impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        
        impactOsc.connect(impactGain);
        impactGain.connect(this.sfxGain);
        
        // Metallic crunch (noise through resonant filter)
        const crunchBuffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const crunchData = crunchBuffer.getChannelData(0);
        for (let i = 0; i < crunchData.length; i++) {
            crunchData[i] = Math.random() * 2 - 1;
        }
        
        const crunchSource = ctx.createBufferSource();
        crunchSource.buffer = crunchBuffer;
        
        const metalFilter = ctx.createBiquadFilter();
        metalFilter.type = 'bandpass';
        metalFilter.frequency.setValueAtTime(800, now);
        metalFilter.Q.value = 3;
        
        const crunchGain = ctx.createGain();
        crunchGain.gain.setValueAtTime(0.4, now);
        crunchGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        
        crunchSource.connect(metalFilter);
        metalFilter.connect(crunchGain);
        crunchGain.connect(this.sfxGain);
        
        // High metallic ping
        const pingOsc = ctx.createOscillator();
        pingOsc.type = 'triangle';
        pingOsc.frequency.setValueAtTime(1200, now);
        pingOsc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
        
        const pingGain = ctx.createGain();
        pingGain.gain.setValueAtTime(0.2, now);
        pingGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        pingOsc.connect(pingGain);
        pingGain.connect(this.sfxGain);
        
        // Start all
        impactOsc.start(now);
        impactOsc.stop(now + 0.15);
        crunchSource.start(now);
        crunchSource.stop(now + duration);
        pingOsc.start(now);
        pingOsc.stop(now + 0.1);
        
        return impactOsc;
    }
    
    // Railing hit - metallic clang with reverb-like tail
    generateRailingHit() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const duration = 0.5;
        
        // Main metallic strike
        const strikeOsc = ctx.createOscillator();
        strikeOsc.type = 'triangle';
        strikeOsc.frequency.setValueAtTime(450, now);
        strikeOsc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        
        const strikeGain = ctx.createGain();
        strikeGain.gain.setValueAtTime(0.35, now);
        strikeGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        
        strikeOsc.connect(strikeGain);
        strikeGain.connect(this.sfxGain);
        
        // Harmonic overtones for metal ringing
        const harmonics = [1.5, 2.2, 3.1, 4.7];
        const baseFreq = 320;
        
        harmonics.forEach((mult, i) => {
            const harmOsc = ctx.createOscillator();
            harmOsc.type = 'sine';
            harmOsc.frequency.setValueAtTime(baseFreq * mult, now);
            
            const harmGain = ctx.createGain();
            const startVol = 0.12 / (i + 1);
            harmGain.gain.setValueAtTime(startVol, now);
            harmGain.gain.exponentialRampToValueAtTime(0.001, now + duration * (1 - i * 0.15));
            
            harmOsc.connect(harmGain);
            harmGain.connect(this.sfxGain);
            
            harmOsc.start(now);
            harmOsc.stop(now + duration);
        });
        
        // Impact noise
        const impactBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const impactData = impactBuffer.getChannelData(0);
        for (let i = 0; i < impactData.length; i++) {
            impactData[i] = Math.random() * 2 - 1;
        }
        
        const impactSource = ctx.createBufferSource();
        impactSource.buffer = impactBuffer;
        
        const impactFilter = ctx.createBiquadFilter();
        impactFilter.type = 'bandpass';
        impactFilter.frequency.value = 600;
        impactFilter.Q.value = 2;
        
        const impactGain = ctx.createGain();
        impactGain.gain.setValueAtTime(0.25, now);
        impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        
        impactSource.connect(impactFilter);
        impactFilter.connect(impactGain);
        impactGain.connect(this.sfxGain);
        
        strikeOsc.start(now);
        strikeOsc.stop(now + 0.25);
        impactSource.start(now);
        impactSource.stop(now + 0.1);
        
        return strikeOsc;
    }
    
    // Wrong way warning beep - urgent alternating tones
    generateWrongWayBeep() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        
        // Two-tone warning like a reversing truck
        const frequencies = [800, 600];
        const beepDuration = 0.15;
        const totalDuration = 0.5;
        
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = frequencies[i % 2];
            
            const gain = ctx.createGain();
            const startTime = now + i * beepDuration;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
            gain.gain.setValueAtTime(0.2, startTime + beepDuration * 0.8);
            gain.gain.linearRampToValueAtTime(0, startTime + beepDuration);
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.start(startTime);
            osc.stop(startTime + beepDuration);
        }
        
        return null;
    }
    
    // Continuous engine sound system
    startEngineSound() {
        if (!this.audioContext || this.engineSound) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const ctx = this.audioContext;
        
        // Create gain node for engine
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0.15;
        this.engineGain.connect(this.sfxGain);
        
        // Base engine oscillator (fundamental)
        const baseOsc = ctx.createOscillator();
        baseOsc.type = 'sawtooth';
        baseOsc.frequency.value = 60; // Idle frequency
        
        // Second harmonic
        const harmOsc = ctx.createOscillator();
        harmOsc.type = 'triangle';
        harmOsc.frequency.value = 120;
        
        // Third harmonic (adds bite)
        const thirdOsc = ctx.createOscillator();
        thirdOsc.type = 'square';
        thirdOsc.frequency.value = 180;
        
        // Individual gains for mixing
        const baseGain = ctx.createGain();
        baseGain.gain.value = 0.5;
        
        const harmGain = ctx.createGain();
        harmGain.gain.value = 0.3;
        
        const thirdGain = ctx.createGain();
        thirdGain.gain.value = 0.1;
        
        // Low-pass filter for warmth
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 1;
        
        // Connect
        baseOsc.connect(baseGain);
        harmOsc.connect(harmGain);
        thirdOsc.connect(thirdGain);
        
        baseGain.connect(filter);
        harmGain.connect(filter);
        thirdGain.connect(filter);
        
        filter.connect(this.engineGain);
        
        // Start oscillators
        baseOsc.start();
        harmOsc.start();
        thirdOsc.start();
        
        this.engineOscillators = [baseOsc, harmOsc, thirdOsc];
        this.engineFilter = filter;
        this.engineSound = true;
    }
    
    // Update engine pitch based on speed (0-1 normalized)
    updateEngineSound(speedRatio, isAccelerating, isBraking) {
        if (!this.engineSound || !this.engineOscillators.length) return;
        
        // Clamp and smooth the speed ratio
        const targetSpeed = Math.max(0, Math.min(1, speedRatio));
        this.currentEngineSpeed += (targetSpeed - this.currentEngineSpeed) * 0.1;
        
        // Calculate frequencies based on speed
        const baseFreq = 60 + this.currentEngineSpeed * 140; // 60Hz to 200Hz
        
        // Update oscillator frequencies
        if (this.engineOscillators[0]) {
            this.engineOscillators[0].frequency.value = baseFreq;
        }
        if (this.engineOscillators[1]) {
            this.engineOscillators[1].frequency.value = baseFreq * 2;
        }
        if (this.engineOscillators[2]) {
            this.engineOscillators[2].frequency.value = baseFreq * 3;
        }
        
        // Adjust filter and volume based on state
        if (this.engineFilter) {
            if (isAccelerating) {
                this.engineFilter.frequency.value = 800 + this.currentEngineSpeed * 1200;
                this.engineGain.gain.value = 0.18 + this.currentEngineSpeed * 0.07;
            } else if (isBraking) {
                this.engineFilter.frequency.value = 600;
                this.engineGain.gain.value = 0.1;
            } else {
                // Coasting - engine braking sound
                this.engineFilter.frequency.value = 500 + this.currentEngineSpeed * 400;
                this.engineGain.gain.value = 0.12;
            }
        }
    }
    
    stopEngineSound() {
        if (!this.engineSound) return;
        
        this.engineOscillators.forEach(osc => {
            try {
                osc.stop();
            } catch {
                // Already stopped
            }
        });
        
        this.engineOscillators = [];
        this.engineGain = null;
        this.engineFilter = null;
        this.engineSound = null;
        this.currentEngineSpeed = 0;
    }
    
    playProceduralSound(config) {
        if (!this.audioContext || this.settings.muted) return null;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const startTime = this.audioContext.currentTime;
        let source;
        
        if (config.type === 'synth') {
            source = this.audioContext.createOscillator();
            source.type = config.config.waveform || 'sine';
            source.frequency.value = config.config.frequency || 440;
            
            const envelope = this.audioContext.createGain();
            envelope.gain.setValueAtTime(0.5, startTime);  // Increased from 0.3
            envelope.gain.exponentialRampToValueAtTime(0.01, startTime + (config.config.duration || 0.3));
            
            source.connect(envelope);
            envelope.connect(this.sfxGain);
            
            source.start(startTime);
            source.stop(startTime + (config.config.duration || 0.3));
            
        } else if (config.type === 'noise') {
            const bufferSize = this.audioContext.sampleRate * (config.config.duration || 0.5);
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = config.config.filterFreq || 2000;
            
            const envelope = this.audioContext.createGain();
            envelope.gain.setValueAtTime(0.3, startTime);
            envelope.gain.exponentialRampToValueAtTime(0.01, startTime + (config.config.duration || 0.5));
            
            source.connect(filter);
            filter.connect(envelope);
            envelope.connect(this.sfxGain);
            
            source.start(startTime);
        }
        
        return source;
    }
    
    createProceduralMusic() {
        this.music = {
            // Menu Music
            'menu': { name: 'Main Menu Theme', bpm: 115, generate: () => this.generateMenuMusic() },
            'character_select': { name: 'Character Select', bpm: 125, generate: () => this.generateCharacterSelectMusic() },
            'vehicle_select': { name: 'Vehicle Garage', bpm: 118, generate: () => this.generateVehicleSelectMusic() },
            'track_select': { name: 'Track Preview', bpm: 130, generate: () => this.generateTrackSelectMusic() },
            
            // Race Music
            'countdown': { name: 'Starting Grid', bpm: 100, generate: () => this.generateCountdownMusic() },
            'race_1': { name: 'Turbo Circuit', bpm: 145, generate: () => this.generateRaceMusic1() },
            'race_2': { name: 'Neon Speedway', bpm: 155, generate: () => this.generateRaceMusic2() },
            'race_3': { name: 'Desert Drift', bpm: 138, generate: () => this.generateRaceMusic3() },
            'final_lap_theme': { name: 'Final Lap Rush', bpm: 170, generate: () => this.generateFinalLapMusic() },
            
            // Battle Music
            'battle': { name: 'Battle Arena', bpm: 140, generate: () => this.generateBattleMusic() },
            
            // Results Music
            'victory': { name: 'Victory Fanfare', bpm: 120, generate: () => this.generateVictoryMusic() },
            'podium': { name: 'Podium Celebration', bpm: 130, generate: () => this.generatePodiumMusic() }
        };
        
        this.rebuildJukeboxPlaylist();
    }
    
    // ============ MENU MUSIC ============
    generateMenuMusic() {
        // Upbeat, welcoming theme with major chords
        return this.createMusicLoop([
            // Intro phrase
            { note: 'C4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'G4', duration: 0.75 }, { note: 'E4', duration: 0.25 },
            { note: 'C5', duration: 1.0 },
            // Second phrase
            { note: 'B4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'E4', duration: 0.5 }, { note: 'D4', duration: 0.5 },
            { note: 'C4', duration: 1.0 },
            // Bridge
            { note: 'F4', duration: 0.5 }, { note: 'A4', duration: 0.5 },
            { note: 'G4', duration: 0.5 }, { note: 'F4', duration: 0.5 },
            { note: 'E4', duration: 0.75 }, { note: 'D4', duration: 0.25 },
            { note: 'C4', duration: 1.0 }
        ], 115, 'triangle');
    }
    
    generateCharacterSelectMusic() {
        // Energetic, anticipatory feel
        return this.createMusicLoop([
            { note: 'G3', duration: 0.25 }, { note: 'G3', duration: 0.25 },
            { note: 'B3', duration: 0.25 }, { note: 'D4', duration: 0.25 },
            { note: 'G4', duration: 0.5 }, { note: 'F#4', duration: 0.25 }, { note: 'G4', duration: 0.25 },
            { note: 'E4', duration: 0.5 }, { note: 'D4', duration: 0.5 },
            // Response
            { note: 'C4', duration: 0.25 }, { note: 'C4', duration: 0.25 },
            { note: 'E4', duration: 0.25 }, { note: 'G4', duration: 0.25 },
            { note: 'C5', duration: 0.5 }, { note: 'B4', duration: 0.25 }, { note: 'A4', duration: 0.25 },
            { note: 'G4', duration: 1.0 }
        ], 125, 'square');
    }
    
    generateVehicleSelectMusic() {
        // Mechanical, garage-like feel
        return this.createMusicLoop([
            { note: 'E3', duration: 0.5 }, { note: 'G3', duration: 0.25 }, { note: 'A3', duration: 0.25 },
            { note: 'B3', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'D4', duration: 0.25 }, { note: 'C4', duration: 0.25 }, { note: 'B3', duration: 0.5 },
            { note: 'A3', duration: 0.5 }, { note: 'G3', duration: 0.5 },
            // Second part
            { note: 'E3', duration: 0.25 }, { note: 'E3', duration: 0.25 },
            { note: 'G3', duration: 0.5 }, { note: 'B3', duration: 0.5 },
            { note: 'E4', duration: 0.75 }, { note: 'D4', duration: 0.25 },
            { note: 'E4', duration: 1.0 }
        ], 118, 'sawtooth');
    }
    
    generateTrackSelectMusic() {
        // Preview/exploration feel
        return this.createMusicLoop([
            { note: 'D4', duration: 0.5 }, { note: 'F#4', duration: 0.5 },
            { note: 'A4', duration: 0.5 }, { note: 'D5', duration: 0.5 },
            { note: 'C#5', duration: 0.25 }, { note: 'B4', duration: 0.25 }, { note: 'A4', duration: 0.5 },
            { note: 'G4', duration: 0.5 }, { note: 'F#4', duration: 0.5 },
            { note: 'E4', duration: 0.5 }, { note: 'D4', duration: 0.5 },
            { note: 'E4', duration: 0.5 }, { note: 'F#4', duration: 0.5 },
            { note: 'D4', duration: 1.0 }
        ], 130, 'triangle');
    }
    
    // ============ COUNTDOWN MUSIC ============
    generateCountdownMusic() {
        // Tense, building anticipation - plays during 3-2-1 countdown
        return this.createMusicLoop([
            // Building tension
            { note: 'E3', duration: 0.5 }, { note: 'E3', duration: 0.5 },
            { note: 'E3', duration: 0.5 }, { note: 'E3', duration: 0.25 }, { note: 'G3', duration: 0.25 },
            { note: 'A3', duration: 0.5 }, { note: 'A3', duration: 0.5 },
            { note: 'A3', duration: 0.5 }, { note: 'A3', duration: 0.25 }, { note: 'B3', duration: 0.25 },
            // Rising
            { note: 'C4', duration: 0.5 }, { note: 'C4', duration: 0.5 },
            { note: 'D4', duration: 0.5 }, { note: 'D4', duration: 0.5 },
            { note: 'E4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'G4', duration: 1.0 }
        ], 100, 'square');
    }
    
    // ============ RACE MUSIC ============
    generateRaceMusic1() {
        // High energy racing theme
        return this.createMusicLoop([
            // Fast driving melody
            { note: 'E4', duration: 0.25 }, { note: 'E4', duration: 0.25 },
            { note: 'G4', duration: 0.25 }, { note: 'A4', duration: 0.25 },
            { note: 'B4', duration: 0.5 }, { note: 'A4', duration: 0.25 }, { note: 'G4', duration: 0.25 },
            { note: 'E4', duration: 0.5 }, { note: 'D4', duration: 0.5 },
            // Response
            { note: 'C4', duration: 0.25 }, { note: 'D4', duration: 0.25 },
            { note: 'E4', duration: 0.25 }, { note: 'G4', duration: 0.25 },
            { note: 'A4', duration: 0.5 }, { note: 'G4', duration: 0.25 }, { note: 'E4', duration: 0.25 },
            { note: 'D4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            // Bridge
            { note: 'B4', duration: 0.25 }, { note: 'A4', duration: 0.25 },
            { note: 'G4', duration: 0.25 }, { note: 'E4', duration: 0.25 },
            { note: 'D4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'G4', duration: 0.5 }, { note: 'E4', duration: 0.5 }
        ], 145, 'sawtooth');
    }
    
    generateRaceMusic2() {
        // Synth-wave neon feel
        return this.createMusicLoop([
            { note: 'A4', duration: 0.25 }, { note: 'C5', duration: 0.25 },
            { note: 'E5', duration: 0.5 }, { note: 'D5', duration: 0.25 }, { note: 'C5', duration: 0.25 },
            { note: 'A4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'F4', duration: 0.25 }, { note: 'G4', duration: 0.25 },
            { note: 'A4', duration: 0.5 }, { note: 'C5', duration: 0.5 },
            // Second phrase
            { note: 'D5', duration: 0.25 }, { note: 'E5', duration: 0.25 },
            { note: 'D5', duration: 0.25 }, { note: 'C5', duration: 0.25 },
            { note: 'A4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'A4', duration: 1.0 }
        ], 155, 'square');
    }
    
    generateRaceMusic3() {
        // Desert/western racing vibe
        return this.createMusicLoop([
            { note: 'E4', duration: 0.5 }, { note: 'G4', duration: 0.25 }, { note: 'A4', duration: 0.25 },
            { note: 'B4', duration: 0.5 }, { note: 'A4', duration: 0.5 },
            { note: 'G4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'D4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            // Response
            { note: 'G4', duration: 0.5 }, { note: 'A4', duration: 0.25 }, { note: 'B4', duration: 0.25 },
            { note: 'C5', duration: 0.5 }, { note: 'B4', duration: 0.5 },
            { note: 'A4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'E4', duration: 1.0 }
        ], 138, 'triangle');
    }
    
    generateFinalLapMusic() {
        // Intense, faster version for final lap
        return this.createMusicLoop([
            { note: 'E5', duration: 0.125 }, { note: 'E5', duration: 0.125 },
            { note: 'G5', duration: 0.125 }, { note: 'A5', duration: 0.125 },
            { note: 'B5', duration: 0.25 }, { note: 'A5', duration: 0.25 },
            { note: 'G5', duration: 0.25 }, { note: 'E5', duration: 0.25 },
            { note: 'D5', duration: 0.25 }, { note: 'E5', duration: 0.25 },
            { note: 'G5', duration: 0.25 }, { note: 'B5', duration: 0.25 },
            { note: 'A5', duration: 0.25 }, { note: 'G5', duration: 0.25 },
            { note: 'E5', duration: 0.5 }
        ], 170, 'sawtooth');
    }
    
    // ============ BATTLE MUSIC ============
    generateBattleMusic() {
        return this.createMusicLoop([
            { note: 'E4', duration: 0.25 }, { note: 'E4', duration: 0.25 },
            { note: 'G4', duration: 0.25 }, { note: 'E4', duration: 0.25 },
            { note: 'A4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'E4', duration: 0.25 }, { note: 'D4', duration: 0.25 },
            { note: 'C4', duration: 0.5 }, { note: 'D4', duration: 0.5 },
            // Aggressive response
            { note: 'E4', duration: 0.25 }, { note: 'G4', duration: 0.25 },
            { note: 'A4', duration: 0.25 }, { note: 'B4', duration: 0.25 },
            { note: 'C5', duration: 0.5 }, { note: 'B4', duration: 0.25 }, { note: 'A4', duration: 0.25 },
            { note: 'G4', duration: 0.5 }, { note: 'E4', duration: 0.5 }
        ], 140, 'square');
    }
    
    // ============ VICTORY MUSIC ============
    generateVictoryMusic() {
        // Triumphant fanfare for scorecard
        return this.createMusicLoop([
            // Fanfare opening
            { note: 'C4', duration: 0.25 }, { note: 'C4', duration: 0.25 },
            { note: 'C4', duration: 0.25 }, { note: 'C4', duration: 0.25 },
            { note: 'E4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'C5', duration: 1.0 },
            // Celebration
            { note: 'B4', duration: 0.25 }, { note: 'C5', duration: 0.25 },
            { note: 'B4', duration: 0.25 }, { note: 'A4', duration: 0.25 },
            { note: 'G4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'C4', duration: 0.5 }, { note: 'E4', duration: 0.5 },
            { note: 'G4', duration: 0.5 }, { note: 'C5', duration: 1.5 }
        ], 120, 'triangle');
    }
    
    generatePodiumMusic() {
        // Extended celebration theme
        return this.createMusicLoop([
            { note: 'G4', duration: 0.5 }, { note: 'A4', duration: 0.5 },
            { note: 'B4', duration: 0.5 }, { note: 'C5', duration: 0.5 },
            { note: 'D5', duration: 1.0 },
            { note: 'C5', duration: 0.5 }, { note: 'B4', duration: 0.5 },
            { note: 'A4', duration: 0.5 }, { note: 'G4', duration: 0.5 },
            { note: 'C5', duration: 1.0 },
            { note: 'E5', duration: 0.5 }, { note: 'D5', duration: 0.5 },
            { note: 'C5', duration: 1.0 },
            { note: 'G4', duration: 2.0 }
        ], 130, 'triangle');
    }
    
    // Legacy compatibility
    generateSelectMusic() {
        return this.generateCharacterSelectMusic();
    }
    
    generateRaceMusic(bpm) {
        // Random selection for variety
        const raceTracks = [
            () => this.generateRaceMusic1(),
            () => this.generateRaceMusic2(),
            () => this.generateRaceMusic3()
        ];
        return raceTracks[Math.floor(Math.random() * raceTracks.length)]();
    }
    
    generateResultsMusic() {
        return this.generateVictoryMusic();
    }
    
    createMusicLoop(sequence, bpm, waveType = 'triangle') {
        if (!this.audioContext) return null;
        
        // Note: stopMusic() is called by playMusic() before generate() is called
        // So we don't call it here to avoid clearing currentMusicName
        
        const noteFrequencies = {
            'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 
            'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
            'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99,
            'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77
        };
        
        const beatDuration = 60 / bpm;
        const musicName = this.currentMusicName; // Capture current music name
        
        const playSequence = () => {
            // Check if this music is still the current one
            if (this.settings.muted || this.currentMusicName !== musicName) {
                return;
            }
            
            let currentTime = this.audioContext.currentTime;
            let totalDuration = 0;
            
            sequence.forEach(note => {
                const osc = this.audioContext.createOscillator();
                osc.type = waveType;
                osc.frequency.value = noteFrequencies[note.note] || 440;
                
                const gain = this.audioContext.createGain();
                gain.gain.setValueAtTime(0.12, currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, currentTime + note.duration * beatDuration * 0.9);
                
                osc.connect(gain);
                gain.connect(this.musicGain);
                
                osc.start(currentTime);
                osc.stop(currentTime + note.duration * beatDuration);
                
                this.activeMusicNodes.push(osc);
                totalDuration += note.duration * beatDuration;
                currentTime += note.duration * beatDuration;
            });
            
            // Loop with proper timing - use global timeout tracking
            this.musicLoopTimeoutId = setTimeout(() => {
                if (this.currentMusicName === musicName) {
                    playSequence();
                }
            }, totalDuration * 1000);
        };
        
        playSequence();
        
        return { 
            stop: () => {
                if (this.musicLoopTimeoutId) {
                    clearTimeout(this.musicLoopTimeoutId);
                    this.musicLoopTimeoutId = null;
                }
                this.stopMusic();
            }
        };
    }
    
    // Play custom MP3 track
    playCustomTrack(trackId) {
        if (!this.customTracks[trackId] || !this.audioContext) return null;
        
        this.stopMusic();
        
        const track = this.customTracks[trackId];
        const source = this.audioContext.createBufferSource();
        source.buffer = track.buffer;
        source.loop = true;
        source.connect(this.musicGain);
        source.start();
        
        this.currentMusicSource = source;
        this.currentMusicName = trackId;
        
        return {
            stop: () => {
                try {
                    source.stop();
                } catch {
                    // Already stopped
                }
                this.currentMusicSource = null;
            }
        };
    }
    
    playSound(name) {
        if (!this.initialized) {
            console.warn('Audio not initialized, cannot play:', name);
            return null;
        }
        if (this.audioContext?.state === 'suspended') {
            console.log('Resuming AudioContext for sound:', name);
            this.audioContext.resume();
        }
        if (this.sounds[name]) {
            console.log('Playing sound:', name, 'audioContext state:', this.audioContext?.state);
            return this.sounds[name].play();
        }
        console.warn('Sound not found:', name);
        return null;
    }
    
    playMusic(name) {
        console.log('playMusic called:', name, 'current:', this.currentMusicName, 'audioContext state:', this.audioContext?.state);
        
        // Resume audio context if suspended (browser autoplay policy)
        if (this.audioContext?.state === 'suspended') {
            console.log('Resuming suspended AudioContext');
            this.audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            });
        }
        
        if (this.currentMusicName === name) return;
        
        this.stopMusic();
        this.currentMusicName = name;
        
        // Check if it's a custom MP3 track
        if (this.customTracks[name]) {
            console.log('Playing custom MP3 track:', name);
            this.playCustomTrack(name);
        } else if (this.music[name]?.generate) {
            console.log('Generating procedural music:', name);
            this.currentMusic = this.music[name].generate();
        } else {
            console.warn('No music found for:', name);
        }
    }
    
    // Play music for a specific game state
    playMusicForState(state) {
        const trackId = this.getMusicForState(state);
        if (trackId === 'none') {
            this.stopMusic();
            return;
        }
        this.playMusic(trackId);
    }
    
    stopMusic() {
        this.currentMusicName = null;
        
        // Clear the loop timeout
        if (this.musicLoopTimeoutId) {
            clearTimeout(this.musicLoopTimeoutId);
            this.musicLoopTimeoutId = null;
        }
        
        // Stop custom MP3 if playing
        if (this.currentMusicSource) {
            try {
                this.currentMusicSource.stop();
            } catch {
                // Already stopped
            }
            this.currentMusicSource = null;
        }
        
        // Stop procedural music nodes
        this.activeMusicNodes.forEach(node => {
            try {
                node.stop();
            } catch {
                // Already stopped
            }
        });
        this.activeMusicNodes = [];
    }
    
    updateVolumes() {
        if (this.masterGain) {
            this.masterGain.gain.value = this.settings.muted ? 0 : this.settings.masterVolume;
        }
        if (this.musicGain) {
            this.musicGain.gain.value = this.settings.musicVolume;
        }
        if (this.sfxGain) {
            this.sfxGain.gain.value = this.settings.sfxVolume;
        }
    }
    
    resumeContext() {
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext resumed via user interaction');
            });
        }
        return this.audioContext?.state === 'running';
    }
    
    setMasterVolume(value) {
        this.settings.masterVolume = Math.max(0, Math.min(1, value));
        this.updateVolumes();
    }
    
    setMusicVolume(value) {
        this.settings.musicVolume = Math.max(0, Math.min(1, value));
        this.updateVolumes();
    }
    
    setSfxVolume(value) {
        this.settings.sfxVolume = Math.max(0, Math.min(1, value));
        this.updateVolumes();
    }
    
    toggleMute() {
        this.settings.muted = !this.settings.muted;
        this.updateVolumes();
        return this.settings.muted;
    }
    
    // Jukebox functions
    jukeboxPlay() {
        const track = this.jukebox.playlist[this.jukebox.currentIndex];
        if (track) {
            this.playMusic(track.id);
        }
    }
    
    jukeboxPause() {
        this.stopMusic();
    }
    
    jukeboxNext() {
        if (this.jukebox.shuffle) {
            this.jukebox.currentIndex = Math.floor(Math.random() * this.jukebox.playlist.length);
        } else {
            this.jukebox.currentIndex = (this.jukebox.currentIndex + 1) % this.jukebox.playlist.length;
        }
        this.jukeboxPlay();
    }
    
    jukeboxPrevious() {
        this.jukebox.currentIndex = (this.jukebox.currentIndex - 1 + this.jukebox.playlist.length) % this.jukebox.playlist.length;
        this.jukeboxPlay();
    }
    
    jukeboxToggleShuffle() {
        this.jukebox.shuffle = !this.jukebox.shuffle;
        return this.jukebox.shuffle;
    }
}

// Singleton instance
export const audioManager = new AudioManager();
export default audioManager;
