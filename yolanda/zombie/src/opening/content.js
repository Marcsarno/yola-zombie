// Editable opening content: narration/subtitles, labels, and the (developer-only) assessment cards.
// Kept apart from the staging code so qualified authors can replace it without touching the sequence.

export const NARRATION = {
  welcome: 'Welcome to Yola’s Medical Center! Every great medical center starts somewhere—and yours is ready for its very first patients.',
  essentials: 'You’ll begin with the essentials. Prepare your patients, plan your schedule, and put Yola’s anesthesia expertise to work.',
  upgrades: 'As your reputation grows, so will your budget! Invest in better equipment, faster preparation, and room for more patients.',
  yola: 'And the person making it all happen? Yola! Expert care. Excellent judgment. An enthusiastic approach to waving.',
  firstCase: 'Your first patient has arrived. Complete your first case to earn $250 toward your next upgrade!',
};

// Preview-only labels while the equipment tiers are shown (no upgrade economy is built)
export const UPGRADE_PREVIEW = {
  heading: 'Future upgrades',
  tiers: [
    { name: 'Standard kit', label: 'Preparation speed +15%' },
    { name: 'Advanced kit', label: 'Patient capacity +1' },
  ],
};

export const OBJECTIVES = {
  chart: 'Review the patient’s chart.',
  room1: 'Get out of the operating room.',
  bat: 'Pick up the baseball bat.',
  reception: 'Head for the Waiting Area and Reception.',
};

// Lines in the emergency (subtitled; no recorded voice exists yet)
export const EMERGENCY_LINES = {
  stable: 'Vitals are stable. Nice work, everyone.',
  moving: 'But how is he still moving?',
  scream: '(a scream)',
  getYola: 'Get Yola… Get Yola now!',
};

// ---------------------------------------------------------------------------------------------
// ASSESSMENT / OR CARDS: DEVELOPER PLACEHOLDERS.
// These questions have NOT been medically researched or approved. They exist only so the card UI and the state
// pipeline can be built and tested. No doses, clinical facts or treatment teaching are claimed. Every option is
// treated as acceptable by the story: the outbreak happens whatever is chosen, and nothing here ever scores a
// choice as wrong. Replace with qualified, reviewed content (set status to 'reviewed') before shipping.
// Answer keys live in a separate table (CARD_KEYS) so they can be authored independently.
// ---------------------------------------------------------------------------------------------
export const CARD_STATUS = 'DEVELOPER PLACEHOLDER · not clinically reviewed';

export const CARDS = [
  { id: 'assess-1', where: 'assessment', prompt: 'Placeholder question A: pick a first step for this patient.',
    options: [{ id: 'a', text: 'Placeholder answer A1' }, { id: 'b', text: 'Placeholder answer A2' }, { id: 'c', text: 'Placeholder answer A3' }] },
  { id: 'or-1', where: 'workstation', prompt: 'Placeholder question B: choose a setup option at the anesthesia workstation.',
    options: [{ id: 'a', text: 'Placeholder answer B1' }, { id: 'b', text: 'Placeholder answer B2' }, { id: 'c', text: 'Placeholder answer B3' }] },
  { id: 'or-2', where: 'monitor', prompt: 'Placeholder question C: choose a monitoring option.',
    options: [{ id: 'a', text: 'Placeholder answer C1' }, { id: 'b', text: 'Placeholder answer C2' }] },
];

// Whatever is chosen the story continues; 'ok' is shown as neutral confirmation, never as right or wrong.
export const CARD_KEYS = {
  'assess-1': { a: { story: 'continue' }, b: { story: 'continue' }, c: { story: 'continue' } },
  'or-1': { a: { story: 'continue' }, b: { story: 'continue' }, c: { story: 'continue' } },
  'or-2': { a: { story: 'continue' }, b: { story: 'continue' } },
};
export const CARD_CONFIRM = 'Noted. Let’s continue.';
