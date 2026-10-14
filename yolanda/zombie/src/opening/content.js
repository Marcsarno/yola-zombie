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

// ---- dialogue (subtitled; a temporary browser voice reads it if one exists) ----
export const DIALOGUE = {
  star: { who: 'Narrator', text: 'At Yola’s Medical Center, every patient gets star treatment. Sometimes, the patient actually is a star.' },
  welcome: { who: 'Receptionist', text: 'Welcome. Yola is ready for you. We’ll keep your belongings by the operating room.' },
  takeChair: { who: 'Receptionist', text: 'Please take the chair opposite Yola.' },
  review: { who: 'Yola', text: 'Let’s review your chart before we begin.' },
  toOR: { who: 'Yola', text: 'We’re ready to move to the operating room.' },
  settle: { who: 'Yola', text: 'We’ll get you settled, then check the setup.' },
  equipment: { who: 'Yola', text: 'First, let’s check the equipment.' },
  monitor: { who: 'Yola', text: 'Now check the monitor.' },
  somethingWrong: { who: 'Staff', text: 'Something’s wrong. His condition is changing.' },
  stillMoving: { who: 'Staff', text: 'But how is he still moving?' },
  getYola: { who: 'Staff', text: 'Get Yola… Get Yola now!' },
};

// ---------------------------------------------------------------------------------------------
// ASSESSMENT / OR CARDS: DEVELOPMENT PLACEHOLDERS.
// These questions have NOT been medically researched or approved. They exist only so the card UI and the state
// pipeline can be built and tested. No doses, clinical facts, answer keys or treatment teaching are claimed.
// Every option continues the story: the outbreak happens whatever is chosen, and nothing here ever scores a
// choice as wrong. Replace with qualified, reviewed content (set status to 'reviewed') before shipping.
// Question text, options and feedback live in this table so they can be authored independently of the staging.
// ---------------------------------------------------------------------------------------------
export const CARD_STATUS = 'DEVELOPMENT PLACEHOLDER — clinical content pending review.';
export const CARD_FEEDBACK = (label) => `Test feedback: ${label} selected. This only tests the card interface; it is not a clinical answer.`;
const OPTS = [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }, { id: 'c', text: 'Option C' }];
export const CARDS = [
  { id: 'assess-1', where: 'assessment', status: 'placeholder', prompt: 'Test question: choose any option to try this card.', options: OPTS },
  { id: 'or-1', where: 'workstation', status: 'placeholder', prompt: 'Test question (equipment check): choose any option to try this card.', options: OPTS },
  { id: 'or-2', where: 'monitor', status: 'placeholder', prompt: 'Test question (monitor check): choose any option to try this card.', options: OPTS },
];

// The scripted story does not depend on the answer.
export const CARD_KEYS = { 'assess-1': {}, 'or-1': {}, 'or-2': {} };
export const EMERGENCY_LINES = { stable: 'Setup complete', alert: 'Monitor alert' };
