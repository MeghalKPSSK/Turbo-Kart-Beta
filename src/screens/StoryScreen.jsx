import { ROAD_CAMPAIGN, ROAD_TRACKS } from '../game/data/roadRacing';
import { SetupHeader, Wallet } from '../components/Chrome';
import { pad2 } from '../utils/format';

export default function StoryScreen({ profile, storyStage, onSelect, onBack, onBuild }) {
    const reached = profile.storyStage || 0;
    const selected = ROAD_CAMPAIGN[storyStage];
    return (
        <section className="setup-screen story-screen">
            <SetupHeader back="LEAGUE" onBack={onBack} eyebrow="TURBO ROAD LEAGUE · STORY CAMPAIGN" title="ROAD TO THE CROWN"><Wallet profile={profile} /></SetupHeader>
            <div className="story-intro">
                <div><span>YOUR CREW · GRIDBREAKERS</span><h2>{profile.storyComplete ? 'THE CROWN IS YOURS' : 'Eight chapters. One road crown.'}</h2><p>{profile.storyComplete ? 'You have cleared the whole championship. Replay any unlocked event or chase a cleaner finish.' : 'Start with a rookie run, earn your way through the crews, then take on the championship finale.'}</p></div>
                <b>{profile.storyComplete ? pad2(ROAD_CAMPAIGN.length) : pad2(Math.min(reached + 1, ROAD_CAMPAIGN.length))} / {pad2(ROAD_CAMPAIGN.length)}<small>CHAPTERS</small></b>
            </div>
            <div className="story-grid">
                {ROAD_CAMPAIGN.map((item, index) => {
                    const unlocked = index <= reached || profile.storyComplete;
                    const cleared = profile.storyComplete || index < reached;
                    const chapterTrack = ROAD_TRACKS.find((candidate) => candidate.id === item.trackId);
                    return (
                        <button key={item.id} className={`story-card ${index === storyStage ? 'selected' : ''} ${unlocked ? '' : 'locked'}`} disabled={!unlocked} onClick={() => onSelect(index)} style={{ '--course-tone': chapterTrack.tone, '--course-sky': chapterTrack.sky }}>
                            <div className="story-card-art"><div className="course-art-ridge" /><div className="course-art-road" /><span>CHAPTER {pad2(index + 1)}</span><b>{unlocked ? (cleared ? 'CLEARED' : 'UNLOCKED') : 'LOCKED'}</b></div>
                            <div className="story-card-copy"><small>{item.crew} · {chapterTrack.biome}</small><strong>{item.title}</strong><p>{item.chapter}</p><div><span>RIVAL · {item.rival.toUpperCase()}</span><span>{item.goal === 1 ? 'WIN' : `TOP ${item.goal}`}</span></div></div>
                        </button>
                    );
                })}
            </div>
            <div className="story-launch"><div><span>SELECTED CHAPTER</span><b>{selected.title} · {selected.briefing}</b></div><button className="button-primary" onClick={onBuild}>BUILD YOUR RIDE <span>↗</span></button></div>
        </section>
    );
}
