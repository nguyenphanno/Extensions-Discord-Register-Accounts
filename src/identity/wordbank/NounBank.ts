/**
 * Noun bank for display names and mailbox local parts.
 * Kept to single, lowercase-safe ASCII words so a noun can be reused verbatim
 * inside an email local part without transliteration.
 */
export const NOUNS: readonly string[] = [
  'Falcon', 'Harbor', 'Comet', 'Willow', 'Cipher', 'Lantern', 'Meadow', 'Canyon', 'Orbit', 'Pebble',
  'Thistle', 'Furnace', 'Beacon', 'Anchor', 'Sparrow', 'Raven', 'Otter', 'Badger', 'Heron', 'Ibex',
  'Lynx', 'Puma', 'Bison', 'Marten', 'Finch', 'Wren', 'Kestrel', 'Osprey', 'Puffin', 'Tern',
  'Basil', 'Cedar', 'Maple', 'Birch', 'Rowan', 'Hazel', 'Alder', 'Laurel', 'Juniper', 'Fern',
  'Cobalt', 'Granite', 'Basalt', 'Quarry', 'Summit', 'Ridge', 'Valley', 'Delta', 'Estuary', 'Lagoon',
  'Atoll', 'Reef', 'Glacier', 'Avalanche', 'Tundra', 'Prairie', 'Steppe', 'Savanna', 'Dune', 'Oasis',
  'Compass', 'Sextant', 'Astrolabe', 'Prism', 'Lattice', 'Fulcrum', 'Spindle', 'Ratchet', 'Girder', 'Truss',
  'Anvil', 'Bellows', 'Crucible', 'Forge', 'Kiln', 'Mortar', 'Pestle', 'Trowel', 'Chisel', 'Awl',
  'Quill', 'Parchment', 'Ledger', 'Almanac', 'Chronicle', 'Codex', 'Atlas', 'Gazette', 'Manifest', 'Archive',
  'Candle', 'Ember', 'Torch', 'Hearth', 'Chimney', 'Gable', 'Portico', 'Atrium', 'Cupola', 'Turret',
  'Bridge', 'Causeway', 'Ferry', 'Gondola', 'Tram', 'Railcar', 'Loco', 'Clipper', 'Schooner', 'Skiff',
  'Kite', 'Glider', 'Balloon', 'Zeppelin', 'Rocket', 'Probe', 'Rover', 'Lander', 'Satellite', 'Telescope',
  'Mirror', 'Sundial', 'Hourglass', 'Metronome', 'Pendulum', 'Gyroscope', 'Seismograph', 'Barometer', 'Thermostat', 'Governor',
  'Kettle', 'Cauldron', 'Skillet', 'Grinder', 'Millstone', 'Churn', 'Vat', 'Cask', 'Barrel', 'Crate',
];

export const UNIQUE_NOUNS: readonly string[] = [...new Set(NOUNS)];
