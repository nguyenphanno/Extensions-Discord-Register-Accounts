/** Present-participle verbs used by the `verbAdjectiveNoun` display-name format. */
export const VERBS: readonly string[] = [
  'Drifting', 'Wandering', 'Chasing', 'Sailing', 'Soaring', 'Dreaming', 'Building', 'Breaking',
  'Sketching', 'Solving', 'Tracing', 'Weaving', 'Forging', 'Mending', 'Tuning', 'Painting',
  'Reading', 'Writing', 'Naming', 'Calling', 'Seeking', 'Finding', 'Keeping', 'Sending',
  'Gathering', 'Sorting', 'Stacking', 'Folding', 'Turning', 'Spinning', 'Rolling', 'Leaping',
  'Climbing', 'Diving', 'Surveying', 'Mapping', 'Charting', 'Piloting', 'Tending', 'Trading',
  'Crafting', 'Brewing', 'Roasting', 'Baking', 'Plating', 'Serving', 'Hosting', 'Greeting',
];

export const UNIQUE_VERBS: readonly string[] = [...new Set(VERBS)];

/**
 * Neutral suffixes used when a handle needs entropy but should still read as a
 * deliberate name rather than a random string.
 */
export const HANDLE_SUFFIXES: readonly string[] = [
  'hq', 'lab', 'ops', 'works', 'studio', 'co', 'desk', 'room', 'bld', 'yard',
  'post', 'line', 'node', 'grid', 'core', 'base', 'peak', 'bay', 'port', 'gate',
];

/**
 * Given-name pool used by the `*FullName` display-name formats.
 * Deliberately generic and regionally mixed; nothing here is tied to a real person.
 */
export const GIVEN_NAMES: readonly string[] = [
  'Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Parker', 'Rowan', 'Sage',
  'Emery', 'Finley', 'Harper', 'Indie', 'Jules', 'Kai', 'Lane', 'Marlowe', 'Nico', 'Oakley',
  'Perry', 'Reese', 'Shiloh', 'Tatum', 'Wren', 'Yuki', 'Zephyr', 'Adrian', 'Blair', 'Cameron',
  'Dakota', 'Ellis', 'Frankie', 'Greer', 'Hayden', 'Ira', 'Jamie', 'Kendall', 'Logan', 'Micah',
];

/** Family-name pool paired with {@link GIVEN_NAMES}. */
export const FAMILY_NAMES: readonly string[] = [
  'Hartley', 'Bramwell', 'Castell', 'Dunmore', 'Ashford', 'Fennwick', 'Garrow', 'Halstead', 'Ives', 'Jessup',
  'Kirkland', 'Loxley', 'Marchetti', 'Norwood', 'Osprey', 'Pemberton', 'Quillon', 'Radcliffe', 'Selby', 'Thorne',
  'Underhill', 'Vance', 'Whitlock', 'Yarrow', 'Zeller', 'Aldridge', 'Bexley', 'Carrow', 'Drayton', 'Everly',
  'Fairbanks', 'Glenmore', 'Holloway', 'Ingram', 'Jarvis', 'Kinsley', 'Langford', 'Merrivale', 'Nash', 'Orrell',
];
