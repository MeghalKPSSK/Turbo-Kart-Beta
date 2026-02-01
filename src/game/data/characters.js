// ========================================
// TURBO KART RACING - Character Data
// ========================================

export const CHARACTER_COLORS = {
    baby_mario: 0xff4444,
    baby_luigi: 0x44ff44,
    baby_peach: 0xffaacc,
    baby_daisy: 0xffaa44,
    baby_rosalina: 0x88ccff,
    lemmy: 0x44ffff,
    dry_bones: 0xddddcc,
    toad: 0xff6644,
    toadette: 0xff66aa,
    koopa: 0x44cc44,
    lakitu: 0xffff44,
    shy_guy: 0xff4444,
    larry: 0x4488ff,
    wendy: 0xff44ff,
    isabelle: 0xffcc44,
    villager: 0x88cc88,
    mario: 0xff0000,
    luigi: 0x00ff00,
    peach: 0xffaacc,
    daisy: 0xffaa00,
    yoshi: 0x44ff44,
    iggy: 0x88ff44,
    ludwig: 0x4444ff,
    cat_peach: 0xffcc88,
    tanooki_mario: 0xaa6633,
    inkling_girl: 0xff8844,
    inkling_boy: 0x44aaff,
    link: 0x44aa44,
    rosalina: 0x88ccff,
    metal_mario: 0xaabbcc,
    pink_gold_peach: 0xffaacc,
    donkey_kong: 0x885522,
    waluigi: 0x6644aa,
    roy: 0xff44aa,
    wario: 0xffff00,
    bowser: 0xff8800,
    morton: 0x888888,
    dry_bowser: 0x888877
};

