# Turbo Kart Racing - Custom Music

Place your MP3 files in this folder to add them to the game's jukebox.

## How to Add Custom Music

1. Add your `.mp3` files to this folder
2. Create or edit `music-config.json` in this folder to configure your tracks

## music-config.json Format

```json
{
  "tracks": [
    {
      "id": "my_custom_track",
      "name": "My Custom Track",
      "file": "my_track.mp3",
      "bpm": 140,
      "category": "race",
      "assignTo": ["race"]
    }
  ]
}
```

## Track Categories

- `menu` - Main menu music
- `select` - Character/vehicle/track selection screens
- `countdown` - Pre-race countdown
- `race` - During racing
- `battle` - Battle mode
- `victory` - Results/scorecard screen

## assignTo Options

You can assign a track to play automatically at specific game states:
- `menu` - Main menu
- `character_select` - Character selection screen
- `vehicle_select` - Vehicle selection screen
- `track_select` - Track selection screen
- `countdown` - Race countdown
- `race` - During the race
- `battle` - Battle mode
- `victory` - Victory/results screen

Multiple assignments are allowed (e.g., `["menu", "character_select"]`)

## Example Configuration

```json
{
  "tracks": [
    {
      "id": "epic_race_theme",
      "name": "Epic Race Theme",
      "file": "epic_race.mp3",
      "bpm": 160,
      "category": "race",
      "assignTo": ["race"]
    },
    {
      "id": "chill_menu",
      "name": "Chill Menu Vibes",
      "file": "menu_music.mp3",
      "bpm": 90,
      "category": "menu",
      "assignTo": ["menu", "character_select"]
    }
  ]
}
```
