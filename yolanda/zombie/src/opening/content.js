// Editable opening content: narration/subtitles, labels, and the (developer-only) assessment cards.
// Kept apart from the staging code so qualified authors can replace it without touching the sequence.

// ---------------------------------------------------------------------------------------------
// THE TOUR NARRATION (the supplied ElevenLabs recording, assets/opening/audio/narration.mp3, 47.07 s).
// Every phrase has editable start/end timestamps (seconds into the recording); the shots below are triggered from
// them, not from a fixed runtime. Measured from the recording's pauses. If the recording is absent, the subtitles
// run on these same timestamps as the fallback. Edit a number here and the shot moves with it.
// ---------------------------------------------------------------------------------------------
export const TOUR = {
  audio: 'assets/opening/audio/narration.mp3',
  duration: 47.07,
  phrases: [
    { id: 'p1', t0: 0.0, t1: 2.0, text: 'Welcome to Yola’s Medical Center.' },
    { id: 'p2', t0: 2.48, t1: 3.34, text: 'Your hospital.' },
    { id: 'p3', t0: 3.72, t1: 4.48, text: 'Your team.' },
    { id: 'p4', t0: 4.94, t1: 7.48, text: 'Your chance to build something extraordinary.' },
    { id: 'p5', t0: 8.04, t1: 11.02, text: 'Turn empty rooms into places of possibility.' },
    { id: 'p6', t0: 11.5, t1: 12.48, text: 'Build your team.' },
    { id: 'p7', t0: 12.94, t1: 15.2, text: 'Put the right people in the right places.' },
    { id: 'p8', t0: 15.56, t1: 17.52, text: 'And bring your hospital to life.' },
    { id: 'p9', t0: 18.12, t1: 20.18, text: 'Every patient brings a new challenge.' },
    { id: 'p10', t0: 20.58, t1: 21.52, text: 'Review their chart.' },
    { id: 'p11', t0: 21.9, t1: 23.0, text: 'Prepare your equipment.' },
    { id: 'p12', t0: 23.36, t1: 26.06, text: 'And put your anesthesia expertise to the test.' },
    { id: 'p13', t0: 26.52, t1: 28.72, text: 'Great care helps your hospital grow.' },
    { id: 'p14', t0: 29.2, t1: 30.36, text: 'Upgrade your equipment.' },
    { id: 'p15', t0: 30.7, t1: 32.28, text: 'Expand your possibilities.' },
    { id: 'p16', t0: 32.62, t1: 34.74, text: 'And get ready for a busier tomorrow.' },
    { id: 'p17', t0: 35.24, t1: 36.06, text: 'And leading it all?' },
    { id: 'p18', t0: 36.56, t1: 37.02, text: 'Yola.' },
    { id: 'p19', t0: 37.52, t1: 38.58, text: 'Calm under pressure.' },
    { id: 'p20', t0: 38.92, t1: 40.22, text: 'Ready for anything.' },
    { id: 'p21', t0: 40.68, t1: 42.02, text: 'Still working on the wave.' },
    { id: 'p22', t0: 42.6, t1: 43.52, text: 'The doors are open.' },
    { id: 'p23', t0: 43.9, t1: 45.54, text: 'Your first patient is waiting.' },
    { id: 'p24', t0: 46.0, t1: 46.84, text: 'Let’s get to work.' },
  ],
  // shot triggers (seconds): each sits inside a pause in the voice so no cut or effect covers a word
  cues: {
    furnishCut: 7.55, // reception -> the empty treatment room
    furnishFrom: 8.2, furnishStep: 0.3, // quick, satisfying placements across the sentence
    teamCut: 11.08, receptionCut: 12.5, seatedCut: 15.22, // staff at stations -> receptionist greeting -> Yola seated opposite a patient
    chartCut: 17.56, chartOn: 18.9, chartOff: 21.6, decisionOn: 21.95, decisionOff: 23.2, equipmentCut: 23.4,
    holdCut: 26.1, midTier: 29.0, advTier: 30.4, restoreCut: 34.85, // equipment previews: steady camera, chimes in the pauses
    yolaCut: 35.0, waveStart: 40.7, // original Yola; her awkward wave on the final phrase
    arrivalCut: 42.1, objective: 43.9, settle: 46.0, handoff: 47.1,
  },
};

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
  room1: 'Find the lift reset in Maintenance.',
  maintenance: 'Find the lift reset in Maintenance.',
  elevator: 'Return to the elevator.',
  board: 'Step into the lift.',
};
// the reveal's boss-intro card (Borderlands-style freeze frame)
export const BOSS_CARD = { name: 'YOLA', tagline: 'Calm under pressure' };

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
