/**
 * Rule-based classification of full-cube blocks for the data generator.
 *
 * Categories describe what a block is made of (the palette filter chips);
 * flags describe how it behaves (falls, glows, can't be obtained in survival).
 * The first matching rule wins, so specific rules come before broad ones.
 */

export type ShapeKind = 'stairs' | 'slab' | 'wall' | 'fence'

/** Suffixes of the shaped blocks we link to their full block. */
export const SHAPE_SUFFIXES: [string, ShapeKind][] = [
  ['_stairs', 'stairs'],
  ['_slab', 'slab'],
  ['_wall', 'wall'],
  ['_fence', 'fence'],
]

/** Keep in sync with CATEGORIES in src/core/blocks.ts (a unit test checks it). */
export type Category =
  | 'wood'
  | 'stone'
  | 'terracotta'
  | 'glazed'
  | 'concrete'
  | 'wool'
  | 'copper'
  | 'earth'
  | 'plant'
  | 'nether'
  | 'end'
  | 'ocean'
  | 'mineral'
  | 'ore'
  | 'glass'
  | 'utility'

const set = (...ids: string[]) => new Set(ids)

const UTILITY = set(
  'barrel',
  'bee_nest',
  'beehive',
  'blast_furnace',
  'bookshelf',
  'cartography_table',
  'chain_command_block',
  'command_block',
  'crafter',
  'crafting_table',
  'dispenser',
  'dropper',
  'fletching_table',
  'furnace',
  'jigsaw',
  'jukebox',
  'lodestone',
  'loom',
  'note_block',
  'observer',
  'piston',
  'redstone_lamp',
  'repeating_command_block',
  'respawn_anchor',
  'sculk_catalyst',
  'smithing_table',
  'smoker',
  'spawner',
  'sticky_piston',
  'structure_block',
  'target',
  'test_block',
  'test_instance_block',
  'tnt',
  'trial_spawner',
  'vault',
)

const MINERAL = set(
  'amethyst_block',
  'budding_amethyst',
  'coal_block',
  'diamond_block',
  'emerald_block',
  'gold_block',
  'iron_block',
  'lapis_block',
  'netherite_block',
  'raw_copper_block',
  'raw_gold_block',
  'raw_iron_block',
  'redstone_block',
)

const NETHER = set(
  'basalt',
  'blackstone',
  'chiseled_nether_bricks',
  'chiseled_polished_blackstone',
  'chiseled_quartz_block',
  'cracked_nether_bricks',
  'cracked_polished_blackstone_bricks',
  'crimson_nylium',
  'crying_obsidian',
  'gilded_blackstone',
  'glowstone',
  'magma_block',
  'nether_bricks',
  'nether_wart_block',
  'netherrack',
  'polished_basalt',
  'polished_blackstone',
  'polished_blackstone_bricks',
  'quartz_block',
  'quartz_bricks',
  'quartz_pillar',
  'red_nether_bricks',
  'shroomlight',
  'smooth_basalt',
  'smooth_quartz',
  'soul_sand',
  'soul_soil',
  'warped_nylium',
  'warped_wart_block',
)

const END = set('end_stone', 'end_stone_bricks', 'purpur_block', 'purpur_pillar')

const OCEAN = set('dark_prismarine', 'dried_kelp_block', 'prismarine', 'prismarine_bricks', 'sea_lantern', 'sponge', 'wet_sponge')

const EARTH = set(
  'blue_ice',
  'bone_block',
  'clay',
  'coarse_dirt',
  'creaking_heart',
  'dirt',
  'frosted_ice',
  'grass_block',
  'gravel',
  'honey_block',
  'honeycomb_block',
  'ice',
  'mangrove_roots',
  'moss_block',
  'mud',
  'muddy_mangrove_roots',
  'mycelium',
  'packed_ice',
  'pale_moss_block',
  'podzol',
  'powder_snow',
  'red_sand',
  'resin_block',
  'rooted_dirt',
  'sand',
  'sculk',
  'slime_block',
  'snow_block',
  'suspicious_gravel',
  'suspicious_sand',
)

const PLANT = set(
  'brown_mushroom_block',
  'carved_pumpkin',
  'hay_block',
  'jack_o_lantern',
  'melon',
  'mushroom_stem',
  'ochre_froglight',
  'pearlescent_froglight',
  'pumpkin',
  'red_mushroom_block',
  'verdant_froglight',
)

const STONE_PATTERN =
  /^(?:(?:mossy_|cracked_|chiseled_|smooth_|polished_|cobbled_|cut_)*(?:stone|cobblestone|stone_bricks|andesite|diorite|granite|deepslate|deepslate_bricks|deepslate_tiles|tuff|tuff_bricks|calcite|dripstone_block|bricks|mud_bricks|packed_mud|sandstone|red_sandstone|obsidian|bedrock|reinforced_deepslate|resin_bricks|cinnabar|cinnabar_bricks|sulfur|sulfur_bricks|potent_sulfur))$/

export function categorize(id: string): Category | null {
  if (UTILITY.has(id)) return 'utility'
  if (/_glazed_terracotta$/.test(id)) return 'glazed'
  if (/(^|_)terracotta$/.test(id)) return 'terracotta'
  if (/_concrete(_powder)?$/.test(id)) return 'concrete'
  if (/_wool$/.test(id)) return 'wool'
  if (/(^|_)glass$/.test(id)) return 'glass'
  if (/_ore$/.test(id) || id === 'ancient_debris') return 'ore'
  if (MINERAL.has(id)) return 'mineral'
  if (/copper/.test(id)) return 'copper'
  if (/_leaves$/.test(id) || PLANT.has(id)) return 'plant'
  if (id !== 'mushroom_stem' && /(_planks|_log|_wood|_stem|_hyphae|^bamboo_block|^bamboo_mosaic|_bamboo_block)$/.test(id)) return 'wood'
  if (NETHER.has(id)) return 'nether'
  if (END.has(id)) return 'end'
  if (OCEAN.has(id) || /coral_block$/.test(id)) return 'ocean'
  if (EARTH.has(id)) return 'earth'
  if (STONE_PATTERN.test(id)) return 'stone'
  return null
}

const GRAVITY = set('sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel')

/** Full blocks that give off light in their default state. */
const LIGHT = set(
  'crying_obsidian',
  'glowstone',
  'jack_o_lantern',
  'magma_block',
  'ochre_froglight',
  'pearlescent_froglight',
  'sculk_catalyst',
  'sea_lantern',
  'shroomlight',
  'verdant_froglight',
)

/** Blocks a survival player cannot obtain as an item (or that break when mined). */
const CREATIVE = set(
  'bedrock',
  'budding_amethyst',
  'chain_command_block',
  'command_block',
  'frosted_ice',
  'jigsaw',
  'reinforced_deepslate',
  'repeating_command_block',
  'spawner',
  'structure_block',
  'suspicious_gravel',
  'suspicious_sand',
  'test_block',
  'test_instance_block',
  'trial_spawner',
  'vault',
)

export function flagsFor(id: string): { gravity: boolean; light: boolean; creative: boolean } {
  return {
    gravity: GRAVITY.has(id) || id.endsWith('_concrete_powder'),
    light: LIGHT.has(id),
    creative: CREATIVE.has(id) || id.startsWith('infested_') || id.startsWith('petrified_'),
  }
}
