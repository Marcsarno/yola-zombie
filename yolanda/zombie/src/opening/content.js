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

// ---------------------------------------------------------------------------------------------
// THE SCRIPT (Yola Opening V3, assets/source/Yola_Opening_V3): 33 numbered lines, one recorded take each. The user chose
// take B for every line (Yola_Overnight_Claude_Handoff, 2026-10-15); the A files stay in assets/opening/voice for review.
// Line 32 ("Behind me.") is never played (the user's call); its files and number are kept so the IDs stay stable.
// Line 33 is optional and plays once, after control returns.
// dur: the clip; end: where the speech ends (the trailing silence is trimmed, measured from the decoded audio);
// gainDb: a per-clip level match (speech RMS measured in the browser: conversational lines to about -15 dB, the two
// shouted calls for Yola to about -12 dB), applied at playback; the MP3s are untouched.
// ---------------------------------------------------------------------------------------------
export const VOICE_DIR = 'assets/opening/voice/';
export const TAKE = 'B';
export const LINES = [
  { id: '01', who: 'Reception', file: '01_Reception_takeB.mp3', dur: 4.16, end: 4.16, gainDb: -0.9, text: "Good morning. Yola's expecting you. Take the two seats across from her." },
  { id: '02', who: 'Yola', file: '02_Yola_takeB.mp3', dur: 1.84, end: 1.84, gainDb: -1.8, text: "Hi. How's that knee treating you?" },
  { id: '03', who: 'Patient', file: '03_Patient_takeB.mp3', dur: 3.28, end: 3.28, gainDb: 0.4, text: 'Still hurts when I walk. Running bases is out.' },
  { id: '04', who: 'Yola', file: '04_Yola_takeB.mp3', dur: 1.84, end: 0.7, gainDb: -1.5, text: 'And the bat?' },
  { id: '05', who: 'Patient', file: '05_Patient_takeB.mp3', dur: 5.2, end: 5.2, gainDb: 1.3, text: "Temporary crutch. Didn't have crutches at home, and I'm definitely not using a cane." },
  { id: '06', who: 'Yola', file: '06_Yola_takeB.mp3', dur: 1.04, end: 1.02, gainDb: -1.8, text: 'So you brought a bat.' },
  { id: '07', who: 'Patient', file: '07_Patient_takeB.mp3', dur: 1.52, end: 1.32, gainDb: 0.9, text: 'I have a reputation.' },
  { id: '08', who: 'Yola', file: '08_Yola_takeB.mp3', dur: 1.76, end: 1.72, gainDb: -1.1, text: 'Any trouble with anesthesia before?' },
  { id: '09', who: 'Patient', file: '09_Patient_takeB.mp3', dur: 4.16, end: 4.16, gainDb: 1.4, text: 'Last time, they had to help me breathe for a few hours. They found an enzyme problem.' },
  { id: '10', who: 'Yola', file: '10_Yola_takeB.mp3', dur: 2.72, end: 2.7, gainDb: 0.6, text: 'I see the test results here. Thanks for telling me.' },
  { id: '11', who: 'Yola', file: '11_Yola_takeB.mp3', dur: 2.16, end: 2.16, gainDb: 1.6, text: "We'll account for that in your anesthesia plan." },
  { id: '12', who: 'Yola', file: '12_Yola_takeB.mp3', dur: 2.96, end: 2.94, gainDb: -1.1, text: "Your team's ready on the third floor. I'll come up with you." },
  { id: '13', who: 'Colleague', file: '13_Colleague_takeB.mp3', dur: 3.2, end: 3.2, gainDb: 2.0, text: "Let's give that knee a break. I've got a wheelchair for you." },
  { id: '14', who: 'Patient', file: '14_Patient_takeB.mp3', dur: 2.08, end: 2.08, gainDb: 0.9, text: "All right. But the bat's coming." },
  { id: '15', who: 'Yola', file: '15_Yola_takeB.mp3', dur: 2.24, end: 2.22, gainDb: -0.3, text: "He can look after it while we're in the operating room." },
  { id: '16', who: 'Colleague', file: '16_Colleague_takeB.mp3', dur: 2.96, end: 2.96, gainDb: 0.6, text: "Third floor. We'll help you get changed and settled." },
  { id: '17', who: 'Yola', file: '17_Yola_takeB.mp3', dur: 1.44, end: 0.64, gainDb: -2.1, text: 'Comfortable?' },
  { id: '18', who: 'Patient', file: '18_Patient_takeB.mp3', dur: 2.88, end: 2.88, gainDb: 2.7, text: "As comfortable as I'm going to get. Let's do this." },
  { id: '19', who: 'Yola', file: '19_Yola_takeB.mp3', dur: 1.28, end: 1.2, gainDb: 0.2, text: "We'll take good care of you." },
  { id: '20', who: 'Colleague', file: '20_Colleague_takeB.mp3', dur: 1.6, end: 1.6, gainDb: 1.5, text: 'Equipment checks complete.' },
  { id: '21', who: 'Yola', file: '21_Yola_takeB.mp3', dur: 1.12, end: 1.12, gainDb: -1.1, text: "I'm right here with you." },
  { id: '22', who: 'Colleague', file: '22_Colleague_takeB.mp3', dur: 2.72, end: 2.72, gainDb: 2.3, text: "The procedure's finished. Let's check his recovery." },
  { id: '23', who: 'Yola', file: '23_Yola_takeB.mp3', dur: 4.08, end: 4.08, gainDb: 0.6, text: "There's still some rocuronium effect. Let's complete reversal and check again." },
  { id: '24', who: 'Yola', file: '24_Yola_takeB.mp3', dur: 2.8, end: 2.78, gainDb: 0.2, text: "He's recovering well. I've handed everything over." },
  { id: '25', who: 'Colleague', file: '25_Colleague_takeB.mp3', dur: 1.68, end: 1.68, gainDb: -0.7, text: "I've got him. I'll stay with him." },
  { id: '26', who: 'Yola', file: '26_Yola_takeB.mp3', dur: 1.84, end: 1.84, gainDb: 0.1, text: "Thanks. I'll be just outside." },
  { id: '27', who: 'Colleague', file: '27_Colleague_takeB.mp3', dur: 2.16, end: 2.16, gainDb: -0.5, text: "Something's wrong. Check his pulse." },
  { id: '28', who: 'Colleague', file: '28_Colleague_takeB.mp3', dur: 1.68, end: 1.12, gainDb: -0.6, text: "There's no pulse." },
  { id: '29', who: 'Colleague', file: '29_Colleague_takeB.mp3', dur: 2.08, end: 2.08, gainDb: 3.3, text: 'Wait... why is he moving?' },
  { id: '30', who: 'Colleague', file: '30_Colleague_takeB.mp3', dur: 2, end: 1.04, gainDb: -1.0, text: 'Get Yola!' },
  { id: '31', who: 'Colleague', file: '31_Colleague_takeB.mp3', dur: 2.48, end: 1.76, gainDb: -2.9, text: 'Yola! We need you in here!' },
  { id: '32', who: 'Yola', file: '32_Yola_takeB.mp3', dur: 2.16, end: 0.8, gainDb: -4.0, text: 'Behind me.', omit: true },
  { id: '33', who: 'Yola', file: '33_Yola_takeB.mp3', dur: 2.72, end: 1.46, gainDb: 0.2, text: 'We need to get downstairs.', optional: true },
];
export const LINE = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const SPEAKER = { Reception: 'Receptionist', Yola: 'Yola', Patient: 'Patient', Colleague: 'Anesthesia colleague' };

