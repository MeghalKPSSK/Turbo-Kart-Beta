import { ROAD_TRACKS } from '../game/data/roadRacing';
import { CreditChip, SetupHeader } from '../components/Chrome';
import { pad2 } from '../utils/format';

export default function CourseScreen({ profile, chapter, storyStage, vehicle, track, trackOptions, onTrack, onBack, onStart }) {
    const story = Boolean(chapter);
    return (
        <section className="setup-screen course-screen">
            <SetupHeader back={story ? 'STORY' : 'GARAGE'} onBack={onBack} eyebrow={story ? `STORY CHAPTER ${pad2(storyStage + 1)} · ${chapter.crew}` : 'OPEN EVENT'} title={story ? chapter.title.toUpperCase() : 'CHOOSE YOUR ROAD'}><CreditChip credits={profile.credits} /></SetupHeader>
            <div className="course-heading"><div><span>{story ? `RIVAL · ${chapter.rival.toUpperCase()}` : `INDEPENDENT CIRCUITS · ${ROAD_TRACKS.length} ROUTES`}</span><p>{story ? chapter.briefing : 'Every course is a closed race loop with its own terrain, pacing, and risk.'}</p></div><div className="course-loadout"><span>{vehicle.type}</span><b>{vehicle.name}</b></div></div>
            <div className="course-grid">
                {trackOptions.map((item) => (
                    <button key={item.id} className={`course-card ${item.id === track.id ? 'selected' : ''}`} style={{ '--course-tone': item.tone, '--course-sky': item.sky }} onClick={() => onTrack(item.id)}>
                        <div className="course-card-art"><div className="course-art-ridge" /><div className="course-art-road" /><span className="course-number">{pad2(ROAD_TRACKS.indexOf(item) + 1)}</span><span className="course-grade">{item.grade}</span></div>
                        <div className="course-info"><small>{item.region} · {item.biome}</small><b>{item.name}</b><p>{item.description}</p><div><span>{item.laps} LAPS</span><span>ROAD RACE</span></div></div>
                    </button>
                ))}
            </div>
            <div className="course-launch-bar"><div><span>{story ? `TARGET · ${chapter.goal === 1 ? 'WIN THE EVENT' : `FINISH TOP ${chapter.goal}`}` : 'SELECTED ROUTE'}</span><b>{track.name}</b></div><button className="button-primary" onClick={onStart}>{story ? 'RACE CHAPTER' : 'ENTER THE RACE'} <span>↗</span></button></div>
        </section>
    );
}
