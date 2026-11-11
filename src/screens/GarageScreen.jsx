import { useMemo } from 'react';
import { PAINT_COLORS, ROAD_VEHICLES, UPGRADES, UPGRADE_MAX_LEVEL, upgradeCost } from '../game/data/roadRacing';
import { buildVehicleSpec, describeSpec } from '../game/physics/specs';
import RoadVehiclePreview from '../components/RoadVehiclePreview';
import { SetupHeader, Wallet } from '../components/Chrome';
import { pad2 } from '../utils/format';

const UPGRADE_NOW = {
    speed: (d) => `${d.topSpeedKmh} km/h`,
    accel: (d) => `0-100 in ${d.accel0to100.toFixed(1)}s`,
    handling: (d) => `${d.gripG.toFixed(2)} grip`,
    nitro: (d) => `${d.nitroSeconds.toFixed(1)}s burn · ${d.nitroTopSpeedKmh} km/h`,
    armor: (d) => `${d.durability}% durability`
};

function StatRow({ label, value }) {
    const safeValue = Math.min(10, Math.max(0, value));
    return (
        <div className="garage-stat">
            <span>{label}</span>
            <div className="garage-stat-track"><i style={{ width: `${safeValue / 10 * 100}%` }} /></div>
            <b>{safeValue}/10</b>
        </div>
    );
}

export default function GarageScreen({ profile, mode, vehicle, paint, category, upgrades, onCategory, onVehicle, onPaint, onUpgrade, onBack, onContinue }) {
    const garageVehicles = useMemo(() => ROAD_VEHICLES.filter((item) => item.type === category), [category]);
    const specNow = useMemo(() => buildVehicleSpec(vehicle, upgrades), [vehicle, upgrades]);
    const describeWith = (key, level) => describeSpec(buildVehicleSpec(vehicle, { ...upgrades, [key]: level }));
    const selectedPaint = PAINT_COLORS.find((item) => item.color === paint) || PAINT_COLORS[0];
    const coins = profile.roadCoins || 0;
    return (
        <section className="setup-screen garage-screen">
            <SetupHeader back="BACK" onBack={onBack} eyebrow="BUILD YOUR MACHINE" title="THE GARAGE"><Wallet profile={profile} /></SetupHeader>
            <div className="garage-layout">
                <div className="garage-preview-panel">
                    <div className="garage-scene-grid" />
                    <RoadVehiclePreview vehicle={vehicle} paint={paint} className="garage-model" />
                    <span className="garage-preview-badge">LIVE VEHICLE PREVIEW</span>
                    <div className="garage-model-caption"><span>{pad2(ROAD_VEHICLES.indexOf(vehicle) + 1)} / {pad2(ROAD_VEHICLES.length)}</span><b>{vehicle.name}</b><small>{vehicle.description}</small></div>
                </div>
                <div className="garage-controls">
                    <div className="section-kicker">01 / CHOOSE YOUR CLASS</div>
                    <div className="segmented-control">
                        {['BIKE', 'CAR'].map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => onCategory(item)}>{item === 'BIKE' ? 'BIKES' : 'CARS'}</button>)}
                    </div>
                    <div className="vehicle-card-grid">
                        {garageVehicles.map((item, index) => (
                            <button key={item.id} className={`vehicle-option ${item.id === vehicle.id ? 'selected' : ''}`} onClick={() => onVehicle(item)}>
                                <span className="option-index">{pad2(index + 1)}</span><span className="option-class">{item.type}</span>
                                <b>{item.name}</b><small>{item.description}</small>
                                <span className="option-arrow">↗</span>
                            </button>
                        ))}
                    </div>
                    <div className="garage-section-title"><span>02 / FINISH</span><b>{selectedPaint.name}</b></div>
                    <div className="paint-swatches" aria-label="Choose paint colour">
                        {PAINT_COLORS.map((item) => <button key={item.name} title={item.name} aria-label={item.name} className={paint === item.color ? 'selected' : ''} style={{ '--swatch': `#${item.color.toString(16).padStart(6, '0')}` }} onClick={() => onPaint(item.color)} />)}
                    </div>
                    <div className="garage-stats">
                        <div className="garage-section-title"><span>03 / PERFORMANCE</span><b>STOCK + UPGRADES</b></div>
                        <StatRow label="TOP SPEED" value={vehicle.stats.speed + (upgrades.speed || 0)} />
                        <StatRow label="ACCELERATION" value={vehicle.stats.acceleration + (upgrades.accel || 0)} />
                        <StatRow label="HANDLING" value={vehicle.stats.handling + (upgrades.handling || 0)} />
                        <StatRow label="DURABILITY" value={vehicle.stats.armor + (upgrades.armor || 0)} />
                    </div>
                    <div className="garage-section-title tune-heading"><span>04 / COIN UPGRADES</span><b>◈ {coins.toLocaleString()} COINS · SAVED PER VEHICLE</b></div>
                    <div className="upgrade-list">
                        {UPGRADES.map((upgrade) => {
                            const level = upgrades[upgrade.key] || 0;
                            const maxed = level >= UPGRADE_MAX_LEVEL;
                            const cost = upgradeCost(level);
                            const affordable = !maxed && coins >= cost;
                            const now = UPGRADE_NOW[upgrade.key](describeWith(upgrade.key, level));
                            const next = maxed ? null : UPGRADE_NOW[upgrade.key](describeWith(upgrade.key, level + 1));
                            return (
                                <div key={upgrade.key} className={`upgrade-row ${maxed ? 'maxed' : ''}`}>
                                    <div className="upgrade-name"><b>{upgrade.label}</b><small>{upgrade.detail}</small></div>
                                    <div className="upgrade-pips">{Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}</div>
                                    <div className="upgrade-effect">{now}{next && <> <span>→</span> <em>{next}</em></>}</div>
                                    <button className="upgrade-buy" disabled={!affordable} onClick={() => onUpgrade(upgrade.key)}>{maxed ? 'MAX' : `◈ ${cost}`}</button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="spec-readout"><span>{specNow.isBike ? 'BIKE' : 'CAR'} · {Math.round(specNow.mass)} KG</span><span>NITRO TOP SPEED {describeSpec(specNow).nitroTopSpeedKmh} KM/H</span></div>
                    <button className="button-primary garage-continue" onClick={onContinue}>{mode === 'story' ? 'ENTER CHAPTER' : 'PICK A ROUTE'} <span>↗</span></button>
                </div>
            </div>
        </section>
    );
}