export const CHARACTERS = {
    roster: [
        // ===== FEATHER WEIGHT =====
        {
            id: 'baby_mario',
            name: 'Baby Mario',
            icon: '👶🔴',
            emoji: '👶',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'baby_luigi',
            name: 'Baby Luigi',
            icon: '👶🟢',
            emoji: '👶',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'baby_peach',
            name: 'Baby Peach',
            icon: '👶🩷',
            emoji: '👶',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'baby_daisy',
            name: 'Baby Daisy',
            icon: '👶🧡',
            emoji: '👶',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 4 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'baby_rosalina',
            name: 'Baby Rosalina',
            icon: '👶💫',
            emoji: '👶',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 4 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'lemmy',
            name: 'Lemmy',
            icon: '🤡',
            emoji: '🎪',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'dry_bones',
            name: 'Dry Bones',
            icon: '💀',
            emoji: '🦴',
            weightClass: 'FEATHER',
            stats: { speed: 2, acceleration: 5, weight: 1, handling: 5, traction: 5 },
            unlocked: false,
            dlc: false
        },
        
        // ===== LIGHT WEIGHT =====
        {
            id: 'toad',
            name: 'Toad',
            icon: '🍄😊',
            emoji: '🍄',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 5, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'toadette',
            name: 'Toadette',
            icon: '🍄🎀',
            emoji: '🎀',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 5, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'koopa',
            name: 'Koopa Troopa',
            icon: '🐢',
            emoji: '🐢',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 4, traction: 5 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'lakitu',
            name: 'Lakitu',
            icon: '☁️',
            emoji: '☁️',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 5, traction: 3 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'shy_guy',
            name: 'Shy Guy',
            icon: '👺',
            emoji: '👺',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 4, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'larry',
            name: 'Larry',
            icon: '💙',
            emoji: '💙',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 4, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'wendy',
            name: 'Wendy',
            icon: '🎀💜',
            emoji: '💜',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 4, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'isabelle',
            name: 'Isabelle',
            icon: '🐕',
            emoji: '🐕',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 5, weight: 2, handling: 5, traction: 3 },
            unlocked: false,
            dlc: true
        },
        {
            id: 'villager',
            name: 'Villager',
            icon: '🏠',
            emoji: '🏠',
            weightClass: 'LIGHT',
            stats: { speed: 3, acceleration: 4, weight: 2, handling: 4, traction: 5 },
            unlocked: false,
            dlc: true
        },
        
        // ===== MEDIUM WEIGHT =====
        {
            id: 'mario',
            name: 'Mario',
            icon: '🔴Ⓜ️',
            emoji: '🔴',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 3, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'luigi',
            name: 'Luigi',
            icon: '🟢Ⓛ',
            emoji: '🟢',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 4, traction: 3 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'peach',
            name: 'Princess Peach',
            icon: '👑🩷',
            emoji: '👑',
            weightClass: 'MEDIUM',
            stats: { speed: 3, acceleration: 4, weight: 3, handling: 4, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'daisy',
            name: 'Princess Daisy',
            icon: '👑🧡',
            emoji: '🌼',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 4, traction: 3 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'yoshi',
            name: 'Yoshi',
            icon: '🦎💚',
            emoji: '🦎',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 4, weight: 3, handling: 3, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'iggy',
            name: 'Iggy',
            icon: '🤪',
            emoji: '🤪',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 3, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'ludwig',
            name: 'Ludwig',
            icon: '🎼',
            emoji: '🎼',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 3, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'cat_peach',
            name: 'Cat Peach',
            icon: '🐱👑',
            emoji: '🐱',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 4, weight: 3, handling: 4, traction: 3 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'tanooki_mario',
            name: 'Tanooki Mario',
            icon: '🦝🔴',
            emoji: '🦝',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 3, traction: 4 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'inkling_girl',
            name: 'Inkling Girl',
            icon: '🦑',
            emoji: '🦑',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 4, traction: 3 },
            unlocked: false,
            dlc: true
        },
        {
            id: 'inkling_boy',
            name: 'Inkling Boy',
            icon: '🦑💙',
            emoji: '🦑',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 4, traction: 3 },
            unlocked: false,
            dlc: true
        },
        {
            id: 'link',
            name: 'Link',
            icon: '🗡️',
            emoji: '🗡️',
            weightClass: 'MEDIUM',
            stats: { speed: 4, acceleration: 3, weight: 3, handling: 3, traction: 4 },
            unlocked: false,
            dlc: true
        },
        
        // ===== CRUISER WEIGHT =====
        {
            id: 'rosalina',
            name: 'Rosalina',
            icon: '✨👑',
            emoji: '✨',
            weightClass: 'CRUISER',
            stats: { speed: 4, acceleration: 2, weight: 4, handling: 3, traction: 4 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'metal_mario',
            name: 'Metal Mario',
            icon: '🤖',
            emoji: '🤖',
            weightClass: 'CRUISER',
            stats: { speed: 5, acceleration: 2, weight: 4, handling: 2, traction: 4 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'pink_gold_peach',
            name: 'Pink Gold Peach',
            icon: '💗',
            emoji: '💗',
            weightClass: 'CRUISER',
            stats: { speed: 5, acceleration: 2, weight: 4, handling: 2, traction: 4 },
            unlocked: false,
            dlc: false
        },
        {
            id: 'donkey_kong',
            name: 'Donkey Kong',
            icon: '🦍',
            emoji: '🦍',
            weightClass: 'CRUISER',
            stats: { speed: 4, acceleration: 2, weight: 4, handling: 3, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'waluigi',
            name: 'Waluigi',
            icon: '💜',
            emoji: '💜',
            weightClass: 'CRUISER',
            stats: { speed: 5, acceleration: 2, weight: 4, handling: 3, traction: 3 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'roy',
            name: 'Roy',
            icon: '😎',
            emoji: '😎',
            weightClass: 'CRUISER',
            stats: { speed: 4, acceleration: 2, weight: 4, handling: 3, traction: 4 },
            unlocked: true,
            dlc: false
        },
        
        // ===== HEAVY WEIGHT =====
        {
            id: 'wario',
            name: 'Wario',
            icon: '💛',
            emoji: '💛',
            weightClass: 'HEAVY',
            stats: { speed: 5, acceleration: 1, weight: 5, handling: 2, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'bowser',
            name: 'Bowser',
            icon: '🐢🔥',
            emoji: '🔥',
            weightClass: 'HEAVY',
            stats: { speed: 5, acceleration: 1, weight: 5, handling: 2, traction: 3 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'morton',
            name: 'Morton',
            icon: '⭐',
            emoji: '⭐',
            weightClass: 'HEAVY',
            stats: { speed: 5, acceleration: 1, weight: 5, handling: 2, traction: 4 },
            unlocked: true,
            dlc: false
        },
        {
            id: 'dry_bowser',
            name: 'Dry Bowser',
            icon: '💀🔥',
            emoji: '💀',
            weightClass: 'HEAVY',
            stats: { speed: 5, acceleration: 1, weight: 5, handling: 2, traction: 3 },
            unlocked: false,
            dlc: false
        }
    ],
    
    getCharacter(id) {
        return this.roster.find(c => c.id === id);
    },
    
    getAllCharacters() {
        return this.roster;
    },
    
    getByWeightClass(weightClass) {
        return this.roster.filter(c => c.weightClass === weightClass);
    },
    
    getUnlocked() {
        return this.roster.filter(c => c.unlocked);
    },
    
    getColor(id) {
        return CHARACTER_COLORS[id] || 0x888888;
    }
};

export default CHARACTERS;
