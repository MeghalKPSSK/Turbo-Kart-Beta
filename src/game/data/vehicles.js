// ========================================
// TURBO KART RACING - Vehicle Data
// ========================================

export const VEHICLES = {
    karts: [
        { id: 'standard_kart', name: 'Standard Kart', icon: '🏎️', stats: { speed: 3, acceleration: 3, weight: 3, handling: 3, traction: 3 }, unlocked: true },
        { id: 'pipe_frame', name: 'Pipe Frame', icon: '🔧', stats: { speed: 2, acceleration: 4, weight: 2, handling: 4, traction: 3 }, unlocked: true },
        { id: 'mach_8', name: 'Mach 8', icon: '⚡', stats: { speed: 4, acceleration: 2, weight: 3, handling: 3, traction: 4 }, unlocked: true },
        { id: 'steel_driver', name: 'Steel Driver', icon: '🦾', stats: { speed: 5, acceleration: 1, weight: 5, handling: 1, traction: 4 }, unlocked: true },
        { id: 'cat_cruiser', name: 'Cat Cruiser', icon: '🐱', stats: { speed: 2, acceleration: 4, weight: 2, handling: 4, traction: 4 }, unlocked: true },
        { id: 'circuit_special', name: 'Circuit Special', icon: '🏁', stats: { speed: 5, acceleration: 1, weight: 4, handling: 2, traction: 2 }, unlocked: false },
        { id: 'tri_speeder', name: 'Tri-Speeder', icon: '🔺', stats: { speed: 4, acceleration: 2, weight: 5, handling: 1, traction: 4 }, unlocked: false },
        { id: 'badwagon', name: 'Badwagon', icon: '🚗', stats: { speed: 5, acceleration: 1, weight: 5, handling: 1, traction: 3 }, unlocked: false },
        { id: 'prancer', name: 'Prancer', icon: '🦌', stats: { speed: 3, acceleration: 3, weight: 2, handling: 5, traction: 2 }, unlocked: true },
        { id: 'biddybuggy', name: 'Biddybuggy', icon: '🐞', stats: { speed: 1, acceleration: 5, weight: 1, handling: 5, traction: 4 }, unlocked: true },
        { id: 'landship', name: 'Landship', icon: '⛵', stats: { speed: 3, acceleration: 3, weight: 4, handling: 2, traction: 5 }, unlocked: false },
        { id: 'sneeker', name: 'Sneeker', icon: '👟', stats: { speed: 4, acceleration: 2, weight: 3, handling: 4, traction: 2 }, unlocked: false },
        { id: 'sports_coupe', name: 'Sports Coupe', icon: '🚘', stats: { speed: 4, acceleration: 2, weight: 3, handling: 3, traction: 3 }, unlocked: true },
        { id: 'gold_standard', name: 'Gold Standard', icon: '🥇', stats: { speed: 4, acceleration: 2, weight: 4, handling: 2, traction: 3 }, unlocked: false, isGold: true },
        { id: 'w25_silver_arrow', name: 'W 25 Silver Arrow', icon: '🏛️', stats: { speed: 5, acceleration: 1, weight: 4, handling: 3, traction: 1 }, unlocked: false, dlc: true },
        { id: 'blue_falcon', name: 'Blue Falcon', icon: '🦅', stats: { speed: 5, acceleration: 2, weight: 2, handling: 3, traction: 1 }, unlocked: false, dlc: true },
        { id: 'splat_buggy', name: 'Splat Buggy', icon: '🎨', stats: { speed: 2, acceleration: 4, weight: 2, handling: 5, traction: 3 }, unlocked: false, dlc: true },
        { id: 'inkstriker', name: 'Inkstriker', icon: '🖌️', stats: { speed: 4, acceleration: 2, weight: 3, handling: 3, traction: 3 }, unlocked: false, dlc: true }
    ],
    
    bikes: [
        { id: 'standard_bike', name: 'Standard Bike', icon: '🏍️', stats: { speed: 3, acceleration: 3, weight: 3, handling: 4, traction: 2 }, unlocked: true, canWheellie: true },
        { id: 'comet', name: 'Comet', icon: '☄️', stats: { speed: 4, acceleration: 2, weight: 3, handling: 4, traction: 2 }, unlocked: true, canWheellie: true },
        { id: 'sport_bike', name: 'Sport Bike', icon: '🔴', stats: { speed: 5, acceleration: 1, weight: 3, handling: 3, traction: 2 }, unlocked: false, canWheellie: true },
        { id: 'the_duke', name: 'The Duke', icon: '👑', stats: { speed: 4, acceleration: 2, weight: 4, handling: 2, traction: 4 }, unlocked: false, canWheellie: false },
        { id: 'flame_rider', name: 'Flame Rider', icon: '🔥', stats: { speed: 4, acceleration: 3, weight: 3, handling: 3, traction: 2 }, unlocked: true, canWheellie: true },
        { id: 'varmint', name: 'Varmint', icon: '🐿️', stats: { speed: 2, acceleration: 4, weight: 2, handling: 5, traction: 3 }, unlocked: true, canWheellie: false },
        { id: 'mr_scooty', name: 'Mr. Scooty', icon: '🛵', stats: { speed: 1, acceleration: 5, weight: 1, handling: 5, traction: 5 }, unlocked: true, canWheellie: true },
        { id: 'jet_bike', name: 'Jet Bike', icon: '✈️', stats: { speed: 5, acceleration: 1, weight: 3, handling: 4, traction: 1 }, unlocked: false, canWheellie: true },
        { id: 'yoshi_bike', name: 'Yoshi Bike', icon: '🦎', stats: { speed: 3, acceleration: 3, weight: 2, handling: 5, traction: 3 }, unlocked: false, canWheellie: false },
        { id: 'master_cycle', name: 'Master Cycle', icon: '⚔️', stats: { speed: 4, acceleration: 2, weight: 4, handling: 3, traction: 3 }, unlocked: false, dlc: true, canWheellie: false },
        { id: 'city_tripper', name: 'City Tripper', icon: '🏙️', stats: { speed: 2, acceleration: 4, weight: 2, handling: 5, traction: 4 }, unlocked: false, canWheellie: false }
    ],
    
    atvs: [
        { id: 'standard_atv', name: 'Standard ATV', icon: '🚜', stats: { speed: 3, acceleration: 3, weight: 4, handling: 2, traction: 5 }, unlocked: true },
        { id: 'wild_wiggler', name: 'Wild Wiggler', icon: '🐛', stats: { speed: 3, acceleration: 4, weight: 2, handling: 4, traction: 4 }, unlocked: true },
        { id: 'teddy_buggy', name: 'Teddy Buggy', icon: '🧸', stats: { speed: 2, acceleration: 4, weight: 2, handling: 4, traction: 5 }, unlocked: true },
        { id: 'bone_rattler', name: 'Bone Rattler', icon: '🦴', stats: { speed: 5, acceleration: 1, weight: 5, handling: 1, traction: 5 }, unlocked: false },
        { id: 'splat_atv', name: 'Splat ATV', icon: '🎨', stats: { speed: 3, acceleration: 3, weight: 4, handling: 2, traction: 5 }, unlocked: false, dlc: true }
    ],
    
    wheels: [
        { id: 'standard', name: 'Standard', icon: '⭕', stats: { speed: 0, acceleration: 0, weight: 0, handling: 0, traction: 0 }, unlocked: true },
        { id: 'monster', name: 'Monster', icon: '🔵', stats: { speed: -1, acceleration: -1, weight: 2, handling: -1, traction: 2 }, unlocked: true },
        { id: 'roller', name: 'Roller', icon: '🟡', stats: { speed: -2, acceleration: 2, weight: -2, handling: 2, traction: 1 }, unlocked: true },
        { id: 'slim', name: 'Slim', icon: '➖', stats: { speed: 1, acceleration: -1, weight: 0, handling: 1, traction: -2 }, unlocked: true },
        { id: 'slick', name: 'Slick', icon: '⚫', stats: { speed: 2, acceleration: -2, weight: 1, handling: -1, traction: -3 }, unlocked: false },
        { id: 'metal', name: 'Metal', icon: '⚪', stats: { speed: 1, acceleration: -2, weight: 2, handling: -1, traction: 1 }, unlocked: false },
        { id: 'button', name: 'Button', icon: '🔘', stats: { speed: -2, acceleration: 2, weight: -2, handling: 2, traction: 2 }, unlocked: true },
        { id: 'off_road', name: 'Off-Road', icon: '🟤', stats: { speed: -1, acceleration: 0, weight: 1, handling: -1, traction: 3 }, unlocked: true },
        { id: 'sponge', name: 'Sponge', icon: '🧽', stats: { speed: -2, acceleration: 1, weight: -1, handling: 2, traction: 2 }, unlocked: false },
        { id: 'wood', name: 'Wood', icon: '🪵', stats: { speed: 0, acceleration: 1, weight: 0, handling: 1, traction: 0 }, unlocked: false },
        { id: 'cushion', name: 'Cushion', icon: '🛋️', stats: { speed: -1, acceleration: 1, weight: -1, handling: 2, traction: 1 }, unlocked: true },
        { id: 'blue_standard', name: 'Blue Standard', icon: '🔵', stats: { speed: 0, acceleration: 0, weight: 0, handling: 0, traction: 0 }, unlocked: true },
        { id: 'hot_monster', name: 'Hot Monster', icon: '🔴', stats: { speed: -1, acceleration: -1, weight: 2, handling: -1, traction: 2 }, unlocked: false },
        { id: 'azure_roller', name: 'Azure Roller', icon: '🟦', stats: { speed: -2, acceleration: 2, weight: -2, handling: 2, traction: 1 }, unlocked: false },
        { id: 'gold_tires', name: 'Gold Tires', icon: '🥇', stats: { speed: 1, acceleration: 0, weight: 1, handling: 0, traction: 0 }, unlocked: false, isGold: true },
        { id: 'triforce_tires', name: 'Triforce Tires', icon: '🔱', stats: { speed: 0, acceleration: 0, weight: 1, handling: 0, traction: 1 }, unlocked: false, dlc: true }
    ],
    
    gliders: [
        { id: 'super_glider', name: 'Super Glider', icon: '🪂', stats: { speed: 0, acceleration: 0, weight: 0, handling: 0, traction: 0 }, unlocked: true },
        { id: 'cloud_glider', name: 'Cloud Glider', icon: '☁️', stats: { speed: 0, acceleration: 1, weight: -1, handling: 1, traction: 0 }, unlocked: true },
        { id: 'wario_wing', name: 'Wario Wing', icon: '💛', stats: { speed: 1, acceleration: -1, weight: 1, handling: 0, traction: 0 }, unlocked: false },
        { id: 'waddle_wing', name: 'Waddle Wing', icon: '🐧', stats: { speed: 0, acceleration: 1, weight: -1, handling: 1, traction: 1 }, unlocked: true },
        { id: 'peach_parasol', name: 'Peach Parasol', icon: '☂️', stats: { speed: -1, acceleration: 1, weight: -1, handling: 1, traction: 1 }, unlocked: false },
        { id: 'parachute', name: 'Parachute', icon: '🪂', stats: { speed: -1, acceleration: 1, weight: 0, handling: 1, traction: 1 }, unlocked: true },
        { id: 'parafoil', name: 'Parafoil', icon: '🌈', stats: { speed: 0, acceleration: 0, weight: 0, handling: 1, traction: 1 }, unlocked: false },
        { id: 'flower_glider', name: 'Flower Glider', icon: '🌸', stats: { speed: 0, acceleration: 1, weight: -1, handling: 1, traction: 0 }, unlocked: false },
        { id: 'bowser_kite', name: 'Bowser Kite', icon: '🪁', stats: { speed: 1, acceleration: -1, weight: 1, handling: -1, traction: 1 }, unlocked: false },
        { id: 'mktv_parafoil', name: 'MKTV Parafoil', icon: '📺', stats: { speed: 0, acceleration: 0, weight: 0, handling: 1, traction: 1 }, unlocked: false },
        { id: 'gold_glider', name: 'Gold Glider', icon: '🥇', stats: { speed: 1, acceleration: 0, weight: 0, handling: 0, traction: 0 }, unlocked: false, isGold: true },
        { id: 'hylian_kite', name: 'Hylian Kite', icon: '🛡️', stats: { speed: 0, acceleration: 1, weight: 0, handling: 0, traction: 1 }, unlocked: false, dlc: true }
    ],
    
    getAllBodies() {
        return [...this.karts, ...this.bikes, ...this.atvs];
    },
    
    getAllWheels() {
        return this.wheels;
    },
    
    getAllGliders() {
        return this.gliders;
    },
    
    getPart(type, id) {
        switch (type) {
            case 'body':
                return this.getAllBodies().find(b => b.id === id);
            case 'wheels':
                return this.wheels.find(w => w.id === id);
            case 'gliders':
            case 'glider':
                return this.gliders.find(g => g.id === id);
            default:
                return null;
        }
    },
    
    getUnlocked(type) {
        switch (type) {
            case 'body':
                return this.getAllBodies().filter(b => b.unlocked);
            case 'wheels':
                return this.wheels.filter(w => w.unlocked);
            case 'gliders':
                return this.gliders.filter(g => g.unlocked);
            default:
                return [];
        }
    }
};

export default VEHICLES;
