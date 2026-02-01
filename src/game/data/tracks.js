// ========================================
// TURBO KART RACING - Track Data
// ========================================

export const TRACKS = {
    list: [
        // ===== MUSHROOM CUP =====
        { id: 'luigi_circuit', name: "Luigi Circuit", cup: 'mushroom', icon: '🟢', difficulty: 1, laps: 3, features: ['boost_pads'], theme: 'grass', length: 'short' },
        { id: 'moo_moo_meadows', name: "Moo Moo Meadows", cup: 'mushroom', icon: '🐄', difficulty: 1, laps: 3, features: ['obstacles'], theme: 'farm', length: 'short' },
        { id: 'mushroom_gorge', name: "Mushroom Gorge", cup: 'mushroom', icon: '🍄', difficulty: 2, laps: 3, features: ['bouncy_mushrooms', 'gaps'], theme: 'canyon', length: 'medium' },
        { id: 'toads_factory', name: "Toad's Factory", cup: 'mushroom', icon: '🏭', difficulty: 2, laps: 3, features: ['conveyor_belts', 'obstacles'], theme: 'industrial', length: 'medium' },
        
        // ===== FLOWER CUP =====
        { id: 'mario_circuit', name: "Mario Circuit", cup: 'flower', icon: '🔴', difficulty: 2, laps: 3, features: ['boost_pads', 'anti_gravity'], theme: 'classic', length: 'medium' },
        { id: 'coconut_mall', name: "Coconut Mall", cup: 'flower', icon: '🏬', difficulty: 2, laps: 3, features: ['escalators', 'indoor'], theme: 'mall', length: 'medium' },
        { id: 'dk_summit', name: "DK Summit", cup: 'flower', icon: '🏔️', difficulty: 3, laps: 3, features: ['half_pipes', 'snow'], theme: 'snow', length: 'long' },
        { id: 'warios_gold_mine', name: "Wario's Gold Mine", cup: 'flower', icon: '⛏️', difficulty: 3, laps: 3, features: ['mine_carts', 'narrow_paths'], theme: 'mine', length: 'long' },
        
        // ===== STAR CUP =====
        { id: 'daisy_circuit', name: "Daisy Circuit", cup: 'star', icon: '🌼', difficulty: 2, laps: 3, features: ['water_section', 'statues'], theme: 'coastal', length: 'medium' },
        { id: 'koopa_cape', name: "Koopa Cape", cup: 'star', icon: '🐢', difficulty: 3, laps: 3, features: ['underwater', 'river_current'], theme: 'tropical', length: 'long' },
        { id: 'maple_treeway', name: "Maple Treeway", cup: 'star', icon: '🍁', difficulty: 3, laps: 3, features: ['treetop_paths', 'caterpillars'], theme: 'forest', length: 'long' },
        { id: 'grumble_volcano', name: "Grumble Volcano", cup: 'star', icon: '🌋', difficulty: 4, laps: 3, features: ['lava', 'collapsing_track'], theme: 'volcano', length: 'long' },
        
        // ===== SPECIAL CUP =====
        { id: 'dry_dry_ruins', name: "Dry Dry Ruins", cup: 'special', icon: '🏛️', difficulty: 3, laps: 3, features: ['sand', 'pokeys'], theme: 'desert', length: 'medium' },
        { id: 'moonview_highway', name: "Moonview Highway", cup: 'special', icon: '🌙', difficulty: 4, laps: 3, features: ['traffic', 'night'], theme: 'highway', length: 'long' },
        { id: 'bowsers_castle', name: "Bowser's Castle", cup: 'special', icon: '🏰', difficulty: 5, laps: 3, features: ['lava', 'thwomps', 'anti_gravity'], theme: 'castle', length: 'long' },
        { id: 'rainbow_road', name: "Rainbow Road", cup: 'special', icon: '🌈', difficulty: 5, laps: 3, features: ['no_rails', 'space', 'anti_gravity'], theme: 'space', length: 'extra_long' },
        
        // ===== RETRO TRACKS =====
        { id: 'gcn_peach_beach', name: "GCN Peach Beach", cup: 'shell', icon: '🏖️', difficulty: 1, laps: 3, features: ['water', 'cataquacks'], theme: 'beach', length: 'short', retro: true, original: 'GameCube' },
        { id: 'ds_yoshi_falls', name: "DS Yoshi Falls", cup: 'shell', icon: '🦎', difficulty: 1, laps: 3, features: ['waterfall', 'simple'], theme: 'jungle', length: 'short', retro: true, original: 'Nintendo DS' },
        { id: 'snes_ghost_valley', name: "SNES Ghost Valley", cup: 'shell', icon: '👻', difficulty: 2, laps: 3, features: ['breakable_rails', 'night'], theme: 'haunted', length: 'short', retro: true, original: 'SNES' },
        { id: 'n64_mario_raceway', name: "N64 Mario Raceway", cup: 'shell', icon: '🏁', difficulty: 2, laps: 3, features: ['classic', 'pipe_shortcuts'], theme: 'grass', length: 'medium', retro: true, original: 'Nintendo 64' },
        
        // Additional retro tracks
        { id: 'n64_sherbet_land', name: "N64 Sherbet Land", cup: 'banana', icon: '🧊', difficulty: 2, laps: 3, features: ['ice', 'penguins'], theme: 'ice', length: 'medium', retro: true, original: 'Nintendo 64' },
        { id: 'gba_shy_guy_beach', name: "GBA Shy Guy Beach", cup: 'banana', icon: '🏝️', difficulty: 1, laps: 3, features: ['beach', 'crabs'], theme: 'beach', length: 'short', retro: true, original: 'GBA' },
        { id: 'ds_delfino_square', name: "DS Delfino Square", cup: 'banana', icon: '🏘️', difficulty: 2, laps: 3, features: ['town', 'shortcuts'], theme: 'town', length: 'medium', retro: true, original: 'Nintendo DS' },
        { id: 'gcn_waluigi_stadium', name: "GCN Waluigi Stadium", cup: 'banana', icon: '🏟️', difficulty: 3, laps: 3, features: ['stadium', 'jumps'], theme: 'stadium', length: 'medium', retro: true, original: 'GameCube' }
    ],
    
    arenas: [
        { id: 'battle_stadium', name: 'Battle Stadium', icon: '🏟️', theme: 'stadium', description: 'A classic circular arena perfect for battle.' },
        { id: 'sweet_sweet_kingdom', name: 'Sweet Sweet Kingdom', icon: '🍰', theme: 'candy', description: 'A delicious arena made of sweets and treats.' },
        { id: 'dragon_palace', name: 'Dragon Palace', icon: '🐲', theme: 'asian', description: 'Battle in an ornate eastern palace.' },
        { id: 'lunar_colony', name: 'Lunar Colony', icon: '🌙', theme: 'space', description: 'Low gravity battle on the moon!' },
        { id: 'urchin_underpass', name: 'Urchin Underpass', icon: '🚇', theme: 'urban', description: 'Fight in city streets and subways.' },
        { id: 'battle_course_1', name: 'Battle Course 1', icon: '1️⃣', theme: 'classic', description: 'Classic SNES-style battle course.' },
        { id: 'wuhu_town', name: 'Wuhu Town', icon: '🏝️', theme: 'tropical', description: 'Battle through the streets of Wuhu Island.' }
    ],
    
    battleModes: [
        { id: 'balloon', name: 'Balloon Battle', icon: '🎈', description: 'Pop opponents balloons while protecting your own!' },
        { id: 'renegade', name: 'Renegade Roundup', icon: '🚔', description: 'Cops vs Robbers - capture or escape!' },
        { id: 'bobomb', name: 'Bob-omb Blast', icon: '💣', description: 'Throw Bob-ombs to score points!' },
        { id: 'coin', name: 'Coin Runners', icon: '🪙', description: 'Collect the most coins to win!' },
        { id: 'shine', name: 'Shine Thief', icon: '✨', description: 'Hold the Shine Sprite the longest!' }
    ],
    
    getTrack(id) {
        return this.list.find(t => t.id === id);
    },
    
    getAllTracks() {
        return this.list;
    },
    
    getTracksByCup(cupId) {
        return this.list.filter(t => t.cup === cupId);
    },
    
    getAllCups() {
        const cupData = {
            mushroom: { id: 'mushroom', name: 'Mushroom Cup', icon: '🍄' },
            flower: { id: 'flower', name: 'Flower Cup', icon: '🌸' },
            star: { id: 'star', name: 'Star Cup', icon: '⭐' },
            special: { id: 'special', name: 'Special Cup', icon: '👑' },
            shell: { id: 'shell', name: 'Shell Cup', icon: '🐚' },
            banana: { id: 'banana', name: 'Banana Cup', icon: '🍌' }
        };
        
        // Get unique cups from track list
        const cupIds = [...new Set(this.list.map(t => t.cup))];
        
        return cupIds.map(cupId => ({
            ...cupData[cupId] || { id: cupId, name: cupId, icon: '🏆' },
            tracks: this.list.filter(t => t.cup === cupId).map(t => t.id)
        }));
    },
    
    getArena(id) {
        return this.arenas.find(a => a.id === id);
    },
    
    getAllArenas() {
        return this.arenas;
    },
    
    getBattleMode(id) {
        return this.battleModes.find(m => m.id === id);
    },
    
    getAllBattleModes() {
        return this.battleModes;
    }
};

export default TRACKS;
