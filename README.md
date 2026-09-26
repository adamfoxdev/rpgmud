# Havenbrook — a modern DikuMUD in HTML5

A single-player, browser-based RPG MUD in the DikuMUD tradition. You still type commands like `kill rat`, `get all corpse` or `c 'magic missile' goblin`, and combat still runs in rounds. On top of that the game draws each room as an animated scene, maps the world as you explore it, and lets you click things instead of typing.

No build step, no dependencies. Open `index.html` in a browser and play.

## Playing

```sh
# Option 1: open the file directly
open index.html            # macOS  (or xdg-open / start)

# Option 2: serve it
python3 -m http.server 8000   # then visit http://localhost:8000
```

Create a hero (5 races, 4 classes, rolled attributes). The game starts you in the Temple of the Dawn. Type `help newbie` for tips.

### The classic part

- **Diku-style command parser.** Commands can be abbreviated (`l`, `k gob`, `con`, `eq`). You can target the second matching mob with `2.rat`, grab everything with `get all` or `get all.potion`, and put several commands on one line with `n;n;look`. Speedwalk works (`3n2e`), and `!` repeats your last command.
- **Rounds-based combat.** A round happens every 2 seconds. Hits are described with ROM-style damage verbs (*scratch → MUTILATE → === OBLITERATE ===*). You can `flee` (it costs some XP), set a `wimpy` threshold, and use skills (`kick`, `bash`, `backstab`, `sneak`), all of which cause command lag. Passive skills are parry, dodge, second/third attack and enhanced damage.
- **Magic.** Spells are spoken with the original Diku syllable garbling (`cure light` becomes *'judicandus dies'*). There are 17 spells, from magic missile to fireball and from cure light to sanctuary.
- **A living world.** Pulses handle aggression (1s), violence (2s), mob wandering (4s) and ticks (15s). Each tick regenerates HP, mana and moves (resting ×2, sleeping ×3, the inn room ×2 more), advances the day/night clock, runs down spell affects and decays corpses. The world resets every 4 ticks, respawning mobs and re-locking doors.
- **Progression.** 20 levels. You earn experience, get HP/mana/move gains on level-up, learn new skills at set levels, and practice them at the Guildhall. There are shops (`list`, `buy`, `sell`, `value`), corpses with loot, `autoloot`/`autogold`, and a locked door (the barrow gate) that needs a key from a boss.
- **Six areas, 51 rooms.** Havenbrook town, the sewers (levels 1–4), the Kingsroad wilds and Whisperwood (3–9), the Goblin Warrens (6–12), the Barrow Hills (8–12) and the Sunken Crypt (11–20). The final boss is Malthazar the Lich.

### The modern part

- **Scene view.** Each room gets a procedural backdrop based on its sector: city skyline, temple with a rose window, shops, sewers, forest with light shafts, hills and barrows, rivers and bridges, goblin caves, crypts. The sky follows the in-game clock through dawn, day, dusk and night. Torches and campfires flicker, and there are fireflies, falling leaves, drips, embers and crypt fog.
- **Animated combat.** Creatures lunge when they attack and flash when hit. Damage numbers float up, spells fly as projectiles, the screen shakes on big hits, and level-ups get a golden burst.
- **Auto-mapper.** The minimap draws the rooms you've explored, including doors (red means locked), stairs and unexplored exits. Click any explored room and your hero walks there along the shortest path. Zoom with the mouse wheel or the +/− buttons.
- **Click anything.** Clicking a creature in the scene opens a menu (look, consider, attack, backstab, cast…). Clicking an item or corpse offers get or loot. Exits in the text are links, and inventory and gear rows have their own action menus.
- **HUD.** HP/mana/move/XP bars, a tick timer, a target frame showing enemy health, context-aware quick actions (Flee, Loot, Rest, Wares…), and a hotbar of your skills and spells with cooldown overlay (Alt+1…9).
- **Input comforts.** Command history (↑/↓), Tab completion for commands, targets and spell names, numpad movement (8/2/4/6, 9 = up, 3 = down, 5 = look), and F1 for help.
- **Autosave** to `localStorage` every tick and when you close the tab. On return, the start screen offers **Continue**.
- **Responsive.** The layout stacks on phones.

## Project layout

```
index.html        page shell
css/style.css     styles
js/data.js        world data: areas, rooms, mobs, items, shops, resets, races, classes, spells, help
js/engine.js      DOM-free game engine (parser, combat, pulses, resets, save/load); emits events
js/scene.js       canvas scene renderer (backdrops, creatures, particles, combat FX)
js/minimap.js     canvas auto-mapper with click-to-travel
js/ui.js          DOM glue: terminal, input, panels, menus, creator, main loop
tests/            node:test suite for world integrity, gameplay and balance
```

The engine never touches the DOM. It takes command strings, advances when you call `update(dt)`, and emits events (`output`, `move`, `combat`, `spell`, `mobdeath`, `levelup`, …) that the scene, the minimap and the UI subscribe to. That makes it straightforward to test in Node, or to put a different front end on it.

### Adding content

Everything lives in `js/data.js`:

- **Rooms** have `x/y/z` grid coordinates and `exits`. An exit can carry a door: `{ to, door: 'iron gate', locked: true, key: 'i_crypt_key' }`.
- **Mobs** mostly derive their stats from `level`. Tune them with `hpMult`/`dmgMult`, and use the flags `aggressive`, `sentinel`, `peaceful`, `shopkeeper`, `guildmaster` and `caster`.
- **Resets** list one spawn slot per entry.

The test suite checks that every exit agrees with the room coordinates, that every exit has a matching exit back, that no two rooms share a map cell, and that every room can be reached. Run the tests whenever you change the map.

## Tests

```sh
npm test        # or: node --test tests/*.test.js
```