// ---------------------------------------------------------------------------------------------
// THE CHOICE CARDS (reviewed script, three passes against the sources in assets/source/Yola_Opening_V3/SOURCES.txt;
// anesthesia-informed entertainment, not a treatment guide or a clinician-approved training module). The answer keys
// are unchanged from the script. A wrong answer shows its hint and the card stays open for another try; nothing unsafe
// is ever administered and no answer is scored. The scene waits while a card is open.
// ---------------------------------------------------------------------------------------------
export const CARD_NOTE = 'Story card: anesthesia-informed entertainment, not medical advice.';
export const CLINICAL_CARDS = {
  assess: {
    id: 'assess', title: 'Assessment', sub: 'History changes the plan',
    context: 'Chart: scheduled knee procedure; general anesthesia is planned. Prior testing confirms butyrylcholinesterase (pseudocholinesterase) deficiency. Routine history, medications, allergies, fasting, consent and preparation are documented.',
    prompt: 'Which pair should be avoided because of his documented enzyme deficiency?',
    options: [
      { id: 'a', text: 'Succinylcholine and mivacurium', correct: true },
      { id: 'b', text: 'Rocuronium and vecuronium' },
      { id: 'c', text: 'Propofol and sevoflurane' },
    ],
    success: 'History accounted for. An alternative plan is selected.',
    explain: 'The affected pair can cause prolonged paralysis in this condition. Today’s clinician-selected alternative uses rocuronium, which is not dependent on that enzyme.',
    retry: 'Check which two muscle relaxants depend on this enzyme.',
  },
  equip: {
    id: 'equip', title: 'Equipment', sub: 'Prepare to measure recovery',
    prompt: 'Which monitoring will best confirm neuromuscular recovery at the end of the case?',
    options: [
      { id: 'a', text: 'Qualitative assessment of facial-muscle twitches' },
      { id: 'b', text: 'Quantitative monitoring at the adductor pollicis', correct: true },
      { id: 'c', text: 'A sustained head-lift test alone' },
    ],
    success: 'Quantitative recovery monitor ready.',
    retry: 'Clinical or visual checks alone can miss residual block.',
  },
  monitor: {
    id: 'monitor', title: 'Monitor', sub: 'Interpret the result',
    context: 'After rocuronium, four twitch responses are present. Quantitative TOF ratio: 0.78.',
    prompt: 'Does this establish adequate neuromuscular recovery for extubation?',
    options: [
      { id: 'a', text: 'Yes. Four responses establish full recovery.' },
      { id: 'b', text: 'Yes, if a head lift can be sustained.' },
      { id: 'c', text: 'No. Residual neuromuscular blockade remains.', correct: true },
    ],
    success: 'Recovery checks continue.',
    explain: 'Confirm a quantitative TOF ratio of at least 0.9 alongside the other clinical readiness requirements before extubation. A TOF ratio alone is not the complete readiness assessment.',
    retry: 'Four responses do not establish full recovery. Check the ratio.',
  },
};
// the readiness check shown with the 0.96 reading, before the handoff (the ratio is one requirement among several)
export const READINESS = ['TOF ratio 0.96', 'Breathing regular and adequate', 'Awake, following commands', 'Oxygen saturation stable', 'Airway reflexes back'];
export const TIME_CARDS = { later: 'Later in the procedure', reversal: 'A few minutes later' };
