/**
 * Adjective bank for display names.
 * Curated for pronounceability and mild character - avoids anything that reads
 * as an edgy or NSFW handle, since these names end up on a real account.
 */
export const ADJECTIVES: readonly string[] = [
  'Swift', 'Quiet', 'Cosmic', 'Amber', 'Velvet', 'Lunar', 'Iron', 'Neon', 'Frost', 'Ember',
  'Solar', 'Cobalt', 'Silent', 'Golden', 'Drifting', 'Hollow', 'Crimson', 'Azure', 'Obsidian', 'Marble',
  'Rustic', 'Polar', 'Cinder', 'Ivory', 'Onyx', 'Gilded', 'Stormy', 'Calm', 'Bright', 'Hazy',
  'Copper', 'Jade', 'Saffron', 'Indigo', 'Cerulean', 'Coral', 'Slate', 'Titan', 'Quartz', 'Opal',
  'Wandering', 'Northern', 'Hidden', 'Gentle', 'Brave', 'Curious', 'Clever', 'Humble', 'Lively', 'Nimble',
  'Sturdy', 'Placid', 'Vivid', 'Mellow', 'Radiant', 'Dusky', 'Feathered', 'Tidal', 'Auroral', 'Glacial',
  'Sunlit', 'Moonlit', 'Starfall', 'Rainy', 'Windy', 'Snowbound', 'Mossy', 'Sandy', 'Rocky', 'Breezy',
  'Ancient', 'Modern', 'Retro', 'Electric', 'Atomic', 'Nebular', 'Stellar', 'Vertex', 'Primal', 'Echoing',
  'Whispering', 'Roaming', 'Soaring', 'Falling', 'Rising', 'Floating', 'Grounded', 'Tranquil', 'Restless', 'Vigilant',
  'Patient', 'Witty', 'Bold', 'Subtle', 'Candid', 'Lucid', 'Sleek', 'Rugged', 'Polished', 'Weathered',
  'Frosted', 'Smoked', 'Honeyed', 'Spiced', 'Zesty', 'Tangy', 'Crisp', 'Smooth', 'Rough', 'Refined',
  'Northern', 'Southern', 'Eastern', 'Western', 'Coastal', 'Inland', 'Alpine', 'Desert', 'Forest', 'Urban',
];

/** Deduplicated at module load so downstream `pickOne` never returns a repeat. */
export const UNIQUE_ADJECTIVES: readonly string[] = [...new Set(ADJECTIVES)];
