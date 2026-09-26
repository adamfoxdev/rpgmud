/* ==========================================================================
 * RPG MUD — world data
 * Rooms, mobiles, objects, shops, classes, races, spells and resets.
 * Coordinates: x grows east, y grows south, z grows up.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MUD = (root.MUD = root.MUD || {});

  /* ------------------------------------------------------------------ AREAS */
  const areas = {
    town:    { name: 'Havenbrook',          levels: 'all',   color: '#d9b36c' },
    sewers:  { name: 'Havenbrook Sewers',   levels: '1-4',   color: '#6f8f6a' },
    wilds:   { name: 'The Kingsroad Wilds', levels: '3-9',   color: '#7fae5b' },
    warrens: { name: 'The Goblin Warrens',  levels: '6-12',  color: '#b0764a' },
    hills:   { name: 'The Barrow Hills',    levels: '8-12',  color: '#a9a27a' },
    crypt:   { name: 'The Sunken Crypt',    levels: '11-20', color: '#7a6fb0' },
  };

  /* ------------------------------------------------------------------ ROOMS */
  // sector: city | inside | sewer | road | field | forest | hills | cave | crypt | water
  const rooms = {
    /* ---------------- Havenbrook ---------------- */
    t_altar: {
      area: 'town', sector: 'inside', x: 0, y: -3, z: 0, flags: ['safe'],
      name: 'The Altar of Dawn',
      desc: 'A great altar of white marble rises before you, its surface warm as if touched by an unseen sun. Golden light spills through a rose window high above, painting the flagstones in shades of amber and rose. Pilgrims have left small offerings of bread and flowers at its base.',
      exits: { s: 't_temple' },
    },
    t_temple: {
      area: 'town', sector: 'inside', x: 0, y: -2, z: 0, flags: ['safe', 'recall'],
      name: 'Temple of the Dawn',
      desc: 'Tall pillars carved like sheaves of wheat hold up a vaulted ceiling in this serene temple. Wooden pews face north toward the altar, and the smell of incense hangs in the air. Adventurers who fall in battle often wake here, blinking, with no memory of how they arrived.',
      exits: { n: 't_altar', s: 't_square' },
    },
    t_square: {
      area: 'town', sector: 'city', x: 0, y: -1, z: 0,
      name: 'Havenbrook Square',
      desc: 'The heart of Havenbrook bustles around a great bronze fountain shaped like a leaping stag. Market rows stretch east and west, the temple steps rise to the north, and Lantern Street runs south toward the city gate. A rusted iron grate in the cobbles leads down into the sewers.',
      exits: { n: 't_temple', e: 't_market_e', s: 't_main', w: 't_market_w', d: 's_entry' },
    },
    t_market_w: {
      area: 'town', sector: 'city', x: -1, y: -1, z: 0,
      name: 'West Market Row',
      desc: 'Colorful awnings shade stalls selling everything from turnips to tin whistles. The ring of a smith\'s hammer comes from a shop to the west, while a crooked sign to the south shows a bubbling flask.',
      exits: { e: 't_square', w: 't_weapons', s: 't_alchemist' },
    },
    t_weapons: {
      area: 'town', sector: 'inside', x: -2, y: -1, z: 0, flags: ['safe'],
      name: 'Brannoc\'s Blades',
      desc: 'Racks of swords, axes and maces line the walls of this cramped, forge-warm shop. A glowing hearth dominates the back wall, and the floor is gritty with iron filings. Type LIST to see what is for sale.',
      exits: { e: 't_market_w' },
    },
    t_alchemist: {
      area: 'town', sector: 'inside', x: -1, y: 0, z: 0, flags: ['safe'],
      name: 'The Bubbling Flask',
      desc: 'Shelves of glass vials glitter in every color imaginable. Something green simmers in a copper alembic, filling the shop with a smell like mint and burnt sugar. Type LIST to see what is for sale.',
      exits: { n: 't_market_w', e: 't_main' },
    },
    t_market_e: {
      area: 'town', sector: 'city', x: 1, y: -1, z: 0,
      name: 'East Market Row',
      desc: 'Merchants hawk cloth, spices and cured meats from sturdy wooden stalls. To the east, a shield painted with an iron bull hangs over the door of an armory. The warm glow of a tavern beckons from the south.',
      exits: { w: 't_square', e: 't_armory', s: 't_inn' },
    },
    t_armory: {
      area: 'town', sector: 'inside', x: 2, y: -1, z: 0, flags: ['safe'],
      name: 'Ironhide Armory',
      desc: 'Suits of mail stand like silent sentries around this well-kept shop. Helms, gauntlets and shields hang from pegs, each polished to a mirror shine. Type LIST to see what is for sale.',
      exits: { w: 't_market_e' },
    },
    t_inn: {
      area: 'town', sector: 'inside', x: 1, y: 0, z: 0, flags: ['safe'],
      name: 'The Gilded Tankard',
      desc: 'Laughter and the clatter of tankards fill this low-beamed common room. A fire crackles in a wide stone hearth, and a bard in the corner tunes a battered lute. A narrow staircase leads up to rented rooms. Type LIST to see what the barkeep offers.',
      exits: { n: 't_market_e', w: 't_main', u: 't_inn_room' },
    },
    t_inn_room: {
      area: 'town', sector: 'inside', x: 1, y: 0, z: 1, flags: ['safe', 'restful'],
      name: 'A Cozy Room at the Tankard',
      desc: 'A feather bed, a washbasin and a small window overlooking the street make up this snug room. It is the perfect place to REST or SLEEP and recover your strength far faster than out in the wilds.',
      exits: { d: 't_inn' },
    },
    t_main: {
      area: 'town', sector: 'city', x: 0, y: 0, z: 0,
      name: 'Lantern Street',
      desc: 'Iron lanterns on tall posts line this broad cobbled avenue. The square lies to the north, and the street continues south toward the city gate. The doors of the alchemist and the Gilded Tankard stand to the west and east.',
      exits: { n: 't_square', e: 't_inn', s: 't_main_s', w: 't_alchemist' },
    },
    t_main_s: {
      area: 'town', sector: 'city', x: 0, y: 1, z: 0,
      name: 'Lantern Street, South',
      desc: 'The street grows quieter here. To the west stands the timber-framed Adventurers\' Guildhall, its door carved with crossed swords and a staff. The guard barracks lie to the east, and the south gate looms ahead.',
      exits: { n: 't_main', e: 't_barracks', s: 't_gate', w: 't_guild' },
    },
    t_guild: {
      area: 'town', sector: 'inside', x: -1, y: 1, z: 0, flags: ['safe'],
      name: 'Adventurers\' Guildhall',
      desc: 'Training dummies, weapon racks and shelves of dusty spellbooks fill this spacious hall. A notice board is crowded with bounties for goblins, wolves and worse. Here you may PRACTICE the skills and spells you have learned.',
      exits: { e: 't_main_s' },
    },
    t_barracks: {
      area: 'town', sector: 'inside', x: 1, y: 1, z: 0, flags: ['safe'],
      name: 'Guard Barracks',
      desc: 'Rows of neatly made cots line the walls of this austere barracks. A rack of spears stands by the door and a map of the surrounding lands is pinned to a table, marked with ominous red crosses near the eastern hills.',
      exits: { w: 't_main_s' },
    },
    t_gate: {
      area: 'town', sector: 'city', x: 0, y: 2, z: 0,
      name: 'South Gate of Havenbrook',
      desc: 'Massive oak gates bound in iron stand open beneath a crenellated gatehouse. Beyond them the Kingsroad winds south into green country. Travelers pass in and out under the watchful eyes of the city guard.',
      exits: { n: 't_main_s', s: 'r_road1' },
    },

    /* ---------------- Sewers ---------------- */
    s_entry: {
      area: 'sewers', sector: 'sewer', x: 0, y: -1, z: -1,
      name: 'Sewer Access',
      desc: 'A rusty ladder descends from the grate above into a brick chamber slick with slime. The stench is overpowering. Tunnels lead off to the east and west, and something small skitters away in the darkness.',
      exits: { u: 't_square', e: 's_tunnel1', w: 's_tunnel2' },
    },
    s_tunnel1: {
      area: 'sewers', sector: 'sewer', x: 1, y: -1, z: -1,
      name: 'Dripping Tunnel',
      desc: 'Water drips steadily from the arched ceiling into a sluggish channel of filth. Gnawed bones and scraps of cloth litter the narrow walkway.',
      exits: { w: 's_entry', e: 's_junction' },
    },
    s_junction: {
      area: 'sewers', sector: 'sewer', x: 2, y: -1, z: -1,
      name: 'Flooded Junction',
      desc: 'Several channels meet here in a knee-deep pool of murky water. A heap of refuse to the south seems to be moving... or perhaps it is only the many red eyes watching from within.',
      exits: { w: 's_tunnel1', s: 's_nest' },
    },
    s_nest: {
      area: 'sewers', sector: 'sewer', x: 2, y: 0, z: -1,
      name: 'Rat King\'s Nest',
      desc: 'A mound of garbage, rags and stolen trinkets forms a crude throne in this foul chamber. The squeaking here is deafening, and the walls seem to crawl with fur.',
      exits: { n: 's_junction' },
    },
    s_tunnel2: {
      area: 'sewers', sector: 'sewer', x: -1, y: -1, z: -1,
      name: 'Mossy Culvert',
      desc: 'Pale luminous moss grows thick on the curved walls of this old culvert, casting an eerie glow. The channel here runs clearer, heading west toward an older part of the sewers.',
      exits: { e: 's_entry', w: 's_cistern' },
    },
    s_cistern: {
      area: 'sewers', sector: 'sewer', x: -2, y: -1, z: -1,
      name: 'The Old Cistern',
      desc: 'A vast round cistern, long since dry, echoes with every footstep. Its stone floor is coated in a glistening green film that seems to pulse gently.',
      exits: { e: 's_tunnel2' },
    },

    /* ---------------- Kingsroad & Whisperwood ---------------- */
    r_road1: {
      area: 'wilds', sector: 'road', x: 0, y: 3, z: 0,
      name: 'The Kingsroad',
      desc: 'A well-worn dirt road runs between hedgerows bright with wildflowers. The walls of Havenbrook rise to the north, while the road continues south toward a fork.',
      exits: { n: 't_gate', s: 'r_fork' },
    },
    r_fork: {
      area: 'wilds', sector: 'road', x: 0, y: 4, z: 0,
      name: 'Kingsroad Fork',
      desc: 'A weathered signpost stands at this crossroads. Its arms read: "WHISPERWOOD" to the west, "BARROW HILLS - TURN BACK" to the east, and "MILLFORD" to the south. Someone has scratched a crude goblin face under the western sign.',
      exits: { n: 'r_road1', e: 'h_path1', s: 'r_road3', w: 'f_edge' },
    },
    r_road3: {
      area: 'wilds', sector: 'road', x: 0, y: 5, z: 0,
      name: 'Kingsroad, by the Old Mill',
      desc: 'The road dips toward a river here. To the east, the skeleton of a burned-out mill leans over the water, its great wheel long still. The road continues south onto an old stone bridge.',
      exits: { n: 'r_fork', e: 'r_mill', s: 'r_bridge' },
    },
    r_mill: {
      area: 'wilds', sector: 'field', x: 1, y: 5, z: 0,
      name: 'The Ruined Mill',
      desc: 'Charred beams and tumbled stones are all that remain of the old mill. Someone has made camp among the ruins: a fire pit, stolen crates, and bedrolls. Bandits, by the look of it.',
      exits: { w: 'r_road3' },
    },
    r_bridge: {
      area: 'wilds', sector: 'water', x: 0, y: 6, z: 0,
      name: 'Old Stone Bridge',
      desc: 'This ancient bridge arches over a swift, dark river. Beyond it, the road has collapsed into the water, washed away in some long-ago flood. A muddy path winds down beneath the bridge, where something large has been gnawing on bones.',
      exits: { n: 'r_road3', d: 'r_under' },
    },
    r_under: {
      area: 'wilds', sector: 'water', x: 0, y: 6, z: -1,
      name: 'Beneath the Bridge',
      desc: 'The rushing water is loud beneath the dripping stone arch. A nest of rags, bones and rusted armor fills the dry bank. It reeks of wet fur and old meat.',
      exits: { u: 'r_bridge' },
    },
    f_edge: {
      area: 'wilds', sector: 'forest', x: -1, y: 4, z: 0,
      name: 'Edge of the Whisperwood',
      desc: 'Ancient oaks mark the edge of the Whisperwood. The wind in their leaves sounds almost like voices murmuring secrets. A trail leads west into the green gloom, and the Kingsroad lies east.',
      exits: { e: 'r_fork', w: 'f_trail' },
    },
    f_trail: {
      area: 'wilds', sector: 'forest', x: -2, y: 4, z: 0,
      name: 'Whisperwood Trail',
      desc: 'Ferns crowd the narrow trail and moss hangs from low branches. Sunlight filters down in shifting golden shafts. A gap in the trees to the north opens into a bright glade.',
      exits: { e: 'f_edge', n: 'f_glade', w: 'f_deep' },
    },
    f_glade: {
      area: 'wilds', sector: 'field', x: -2, y: 3, z: 0,
      name: 'Sunlit Glade',
      desc: 'A peaceful clearing carpeted in soft grass and clover. Butterflies drift between the wildflowers and a small spring bubbles up from beneath a mossy stone.',
      exits: { s: 'f_trail' },
    },
    f_deep: {
      area: 'wilds', sector: 'forest', x: -3, y: 4, z: 0,
      name: 'Deep Whisperwood',
      desc: 'The trees grow so close here that barely any light reaches the forest floor. Strange mushrooms glow faintly among the roots. Thick webs glisten to the south, and a howl echoes from the west.',
      exits: { e: 'f_trail', s: 'f_thicket', w: 'f_hollow' },
    },
    f_thicket: {
      area: 'wilds', sector: 'forest', x: -3, y: 5, z: 0,
      name: 'Webbed Thicket',
      desc: 'Silken webs as thick as rope stretch between the trees, festooned with the husks of unlucky animals. Something with too many legs shifts in the canopy above.',
      exits: { n: 'f_deep' },
    },
    f_hollow: {
      area: 'wilds', sector: 'forest', x: -4, y: 4, z: 0,
      name: 'Wolfden Hollow',
      desc: 'A rocky hollow among the roots of an enormous dead oak. Tufts of grey fur cling to the brambles and the ground is churned with paw prints. To the west, a dark cleft in the hillside is marked with crude goblin totems.',
      exits: { e: 'f_deep', w: 'g_mouth' },
    },

    /* ---------------- Goblin Warrens ---------------- */
    g_mouth: {
      area: 'warrens', sector: 'cave', x: -5, y: 4, z: 0,
      name: 'Mouth of the Warrens',
      desc: 'A jagged cave mouth yawns in the hillside, flanked by poles topped with animal skulls. The smell of smoke and unwashed goblin drifts up from a rough-hewn shaft leading down.',
      exits: { e: 'f_hollow', d: 'g_tunnel' },
    },
    g_tunnel: {
      area: 'warrens', sector: 'cave', x: -5, y: 4, z: -1,
      name: 'Narrow Tunnel',
      desc: 'This cramped tunnel was clearly dug by small hands. Guttering torches jammed into cracks throw long, dancing shadows. Passages lead west and south.',
      exits: { u: 'g_mouth', w: 'g_guardroom', s: 'g_pens' },
    },
    g_pens: {
      area: 'warrens', sector: 'cave', x: -5, y: 5, z: -1,
      name: 'The Slave Pens',
      desc: 'Crude wooden cages line the walls of this damp chamber. Most are empty, their doors hanging open. The floor is scattered with straw and broken chains.',
      exits: { n: 'g_tunnel' },
    },
    g_guardroom: {
      area: 'warrens', sector: 'cave', x: -6, y: 4, z: -1,
      name: 'Goblin Guardroom',
      desc: 'Overturned stools and a table covered in dice and gnawed bones fill this smoky room. Rusty weapons lean against the walls. The passage continues west toward the sound of drums.',
      exits: { e: 'g_tunnel', w: 'g_hall' },
    },
    g_hall: {
      area: 'warrens', sector: 'cave', x: -7, y: 4, z: -1,
      name: 'Great Hall of the Warrens',
      desc: 'A huge natural cavern where a bonfire roars in a pit at the center. Goblin drums pound from somewhere unseen. A curtain of bones rattles over a passage to the north, and a crude throne room lies to the west.',
      exits: { e: 'g_guardroom', n: 'g_shaman', w: 'g_throne' },
    },
    g_shaman: {
      area: 'warrens', sector: 'cave', x: -7, y: 3, z: -1,
      name: 'Shaman\'s Den',
      desc: 'Bundles of herbs, bones and feathers dangle from the low ceiling. A bubbling cauldron gives off noxious purple fumes, and strange glyphs are daubed on the walls in something that is probably blood.',
      exits: { s: 'g_hall' },
    },
    g_throne: {
      area: 'warrens', sector: 'cave', x: -8, y: 4, z: -1,
      name: 'Throne of Grukk',
      desc: 'A towering throne built of stolen furniture, shields and bones dominates this chamber. Piles of loot glitter in the torchlight: coins, candlesticks, and an iron-bound chest.',
      exits: { e: 'g_hall' },
    },

    /* ---------------- Barrow Hills ---------------- */
    h_path1: {
      area: 'hills', sector: 'hills', x: 1, y: 4, z: 0,
      name: 'Barrow Path',
      desc: 'The road east climbs into bleak hills where the grass grows grey and brittle. Crows watch from a leaning waystone carved with faded warnings.',
      exits: { w: 'r_fork', e: 'h_hills' },
    },
    h_hills: {
      area: 'hills', sector: 'hills', x: 2, y: 4, z: 0,
      name: 'Windswept Hills',
      desc: 'A cold wind moans across the hilltops. Ancient burial mounds rise from the earth all around, and one to the east is larger than the rest, its entrance sealed with an iron gate. A rocky ridge rises to the north.',
      exits: { w: 'h_path1', n: 'h_ridge', e: 'h_barrow' },
    },
    h_ridge: {
      area: 'hills', sector: 'hills', x: 2, y: 3, z: 0,
      name: 'Lonely Ridge',
      desc: 'From this rocky ridge you can see for miles: the towers of Havenbrook to the northwest, the dark Whisperwood to the west, and the brooding barrows below. Deep claw marks score the boulders.',
      exits: { s: 'h_hills' },
    },
    h_barrow: {
      area: 'hills', sector: 'hills', x: 3, y: 4, z: 0,
      name: 'The Great Barrow',
      desc: 'A massive grass-covered mound looms here, ringed by standing stones etched with runes. Stone steps descend into the barrow, barred by a heavy iron gate. An icy draft seeps from below.',
      exits: { w: 'h_hills', d: { to: 'c_stair', door: 'iron gate', locked: true, key: 'i_crypt_key' } },
    },

    /* ---------------- Sunken Crypt ---------------- */
    c_stair: {
      area: 'crypt', sector: 'crypt', x: 3, y: 4, z: -1,
      name: 'Crypt Stairs',
      desc: 'Worn steps descend into a cold stone passage. Your breath mists in the air. The walls are lined with niches holding crumbling urns, and a faint green light glows from the east.',
      exits: { u: { to: 'h_barrow', door: 'iron gate', locked: true, key: 'i_crypt_key' }, e: 'c_bones' },
    },
    c_bones: {
      area: 'crypt', sector: 'crypt', x: 4, y: 4, z: -1,
      name: 'Hall of Bones',
      desc: 'Skulls are stacked floor to ceiling along both walls of this long hall, their empty sockets following your every move. A sickly green fog curls around your ankles.',
      exits: { w: 'c_stair', e: 'c_flooded', s: 'c_ossuary' },
    },
    c_ossuary: {
      area: 'crypt', sector: 'crypt', x: 4, y: 5, z: -1,
      name: 'The Ossuary',
      desc: 'Bones of every kind are heaped in great drifts across this chamber. Some of the piles seem to shift and settle on their own.',
      exits: { n: 'c_bones' },
    },
    c_flooded: {
      area: 'crypt', sector: 'crypt', x: 5, y: 4, z: -1,
      name: 'Flooded Crypt',
      desc: 'Black water covers the floor of this sunken chamber, hiding what lies beneath. Stone sarcophagi rise from the water like islands, their lids pushed aside. A grand tomb lies north, and cold light pulses from a sanctum to the east.',
      exits: { w: 'c_bones', n: 'c_tomb', e: 'c_sanctum' },
    },
    c_tomb: {
      area: 'crypt', sector: 'crypt', x: 5, y: 3, z: -1,
      name: 'Tomb of the Forgotten Knight',
      desc: 'A stone effigy of a knight lies atop a great sarcophagus, sword clasped to its chest. Tattered banners hang from the walls, their heraldry faded beyond recognition. The sarcophagus lid lies shattered on the floor.',
      exits: { s: 'c_flooded' },
    },
    c_sanctum: {
      area: 'crypt', sector: 'crypt', x: 6, y: 4, z: -1,
      name: 'Sanctum of Malthazar',
      desc: 'Arcane circles blaze with violet fire across the floor of this vast chamber. Floating candles drip black wax, and a throne of fused bone stands at the far end. The air crackles with necromantic power.',
      exits: { w: 'c_flooded' },
    },
  };

  /* ------------------------------------------------------------------ MOBILES
   * flags: aggressive, sentinel (never wanders), shopkeeper, guildmaster,
   *        peaceful (cannot be attacked), caster
   */
  const mobs = {
    // Town
    m_priest: { name: 'brother aldous priest', short: 'Brother Aldous', long: 'Brother Aldous, the temple priest, tends the candles here.', level: 30, icon: '🧑‍🦳', flags: ['sentinel', 'peaceful'],
      desc: 'A kindly old man in saffron robes, his face lined with laughter. His eyes hold a deep, quiet strength.',
      talk: ['"Fear not death, child. The Dawn returns all who fall in her service to this very temple."', '"Type RECALL anywhere to pray for passage back here, so long as you are not locked in battle."', '"The sewers beneath the square are a fine place for new adventurers to test their mettle."'] },
    m_brannoc: { name: 'brannoc smith weaponsmith', short: 'Brannoc the weaponsmith', long: 'Brannoc the weaponsmith hammers at a glowing blade.', level: 30, icon: '🧔', flags: ['sentinel', 'peaceful', 'shopkeeper'],
      desc: 'A barrel-chested dwarf with a braided beard singed at the tips. His forearms are thick as tree roots.',
      talk: ['"Best steel this side of the mountains! Have a LIST, see what catches your eye."', '"A dagger is fine for a thief, but a warrior wants something with heft."'] },
    m_mira: { name: 'mira alchemist', short: 'Mira the alchemist', long: 'Mira the alchemist peers at you through thick spectacles.', level: 30, icon: '👩‍🔬', flags: ['sentinel', 'peaceful', 'shopkeeper'],
      desc: 'A wiry young woman with ink-stained fingers and eyebrows that have clearly been singed off more than once.',
      talk: ['"Red for wounds, blue for the mind. Always carry a few before you go poking around in caves."', '"I will pay good coin for spider silk and other curiosities."'] },
    m_torvald: { name: 'torvald armorer', short: 'Torvald the armorer', long: 'Torvald the armorer polishes a steel breastplate.', level: 30, icon: '👨‍🔧', flags: ['sentinel', 'peaceful', 'shopkeeper'],
      desc: 'A tall, grizzled man with a soldier\'s bearing and a scar across his cheek.',
      talk: ['"Armor is cheaper than a funeral. WEAR what you buy!"', '"The Forgotten Knight in the crypt still wears the finest mail I ever saw. Pity about the undeath."'] },
    m_barkeep: { name: 'barkeep hilda', short: 'Hilda the barkeep', long: 'Hilda the barkeep wipes down the bar with a rag.', level: 25, icon: '👩‍🍳', flags: ['sentinel', 'peaceful', 'shopkeeper'],
      desc: 'A stout, rosy-cheeked woman who looks like she could toss a drunk ogre out on her own.',
      talk: ['"Rooms are upstairs, free for adventurers. You\'ll rest twice as fast in a proper bed."', '"Heard bandits took over the old mill south of the fork. Nasty business."'] },
    m_guildmaster: { name: 'guildmaster renna', short: 'Guildmaster Renna', long: 'Guildmaster Renna studies the bounty board.', level: 35, icon: '🧝‍♀️', flags: ['sentinel', 'peaceful', 'guildmaster'],
      desc: 'An elven woman in practical leathers with a longbow over her shoulder and a spellbook at her hip. She has trained adventurers for three human lifetimes.',
      talk: ['"Type PRACTICE to see your skills. Each practice session sharpens one of them."', '"The goblin king Grukk carries the key to the Great Barrow. Slay him, and the crypt lies open... if you dare."', '"Malthazar the Lich stirs in the Sunken Crypt. Do not face him before you have seen many battles."'] },
    m_guard: { name: 'guard cityguard', short: 'a city guard', long: 'A city guard stands here, watching for trouble.', level: 12, icon: '💂', flags: ['peaceful'],
      desc: 'A burly guard in a tabard bearing the stag of Havenbrook. He carries a spear and looks like he knows how to use it.',
      talk: ['"Move along, citizen."', '"Wolves have been bold lately, out in the Whisperwood. Watch yourself."', '"The crosses on the barracks map? Graves opening up in the Barrow Hills. Stay clear."'] },
    m_dog: { name: 'dog stray mutt', short: 'a stray dog', long: 'A scruffy stray dog sniffs around for scraps.', level: 1, icon: '🐕', flags: [],
      desc: 'A mangy mutt with one floppy ear and a hopeful expression.', gold: [0, 1] },
    m_beggar: { name: 'beggar old man', short: 'an old beggar', long: 'An old beggar holds out a trembling hand.', level: 1, icon: '🧓', flags: ['sentinel'],
      desc: 'Rags hang off his thin frame. His eyes are sharp, though, and he seems to notice everything.',
      talk: ['"Spare a copper? ...No? Then heed this, for free: the Rat King in the sewers wears a crown worth having."', '"They say the troll under the bridge has a hoard. They also say it eats people."'] },

    // Sewers
    m_rat: { name: 'rat sewer', short: 'a sewer rat', long: 'A sewer rat scurries through the muck.', level: 1, icon: '🐀', flags: [],
      desc: 'A fat brown rat with yellow teeth and a naked pink tail.', gold: [0, 2] },
    m_giantrat: { name: 'rat giant', short: 'a giant rat', long: 'A giant rat bares its yellowed fangs at you.', level: 2, icon: '🐀', flags: ['aggressive'],
      desc: 'This rat is the size of a small dog, with matted fur and a mean glint in its eye.', gold: [1, 4] },
    m_slime: { name: 'slime green ooze', short: 'a green slime', long: 'A green slime quivers on the floor.', level: 3, icon: '🟢', flags: ['sentinel'],
      desc: 'A translucent blob of green ooze. You can see a few half-dissolved coins floating inside it.', gold: [4, 12], hit: 'slime' },
    m_ratking: { name: 'rat king', short: 'the Rat King', long: 'The Rat King sits upon his throne of garbage, tails knotted together.', level: 5, icon: '👑', flags: ['sentinel', 'aggressive'], hpMult: 1.3,
      desc: 'A horror of a dozen rats fused together at the tails, wearing a crude crown. Its many mouths squeal in unison.',
      gold: [15, 30], loot: [['i_ratcrown', 1], ['i_potion_red', 0.5]] },

    // Wilds
    m_deer: { name: 'deer white tailed', short: 'a white-tailed deer', long: 'A white-tailed deer grazes peacefully here.', level: 2, icon: '🦌', flags: [],
      desc: 'A graceful doe with soft brown eyes. It watches you warily, ready to bolt.' },
    m_wolf: { name: 'wolf grey', short: 'a grey wolf', long: 'A grey wolf stalks through the trees, hackles raised.', level: 4, icon: '🐺', flags: ['aggressive'], hit: 'bite',
      desc: 'A lean grey wolf with amber eyes and a hungry look.', loot: [['i_wolfpelt', 0.15]] },
    m_greyfang: { name: 'greyfang wolf leader', short: 'Greyfang', long: 'Greyfang, the pack leader, guards the hollow with a low growl.', level: 7, icon: '🐺', flags: ['aggressive', 'sentinel'], hit: 'bite', hpMult: 1.4,
      desc: 'An enormous silver-grey wolf, scarred from countless fights. It is easily the size of a pony.', loot: [['i_wolfpelt', 1], ['i_fangcharm', 0.6]] },
    m_spider: { name: 'spider giant', short: 'a giant spider', long: 'A giant spider descends on a thread of silk.', level: 6, icon: '🕷️', flags: ['aggressive', 'sentinel'], hit: 'bite',
      desc: 'A hairy black spider as large as a cart wheel, venom dripping from its fangs.', loot: [['i_silk', 0.6]] },
    m_bandit: { name: 'bandit scruffy', short: 'a scruffy bandit', long: 'A scruffy bandit sharpens a knife by the fire.', level: 5, icon: '🥷', flags: ['aggressive', 'sentinel'],
      desc: 'A rough-looking man with a scar and a grin missing several teeth.', gold: [8, 20], loot: [['i_dagger', 0.3], ['i_potion_red', 0.2]],
      talk: ['"Your gold or your life!"'] },
    m_jack: { name: 'jack scarlet bandit leader', short: 'Scarlet Jack', long: 'Scarlet Jack, the bandit leader, lounges on a stolen crate.', level: 8, icon: '🏴‍☠️', flags: ['aggressive', 'sentinel'], hpMult: 1.4,
      desc: 'A dashing rogue in a faded crimson coat, a cutlass at his hip and a sneer on his lips.', gold: [40, 80], loot: [['i_cutlass', 1], ['i_leather_boots', 0.4]] },
    m_troll: { name: 'troll bridge', short: 'a bridge troll', long: 'A hulking bridge troll squats here, gnawing on a thigh bone.', level: 9, icon: '🧌', flags: ['aggressive', 'sentinel'], hpMult: 1.5,
      desc: 'Green, warty and smelling of the river bottom, the troll is nearly twice your height.', gold: [30, 90], loot: [['i_trollclub', 0.8], ['i_potion_green', 0.4]] },

    // Warrens
    m_goblin: { name: 'goblin warrior', short: 'a goblin warrior', long: 'A goblin warrior snarls and brandishes a rusty blade.', level: 6, icon: '👺', flags: ['aggressive'],
      desc: 'A wiry green creature with pointed ears, needle teeth and a crude scimitar.', gold: [4, 14], loot: [['i_scimitar', 0.15], ['i_potion_red', 0.15]] },
    m_archer: { name: 'goblin archer', short: 'a goblin archer', long: 'A goblin archer squints at you from the shadows.', level: 7, icon: '🏹', flags: ['aggressive'],
      desc: 'This goblin carries a short bow and a quiver of crooked arrows.', gold: [6, 16], hit: 'shot' },
    m_captive: { name: 'captive prisoner farmer', short: 'a frightened captive', long: 'A frightened captive huddles in the corner of a cage.', level: 2, icon: '🧑‍🌾', flags: ['sentinel', 'peaceful'],
      desc: 'A thin farmer with rope burns on his wrists. He looks at you with desperate hope.',
      talk: ['"Please... the goblin king, Grukk, keeps the key to the old barrow around his neck. He says the dead there will serve him one day."', '"Kill him and you\'ll be doing the whole valley a kindness."'] },
    m_shaman: { name: 'goblin shaman', short: 'a goblin shaman', long: 'A goblin shaman stirs a bubbling cauldron, muttering.', level: 9, icon: '🧙', flags: ['aggressive', 'sentinel', 'caster'], spells: ['magic missile', 'cure light'],
      desc: 'A hunched old goblin draped in feathers and bones. Its eyes glow faintly purple.', gold: [15, 35], loot: [['i_totem', 0.7], ['i_potion_blue', 0.5]] },
    m_grukk: { name: 'grukk goblin king', short: 'Grukk the Goblin King', long: 'Grukk the Goblin King lounges on his throne of junk, glaring.', level: 12, icon: '👹', flags: ['aggressive', 'sentinel'], hpMult: 1.45,
      desc: 'Huge for a goblin, Grukk wears a dented crown and wields a cleaver as long as you are tall. A heavy iron key hangs on a chain around his neck.',
      gold: [80, 150], loot: [['i_crypt_key', 1], ['i_cleaver', 0.7], ['i_potion_green', 0.5]] },

    // Hills
    m_crow: { name: 'crow carrion', short: 'a carrion crow', long: 'A carrion crow eyes you from a waystone.', level: 3, icon: '🐦‍⬛', flags: [], hit: 'peck',
      desc: 'A big black crow with a cruel beak.' },
    m_owlbear: { name: 'owlbear', short: 'an owlbear', long: 'An owlbear hoots menacingly and rears up on its hind legs.', level: 10, icon: '🐻', flags: ['aggressive', 'sentinel'], hpMult: 1.4, hit: 'claw',
      desc: 'A monstrous hybrid with the body of a bear and the head of a great horned owl.', loot: [['i_owlhide', 0.7]] },
    m_barrowwight: { name: 'barrow wight', short: 'a barrow wight', long: 'A barrow wight drifts between the mounds, moaning softly.', level: 10, icon: '👻', flags: ['aggressive'], hit: 'chill',
      desc: 'A pale, wavering figure in rotted grave-clothes. Its eyes burn with cold blue fire.', gold: [10, 30] },

    // Crypt
    m_skeleton: { name: 'skeleton rattling', short: 'a rattling skeleton', long: 'A rattling skeleton lurches toward you, sword raised.', level: 11, icon: '💀', flags: ['aggressive'],
      desc: 'Yellowed bones held together by dark magic. A notched sword is clutched in its bony hand.', gold: [5, 25], loot: [['i_bonering', 0.1]] },
    m_zombie: { name: 'zombie bloated', short: 'a bloated zombie', long: 'A bloated zombie shambles through the water.', level: 12, icon: '🧟', flags: ['aggressive'],
      desc: 'Swollen and grey, this corpse moves with horrible purpose. The smell is unbearable.', gold: [5, 20], loot: [['i_potion_red', 0.3]] },
    m_ghoul: { name: 'ghoul', short: 'a ravenous ghoul', long: 'A ravenous ghoul crouches over a pile of bones.', level: 13, icon: '🧟‍♂️', flags: ['aggressive', 'sentinel'], hit: 'claw',
      desc: 'Gaunt and grey-skinned, with long claws and a lolling tongue.', gold: [10, 40] },
    m_knight: { name: 'forgotten knight', short: 'the Forgotten Knight', long: 'The Forgotten Knight stands guard over his tomb, eyes burning.', level: 15, icon: '⚔️', flags: ['aggressive', 'sentinel'], hpMult: 1.5,
      desc: 'An armored figure whose visor reveals only darkness and two points of cold light. His mail is finely wrought beneath centuries of grime.',
      gold: [60, 120], loot: [['i_knightblade', 1], ['i_knightmail', 0.7], ['i_potion_green', 0.5]] },
    m_lich: { name: 'malthazar lich', short: 'Malthazar the Lich', long: 'Malthazar the Lich hovers above his bone throne, wreathed in violet flame.', level: 18, icon: '☠️', flags: ['aggressive', 'sentinel', 'caster'], hpMult: 1.6,
      spells: ['chill touch', 'lightning bolt', 'fireball'],
      desc: 'A skeletal sorcerer in rotting robes of midnight velvet. A crown of black iron sits upon his skull, and his fingers crackle with dark energy.',
      gold: [300, 500], loot: [['i_lichstaff', 1], ['i_phylactery', 1], ['i_potion_green', 1]] },
  };

  /* ------------------------------------------------------------------ OBJECTS
   * type: weapon | armor | potion | key | treasure | furniture
   * wear: wield | head | body | legs | feet | hands | shield | neck | finger
   */
  const items = {
    // Weapons
    i_dagger:      { name: 'dagger rusty', short: 'a rusty dagger', long: 'A rusty dagger lies in the dirt.', type: 'weapon', wear: 'wield', dice: [1, 5], mods: { hit: 1 }, noun: 'stab', cost: 10, icon: '🗡️' },
    i_shortsword:  { name: 'sword short', short: 'a short sword', long: 'A short sword lies here.', type: 'weapon', wear: 'wield', dice: [1, 6], noun: 'slash', cost: 40, icon: '🗡️' },
    i_staff:       { name: 'staff quarterstaff oak', short: 'an oak quarterstaff', long: 'An oak quarterstaff leans against the wall.', type: 'weapon', wear: 'wield', dice: [1, 6], noun: 'smash', cost: 30, mods: { mana: 10 }, icon: '🦯' },
    i_mace:        { name: 'mace iron', short: 'an iron mace', long: 'An iron mace lies here.', type: 'weapon', wear: 'wield', dice: [2, 3], noun: 'crush', cost: 60, icon: '🔨' },
    i_longsword:   { name: 'longsword sword long', short: 'a longsword', long: 'A gleaming longsword lies here.', type: 'weapon', wear: 'wield', dice: [1, 9], noun: 'slash', cost: 120, level: 3, icon: '⚔️' },
    i_axe:         { name: 'axe battle', short: 'a battle axe', long: 'A heavy battle axe lies here.', type: 'weapon', wear: 'wield', dice: [1, 12], noun: 'cleave', cost: 260, level: 6, icon: '🪓' },
    i_warhammer:   { name: 'warhammer hammer dwarven', short: 'a dwarven warhammer', long: 'A dwarven warhammer rests here.', type: 'weapon', wear: 'wield', dice: [2, 7], noun: 'pound', cost: 600, level: 10, mods: { dam: 1 }, icon: '🔨' },
    i_cutlass:     { name: 'cutlass notched', short: 'Scarlet Jack\'s cutlass', long: 'A notched cutlass lies here.', type: 'weapon', wear: 'wield', dice: [2, 5], noun: 'slash', cost: 180, mods: { hit: 2 }, icon: '🗡️' },
    i_scimitar:    { name: 'scimitar goblin crude', short: 'a crude goblin scimitar', long: 'A crude goblin scimitar lies here.', type: 'weapon', wear: 'wield', dice: [2, 4], noun: 'slash', cost: 70, icon: '🗡️' },
    i_trollclub:   { name: 'club troll knotted', short: 'a knotted troll club', long: 'An enormous knotted club lies here.', type: 'weapon', wear: 'wield', dice: [2, 8], noun: 'pound', cost: 220, level: 7, mods: { dam: 1 }, icon: '🏏' },
    i_cleaver:     { name: 'cleaver grukk', short: 'Grukk\'s cleaver', long: 'A huge, bloodstained cleaver lies here.', type: 'weapon', wear: 'wield', dice: [3, 6], noun: 'cleave', cost: 700, level: 10, mods: { dam: 2, hit: 1 }, icon: '🪓' },
    i_knightblade: { name: 'blade sword knight forgotten', short: 'the Forgotten Knight\'s blade', long: 'A pale, rune-etched blade lies here, humming faintly.', type: 'weapon', wear: 'wield', dice: [4, 6], noun: 'slash', cost: 1800, level: 13, mods: { dam: 3, hit: 3 }, icon: '⚔️' },
    i_lichstaff:   { name: 'staff malthazar lich', short: 'the Staff of Malthazar', long: 'A staff of black bone crackles with violet energy here.', type: 'weapon', wear: 'wield', dice: [3, 8], noun: 'blast', cost: 3000, level: 15, mods: { mana: 60, int: 2, hit: 2, dam: 2 }, icon: '🪄' },

    // Armor
    i_leather_cap:    { name: 'cap leather', short: 'a leather cap', long: 'A leather cap lies here.', type: 'armor', wear: 'head', armor: 2, cost: 15, icon: '🧢' },
    i_leather_jerkin: { name: 'jerkin leather', short: 'a leather jerkin', long: 'A leather jerkin lies here.', type: 'armor', wear: 'body', armor: 4, cost: 40, icon: '🦺' },
    i_leather_pants:  { name: 'leggings leather pants', short: 'leather leggings', long: 'A pair of leather leggings lies here.', type: 'armor', wear: 'legs', armor: 2, cost: 25, icon: '👖' },
    i_leather_boots:  { name: 'boots leather', short: 'leather boots', long: 'A pair of leather boots stands here.', type: 'armor', wear: 'feet', armor: 2, cost: 20, icon: '🥾' },
    i_leather_gloves: { name: 'gloves leather', short: 'leather gloves', long: 'A pair of leather gloves lies here.', type: 'armor', wear: 'hands', armor: 1, cost: 15, icon: '🧤' },
    i_buckler:        { name: 'buckler shield wooden', short: 'a wooden buckler', long: 'A wooden buckler lies here.', type: 'armor', wear: 'shield', armor: 3, cost: 30, icon: '🛡️' },
    i_chainshirt:     { name: 'shirt chain mail', short: 'a chain shirt', long: 'A chain shirt lies here in a heap.', type: 'armor', wear: 'body', armor: 8, cost: 260, level: 5, icon: '🥋' },
    i_ironhelm:       { name: 'helm iron helmet', short: 'an iron helm', long: 'An iron helm lies here.', type: 'armor', wear: 'head', armor: 4, cost: 120, level: 4, icon: '⛑️' },
    i_chainlegs:      { name: 'leggings chain', short: 'chain leggings', long: 'A pair of chain leggings lies here.', type: 'armor', wear: 'legs', armor: 5, cost: 200, level: 6, icon: '👖' },
    i_gauntlets:      { name: 'gauntlets steel', short: 'steel gauntlets', long: 'A pair of steel gauntlets lies here.', type: 'armor', wear: 'hands', armor: 3, cost: 150, level: 6, icon: '🧤' },
    i_kiteshield:     { name: 'shield kite steel', short: 'a steel kite shield', long: 'A steel kite shield lies here.', type: 'armor', wear: 'shield', armor: 6, cost: 320, level: 8, icon: '🛡️' },
    i_platemail:      { name: 'plate breastplate armor', short: 'a steel breastplate', long: 'A steel breastplate lies here.', type: 'armor', wear: 'body', armor: 12, cost: 900, level: 12, icon: '🥋' },
    i_ratcrown:       { name: 'crown tails rat braided', short: 'a crown of braided rat tails', long: 'A disgusting crown of braided rat tails lies here.', type: 'armor', wear: 'head', armor: 3, cost: 80, mods: { hit: 1 }, icon: '👑' },
    i_wolfpelt:       { name: 'pelt wolf grey cloak', short: 'a grey wolf pelt', long: 'A grey wolf pelt lies here.', type: 'armor', wear: 'body', armor: 5, cost: 60, icon: '🧥' },
    i_fangcharm:      { name: 'charm fang necklace', short: 'a necklace of wolf fangs', long: 'A necklace of wolf fangs lies here.', type: 'armor', wear: 'neck', armor: 1, cost: 120, mods: { dam: 1, mv: 20 }, icon: '📿' },
    i_totem:          { name: 'totem bone fetish', short: 'a bone totem fetish', long: 'A small bone totem lies here.', type: 'armor', wear: 'neck', armor: 1, cost: 150, mods: { mana: 25, wis: 1 }, icon: '🦴' },
    i_owlhide:        { name: 'hide owlbear coat', short: 'an owlbear hide coat', long: 'A shaggy owlbear hide lies here.', type: 'armor', wear: 'body', armor: 10, cost: 400, level: 8, mods: { hp: 15 }, icon: '🧥' },
    i_bonering:       { name: 'ring bone', short: 'a ring of carved bone', long: 'A ring of carved bone lies here.', type: 'armor', wear: 'finger', armor: 2, cost: 250, mods: { hp: 10, mana: 10 }, icon: '💍' },
    i_silverring:     { name: 'ring silver protection', short: 'a silver ring of protection', long: 'A silver ring glints here.', type: 'armor', wear: 'finger', armor: 3, cost: 500, level: 5, icon: '💍' },
    i_knightmail:     { name: 'mail knight hauberk ancient', short: 'the Forgotten Knight\'s hauberk', long: 'An ancient hauberk of fine mail lies here.', type: 'armor', wear: 'body', armor: 16, cost: 2000, level: 13, mods: { hp: 30, str: 1 }, icon: '🥋' },

    // Consumables
    i_potion_red:   { name: 'potion red healing', short: 'a red potion', long: 'A small red potion lies here.', type: 'potion', effect: { hp: 30 }, cost: 30, icon: '🧪' },
    i_potion_blue:  { name: 'potion blue mana', short: 'a blue potion', long: 'A small blue potion lies here.', type: 'potion', effect: { mana: 35 }, cost: 40, icon: '🧪' },
    i_potion_green: { name: 'potion green draught greater', short: 'a green healing draught', long: 'A flask of green liquid lies here.', type: 'potion', effect: { hp: 90 }, cost: 110, icon: '🧪' },
    i_ale:          { name: 'ale mug', short: 'a mug of ale', long: 'A mug of ale sits here.', type: 'potion', effect: { mv: 40, hp: 5 }, cost: 5, icon: '🍺', drink: true },
    i_bread:        { name: 'bread loaf', short: 'a loaf of bread', long: 'A loaf of bread lies here.', type: 'potion', effect: { hp: 10, mv: 20 }, cost: 4, icon: '🍞', food: true },

    // Treasure / misc
    i_crypt_key:  { name: 'key iron heavy', short: 'a heavy iron key', long: 'A heavy iron key lies here.', type: 'key', cost: 1, icon: '🗝️' },
    i_silk:       { name: 'silk spider bundle', short: 'a bundle of spider silk', long: 'A bundle of shimmering spider silk lies here.', type: 'treasure', cost: 45, icon: '🧶' },
    i_phylactery: { name: 'phylactery cracked gem', short: 'a cracked phylactery', long: 'A cracked, faintly glowing gem lies here.', type: 'treasure', cost: 1500, icon: '💎' },
    i_candlestick:{ name: 'candlestick gold', short: 'a golden candlestick', long: 'A golden candlestick lies here.', type: 'treasure', cost: 90, icon: '🕯️' },
    i_fountain:   { name: 'fountain stag bronze', short: 'a bronze fountain', long: 'A great bronze fountain shaped like a leaping stag splashes merrily here.', type: 'furniture', noTake: true, icon: '⛲',
      desc: 'Water pours from the stag\'s mouth into a wide basin. Copper coins glint at the bottom, tossed in for luck.' },
    i_altar:      { name: 'altar marble white', short: 'the Altar of Dawn', long: 'A white marble altar glows softly with inner light.', type: 'furniture', noTake: true, icon: '⛪',
      desc: 'Carved into its face is a rising sun. You feel a gentle warmth as you look upon it.' },
    i_board:      { name: 'board notice bounty', short: 'a notice board', long: 'A notice board is crowded with bounties here.', type: 'furniture', noTake: true, icon: '📜',
      desc: 'BOUNTIES:\n  - The Rat King (sewers, below the square) .......... suggested level 3-5\n  - Greyfang & the wolves of the Whisperwood .......... level 5-7\n  - Scarlet Jack\'s bandits, old mill .................. level 6-8\n  - The bridge troll ................................... level 8-9\n  - Grukk the Goblin King, the Warrens (far west) ...... level 11-12\n  - Something ancient in the Barrow Hills .............. level 15+' },
    i_chest:      { name: 'chest iron bound', short: 'an iron-bound chest', long: 'An iron-bound chest sits among the loot, lid thrown open.', type: 'furniture', noTake: true, icon: '🧰',
      desc: 'Empty. Grukk seems to have spent it all already.' },
  };

  /* ------------------------------------------------------------------ SHOPS */
  const shops = {
    t_weapons:   { keeper: 'm_brannoc',  sells: ['i_dagger', 'i_shortsword', 'i_staff', 'i_mace', 'i_longsword', 'i_axe', 'i_warhammer'], buys: ['weapon'] },
    t_armory:    { keeper: 'm_torvald',  sells: ['i_leather_cap', 'i_leather_jerkin', 'i_leather_pants', 'i_leather_boots', 'i_leather_gloves', 'i_buckler', 'i_ironhelm', 'i_chainshirt', 'i_chainlegs', 'i_gauntlets', 'i_kiteshield', 'i_silverring', 'i_platemail'], buys: ['armor'] },
    t_alchemist: { keeper: 'm_mira',     sells: ['i_potion_red', 'i_potion_blue', 'i_potion_green'], buys: ['potion', 'treasure'] },
    t_inn:       { keeper: 'm_barkeep',  sells: ['i_ale', 'i_bread', 'i_potion_red'], buys: [] },
  };

  /* ------------------------------------------------------------------ RESETS
   * Each mob reset is a single spawn slot. Items reset onto the floor if absent.
   */
  const resets = [
    { mob: 'm_priest', room: 't_temple' },
    { mob: 'm_brannoc', room: 't_weapons' },
    { mob: 'm_mira', room: 't_alchemist' },
    { mob: 'm_torvald', room: 't_armory' },
    { mob: 'm_barkeep', room: 't_inn' },
    { mob: 'm_guildmaster', room: 't_guild' },
    { mob: 'm_guard', room: 't_gate' },
    { mob: 'm_guard', room: 't_barracks' },
    { mob: 'm_guard', room: 't_square' },
    { mob: 'm_dog', room: 't_market_w' },
    { mob: 'm_beggar', room: 't_square' },

    { mob: 'm_rat', room: 's_entry' },
    { mob: 'm_rat', room: 's_tunnel1' },
    { mob: 'm_rat', room: 's_tunnel2' },
    { mob: 'm_rat', room: 's_junction' },
    { mob: 'm_giantrat', room: 's_junction' },
    { mob: 'm_giantrat', room: 's_tunnel1' },
    { mob: 'm_slime', room: 's_cistern' },
    { mob: 'm_slime', room: 's_cistern' },
    { mob: 'm_ratking', room: 's_nest' },

    { mob: 'm_deer', room: 'f_glade' },
    { mob: 'm_deer', room: 'f_trail' },
    { mob: 'm_wolf', room: 'f_deep' },
    { mob: 'm_wolf', room: 'f_trail' },
    { mob: 'm_wolf', room: 'f_hollow' },
    { mob: 'm_greyfang', room: 'f_hollow' },
    { mob: 'm_spider', room: 'f_thicket' },
    { mob: 'm_spider', room: 'f_thicket' },
    { mob: 'm_bandit', room: 'r_mill' },
    { mob: 'm_bandit', room: 'r_mill' },
    { mob: 'm_jack', room: 'r_mill' },
    { mob: 'm_troll', room: 'r_under' },

    { mob: 'm_goblin', room: 'g_tunnel' },
    { mob: 'm_goblin', room: 'g_guardroom' },
    { mob: 'm_goblin', room: 'g_guardroom' },
    { mob: 'm_goblin', room: 'g_hall' },
    { mob: 'm_archer', room: 'g_hall' },
    { mob: 'm_archer', room: 'g_mouth' },
    { mob: 'm_captive', room: 'g_pens' },
    { mob: 'm_shaman', room: 'g_shaman' },
    { mob: 'm_grukk', room: 'g_throne' },

    { mob: 'm_crow', room: 'h_path1' },
    { mob: 'm_barrowwight', room: 'h_hills' },
    { mob: 'm_barrowwight', room: 'h_barrow' },
    { mob: 'm_owlbear', room: 'h_ridge' },

    { mob: 'm_skeleton', room: 'c_stair' },
    { mob: 'm_skeleton', room: 'c_bones' },
    { mob: 'm_skeleton', room: 'c_bones' },
    { mob: 'm_ghoul', room: 'c_ossuary' },
    { mob: 'm_zombie', room: 'c_flooded' },
    { mob: 'm_zombie', room: 'c_flooded' },
    { mob: 'm_knight', room: 'c_tomb' },
    { mob: 'm_lich', room: 'c_sanctum' },

    { item: 'i_fountain', room: 't_square' },
    { item: 'i_altar', room: 't_altar' },
    { item: 'i_board', room: 't_guild' },
    { item: 'i_chest', room: 'g_throne' },
    { item: 'i_candlestick', room: 'g_throne' },
    { item: 'i_leather_cap', room: 's_cistern' },
    { item: 'i_potion_red', room: 'f_glade' },
  ];

  /* ------------------------------------------------------------------ RACES / CLASSES */
  const races = {
    human:    { name: 'Human',    abbr: 'Hum', mods: { str: 0, int: 0, wis: 0, dex: 0, con: 0 }, desc: 'Adaptable and ambitious. Balanced stats and gain 10% bonus experience.', xpBonus: 1.1 },
    elf:      { name: 'Elf',      abbr: 'Elf', mods: { str: -1, int: 2, wis: 0, dex: 1, con: -1 }, desc: 'Graceful and long-lived. Keen minds and quick hands, but frail.' },
    dwarf:    { name: 'Dwarf',    abbr: 'Dwf', mods: { str: 1, int: -1, wis: 1, dex: -1, con: 2 }, desc: 'Stout and stubborn. Tough as the mountains they call home.' },
    halfling: { name: 'Halfling', abbr: 'Hlf', mods: { str: -2, int: 0, wis: 1, dex: 3, con: 0 }, desc: 'Small and nimble. Masters of evasion with uncanny luck.' },
    halforc:  { name: 'Half-Orc', abbr: 'HOc', mods: { str: 3, int: -2, wis: -1, dex: 0, con: 1 }, desc: 'Brutally strong. Fearsome in melee, but no scholars.' },
  };

  const classes = {
    warrior: { name: 'Warrior', abbr: 'War', prime: 'str', hpDie: 10, manaDie: 0, base: { str: 16, int: 9, wis: 10, dex: 13, con: 15 }, icon: '🛡️',
      desc: 'Masters of arms and armor. The most hit points and extra attacks per round.',
      skills: { kick: 1, parry: 1, bash: 3, 'second attack': 5, dodge: 8, 'third attack': 12, 'enhanced damage': 15 },
      start: ['i_shortsword', 'i_leather_jerkin', 'i_buckler', 'i_potion_red'] },
    cleric:  { name: 'Cleric',  abbr: 'Cle', prime: 'wis', hpDie: 8, manaDie: 7, base: { str: 13, int: 11, wis: 16, dex: 10, con: 13 }, icon: '✨',
      desc: 'Servants of the Dawn. Heal wounds, bless allies and smite the undead.',
      skills: { 'cure light': 1, armor: 1, 'cause light': 2, bless: 3, refresh: 4, 'cure serious': 7, parry: 8, 'cause serious': 9, 'cure critical': 12, harm: 15, heal: 17, sanctuary: 19 },
      start: ['i_mace', 'i_leather_jerkin', 'i_buckler', 'i_potion_red'] },
    mage:    { name: 'Mage',    abbr: 'Mag', prime: 'int', hpDie: 6, manaDie: 9, base: { str: 9, int: 17, wis: 13, dex: 12, con: 11 }, icon: '🔮',
      desc: 'Wielders of arcane power. Fragile, but their spells devastate foes.',
      skills: { 'magic missile': 1, 'chill touch': 3, 'burning hands': 5, armor: 7, 'shocking grasp': 9, 'lightning bolt': 12, dodge: 13, fireball: 16 },
      start: ['i_staff', 'i_leather_cap', 'i_potion_blue', 'i_potion_red'] },
    thief:   { name: 'Thief',   abbr: 'Thi', prime: 'dex', hpDie: 8, manaDie: 0, base: { str: 12, int: 12, wis: 9, dex: 17, con: 12 }, icon: '🗡️',
      desc: 'Cunning and quick. Sneak past foes and backstab for massive damage.',
      skills: { backstab: 1, dodge: 1, sneak: 3, 'second attack': 4, kick: 6, parry: 12, 'enhanced damage': 16 },
      start: ['i_dagger', 'i_leather_jerkin', 'i_leather_boots', 'i_potion_red'] },
  };

  /* ------------------------------------------------------------------ SPELLS & SKILLS */
  // kind: attack | heal | buff | skill | passive
  const spells = {
    'magic missile':  { kind: 'attack', mana: 8,  target: 'enemy', noun: 'magic missile' },
    'chill touch':    { kind: 'attack', mana: 12, target: 'enemy', noun: 'chilling touch' },
    'burning hands':  { kind: 'attack', mana: 15, target: 'enemy', noun: 'burning hands' },
    'shocking grasp': { kind: 'attack', mana: 18, target: 'enemy', noun: 'shocking grasp' },
    'lightning bolt': { kind: 'attack', mana: 24, target: 'enemy', noun: 'lightning bolt' },
    fireball:         { kind: 'attack', mana: 32, target: 'enemy', noun: 'fireball' },
    'cause light':    { kind: 'attack', mana: 12, target: 'enemy', noun: 'spell' },
    'cause serious':  { kind: 'attack', mana: 18, target: 'enemy', noun: 'spell' },
    harm:             { kind: 'attack', mana: 30, target: 'enemy', noun: 'harmful touch' },
    'cure light':     { kind: 'heal', mana: 10, target: 'self' },
    'cure serious':   { kind: 'heal', mana: 16, target: 'self' },
    'cure critical':  { kind: 'heal', mana: 22, target: 'self' },
    heal:             { kind: 'heal', mana: 45, target: 'self' },
    refresh:          { kind: 'heal', mana: 10, target: 'self' },
    armor:            { kind: 'buff', mana: 8,  target: 'self' },
    bless:            { kind: 'buff', mana: 8,  target: 'self' },
    sanctuary:        { kind: 'buff', mana: 55, target: 'self' },
    kick:             { kind: 'skill', mv: 4 },
    bash:             { kind: 'skill', mv: 8 },
    backstab:         { kind: 'skill', mv: 10 },
    sneak:            { kind: 'skill', mv: 5 },
    parry:            { kind: 'passive' },
    dodge:            { kind: 'passive' },
    'second attack':  { kind: 'passive' },
    'third attack':   { kind: 'passive' },
    'enhanced damage':{ kind: 'passive' },
  };

  /* ------------------------------------------------------------------ HELP */
  const help = {
    commands:
      '{W}MOVEMENT{x}   north south east west up down (n s e w u d), exits, recall, map\n' +
      '           speedwalk: {c}3n2e{x}   chain: {c}n;n;look{x}   repeat last: {c}!{x}\n' +
      '{W}LOOKING{x}    look (l) [target], examine, scan, where, time\n' +
      '{W}ITEMS{x}      get, drop, inventory (i), equipment (eq), wear, wield, remove, quaff\n' +
      '{W}COMBAT{x}     kill (k), consider (con), flee, wimpy, cast (c), kick, bash, backstab (bs)\n' +
      '{W}REST{x}       rest, sleep, stand, wake\n' +
      '{W}SHOPS{x}      list, buy, sell, value\n' +
      '{W}SOCIAL{x}     say ({c}\'hello{x}), emote, talk <mob>, who, title\n' +
      '{W}CHARACTER{x}  score (sc), affects, skills, practice, levels, autoloot, autogold\n' +
      '{W}SYSTEM{x}     save, restart, help <topic>\n' +
      '\nTopics: {c}combat  magic  targeting  newbie  classes  map{x}',
    combat:
      'Type {c}kill <target>{x} to attack. Combat proceeds in rounds every two seconds.\n' +
      'Use {c}consider <target>{x} first to judge your odds. If things go badly, {c}flee{x}!\n' +
      'Set {c}wimpy <hp>{x} to automatically flee when your hit points drop below that value.\n' +
      'Skills like {c}kick{x} and {c}bash{x}, and spells, can be used during combat.',
    magic:
      'Cast spells with {c}cast \'<spell name>\' [target]{x}, e.g. {c}cast \'magic missile\' rat{x}.\n' +
      'You can abbreviate: {c}c magic rat{x}. With no target in combat, you hit your current foe.\n' +
      'Mana regenerates over time, faster while resting or sleeping.',
    targeting:
      'Targets match by keyword prefix: {c}kill gob{x} attacks a goblin.\n' +
      'Use {c}2.rat{x} to target the second rat in the room, {c}get all{x} for everything,\n' +
      'and {c}get all.potion{x} for every matching item. {c}get all corpse{x} loots a corpse.',
    newbie:
      'Welcome to Havenbrook! Some advice:\n' +
      '  1. {c}wear all{x} to equip your starting gear (it is already worn for you).\n' +
      '  2. Head {c}down{x} from Havenbrook Square into the sewers and fight rats.\n' +
      '  3. Buy potions from the alchemist and armor from the armory with your gold.\n' +
      '  4. {c}rest{x} or {c}sleep{x} to recover. The inn upstairs is twice as restful.\n' +
      '  5. Visit the guildhall to {c}practice{x} your skills.\n' +
      '  6. Click rooms on the map to walk there automatically.',
    classes:
      '{W}Warrior{x} - tough fighter, multiple attacks, bash and kick.\n' +
      '{W}Cleric{x}  - healer and holy warrior, cure and harm spells, sanctuary.\n' +
      '{W}Mage{x}    - glass cannon, powerful attack spells from magic missile to fireball.\n' +
      '{W}Thief{x}   - sneak past aggressive monsters and open fights with a deadly backstab.',
    map:
      'The minimap draws every room you have explored on your current level. Click any\n' +
      'explored room to walk there automatically. The {c}map{x} command prints a text map.\n' +
      'Triangles in a room show exits leading up or down.',
  };

  MUD.DATA = { areas, rooms, mobs, items, shops, resets, races, classes, spells, help };
})(typeof window !== 'undefined' ? window : globalThis);
