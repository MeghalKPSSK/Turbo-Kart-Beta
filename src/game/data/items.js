// ========================================
// TURBO KART RACING - Item System
// ========================================

import { GAME_CONSTANTS } from '../constants';

export const ITEMS = {
    types: {
        // ===== OFFENSIVE ITEMS =====
        banana: {
            id: 'banana',
            name: 'Banana',
            icon: '🍌',
            type: 'trap',
            description: 'Drop behind to make opponents spin out.',
            canHold: true,
            canThrowForward: true,
            canThrowBackward: true
        },
        triple_banana: {
            id: 'triple_banana',
            name: 'Triple Bananas',
            icon: '🍌🍌🍌',
            type: 'trap',
            description: 'Three bananas that orbit your kart.',
            canHold: true,
            count: 3
        },
        green_shell: {
            id: 'green_shell',
            name: 'Green Shell',
            icon: '🟢',
            type: 'projectile',
            description: 'Shoots straight and bounces off walls.',
            canHold: true,
            canThrowForward: true,
            canThrowBackward: true,
            speed: 60,
            bounces: 5
        },
        triple_green_shell: {
            id: 'triple_green_shell',
            name: 'Triple Green Shells',
            icon: '🟢🟢🟢',
            type: 'projectile',
            description: 'Three green shells orbiting your kart.',
            canHold: true,
            count: 3
        },
        red_shell: {
            id: 'red_shell',
            name: 'Red Shell',
            icon: '🔴',
            type: 'homing',
            description: 'Homes in on the racer ahead of you.',
            canHold: true,
            canThrowForward: true,
            speed: 70,
            homingStrength: 0.8
        },
        triple_red_shell: {
            id: 'triple_red_shell',
            name: 'Triple Red Shells',
            icon: '🔴🔴🔴',
            type: 'homing',
            description: 'Three homing red shells.',
            canHold: true,
            count: 3
        },
        blue_shell: {
            id: 'blue_shell',
            name: 'Blue Shell',
            icon: '💙',
            type: 'special_homing',
            description: 'Seeks out and explodes on the race leader!',
            canHold: false,
            explosionRadius: 8
        },
        bob_omb: {
            id: 'bob_omb',
            name: 'Bob-omb',
            icon: '💣',
            type: 'explosive',
            description: 'Explodes on impact or after a timer.',
            canHold: true,
            canThrowForward: true,
            canThrowBackward: true,
            fuseTime: 3,
            explosionRadius: 6
        },
        
        // ===== BOOST ITEMS =====
        mushroom: {
            id: 'mushroom',
            name: 'Mushroom',
            icon: '🍄',
            type: 'boost',
            description: 'Gives a short speed boost.',
            boostPower: 1.5,
            boostDuration: 1.0
        },
        triple_mushroom: {
            id: 'triple_mushroom',
            name: 'Triple Mushrooms',
            icon: '🍄🍄🍄',
            type: 'boost',
            description: 'Three mushroom boosts to use.',
            boostPower: 1.5,
            boostDuration: 1.0,
            count: 3
        },
        golden_mushroom: {
            id: 'golden_mushroom',
            name: 'Golden Mushroom',
            icon: '🌟🍄',
            type: 'boost_unlimited',
            description: 'Unlimited boosts for a short time!',
            boostPower: 1.5,
            boostDuration: 0.5,
            totalDuration: 7.0
        },
        star: {
            id: 'star',
            name: 'Super Star',
            icon: '⭐',
            type: 'invincibility',
            description: 'Invincible and faster for a short time!',
            duration: 8.0,
            speedBoost: 1.3,
            knockbackOthers: true
        },
        bullet_bill: {
            id: 'bullet_bill',
            name: 'Bullet Bill',
            icon: '🚀',
            type: 'autopilot',
            description: 'Transform and zoom past opponents!',
            duration: 8.0,
            speed: 120,
            invincible: true
        },
        
        // ===== DEFENSIVE ITEMS =====
        super_horn: {
            id: 'super_horn',
            name: 'Super Horn',
            icon: '📯',
            type: 'shockwave',
            description: 'Destroys nearby items and spins out racers.',
            radius: 8,
            canDestroyBlueShell: true
        },
        
        // ===== SPECIAL ITEMS =====
        lightning: {
            id: 'lightning',
            name: 'Lightning',
            icon: '⚡',
            type: 'global',
            description: 'Shrinks and slows all other racers!',
            duration: 8.0,
            shrinkScale: 0.5,
            speedReduction: 0.6
        },
        blooper: {
            id: 'blooper',
            name: 'Blooper',
            icon: '🦑',
            type: 'obstruction',
            description: 'Sprays ink on racers ahead, blocking vision.',
            duration: 5.0
        },
        piranha_plant: {
            id: 'piranha_plant',
            name: 'Piranha Plant',
            icon: '🌱',
            type: 'attack',
            description: 'Chomps forward, hitting racers and giving boosts.',
            duration: 10.0,
            attackInterval: 0.8,
            boostPower: 1.2
        },
        boomerang: {
            id: 'boomerang',
            name: 'Boomerang Flower',
            icon: '🪃',
            type: 'projectile_returning',
            description: 'Throw up to three times - it comes back!',
            uses: 3,
            speed: 50,
            range: 30
        },
        fire_flower: {
            id: 'fire_flower',
            name: 'Fire Flower',
            icon: '🔥',
            type: 'projectile_multi',
            description: 'Shoot fireballs that bounce along the track.',
            shots: 10,
            shotInterval: 0.3,
            speed: 40
        },
        coin: {
            id: 'coin',
            name: 'Coin',
            icon: '🪙',
            type: 'passive',
            description: 'Gives you two coins.',
            coinAmount: 2
        },
        
        // ===== BATTLE MODE ITEMS =====
        feather: {
            id: 'feather',
            name: 'Feather',
            icon: '🪶',
            type: 'jump',
            description: 'Jump high into the air!',
            jumpPower: 15,
            battleOnly: true
        }
    },
    
    getItem(id) {
        return this.types[id];
    },
    
    getRandomItem(position, _totalRacers = 12, battleMode = false) {
        const probabilities = GAME_CONSTANTS.ITEMS.ITEM_PROBABILITY;
        const positionIndex = Math.min(position - 1, 11);
        
        const weightedItems = [];
        
        for (const [itemId, weights] of Object.entries(probabilities)) {
            const item = this.types[itemId];
            if (!item) continue;
            if (item.battleOnly && !battleMode) continue;
            
            const weight = weights[positionIndex] || 0;
            if (weight > 0) {
                weightedItems.push({ id: itemId, weight: weight });
            }
        }
        
        const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
        
        let random = Math.random() * totalWeight;
        for (const item of weightedItems) {
            random -= item.weight;
            if (random <= 0) {
                return this.types[item.id];
            }
        }
        
        return this.types.banana;
    },
    
    getAllItems() {
        return Object.values(this.types);
    },
    
    getByType(type) {
        return Object.values(this.types).filter(item => item.type === type);
    }
};

export default ITEMS;
