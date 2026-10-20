// Chapter 2: the lines (the user's CHAPTER 2 — SCRIPT AND VOICE DRAFT, 2026-10-19; subtitles only for now, no recordings).
// id: [speaker, text, radio?]. Voices when recorded: Marc = Frank, Yola = Niki, Arianna = Pip; the survivor: not chosen.
// LOOTER lines are the remake's own (the brief: "make it obvious these people are hostile"), not in the draft: to approve.
export const LINES = {
  // Scene 1: still at the house
  l01: ['YOLA', "Marc? I'm out of the hospital. Have you got Lilah yet?", true],
  l02: ['MARC', "Not yet. Arianna's with me. I found gas for the boat. I've just got to pick it up.", true],
  l03: ['YOLA', "You've got a way across?", true],
  l04: ['MARC', "The boat at the club. I'll get Lilah and bring the girls with me.", true],
  l05: ['YOLA', "They're moving through the streets here. Is it still quiet there?", true],
  l06: ['MARC', "No. I think we've still got time.", true],
  l07: ['SURVIVOR', "Get inside! They're coming through!"],
  l08: ['MARC', 'Arianna. Inside, sweetie.'],
  l09: ['ARIANNA', 'Dad?'],
  l10: ['MARC', "Go. I'm right here. Cover your ears."],
  l11: ['YOLA', "Marc? What's happening?", true],
  l12: ['MARC', "They're here. I'll call you back.", true],
  // Scene 2: the rifle
  l13: ['SURVIVOR', 'Back up! Back up!'],
  l14: ['MARC', 'Arianna?'],
  l15: ['ARIANNA', "I'm here."],
  l16: ['MARC', 'Okay. Come to me. Stay close.'],
  l17: ['ARIANNA', 'Are we going to Mom?'],
  l18: ['MARC', "We are. But we're getting your sister first."],
  // Scene 3: through the gate
  l19: ['MARC', 'Stay this side while I cut it.'],
  l20: ['YOLA', 'Marc. Talk to me.', true],
  l21: ['MARC', "We're through. Arianna's okay.", true],
  l22: ['YOLA', 'And you?', true],
  l23: ['MARC', "I'm okay. We're heading for the parking lot.", true],
  // Scene 4: the gas
  l24: ['MARC', "There. That's the can."],
  l25: ['MARC', "I'll carry it. Stay beside me."],
  l26: ['MARC', "I've got the gas. Just need the keys from the club office.", true],
  l27: ['YOLA', 'Be careful in there.', true],
  // Scene 5: inside the clubhouse
  l28: ['MARC', 'Arianna. Wait here a second. Let me look.'],
  l29: ['MARC', "Got them. Come on. Let's get your sister."],
  // Scene 6: Lilah
  l30: ['MARC', 'Lilah. Come here, sweetheart.'],
  l31: ['ARIANNA', "We're going to Mom."],
  l32: ['MARC', "Yola. I've got her. Both girls are with me.", true],
  l33: ['YOLA', 'Thank God.', true],
  l34: ['MARC', "We're going to the boat now.", true],
  // Scene 7: the boat
  l35: ['MARC', "Yola. We're leaving the dock.", true],
  l36: ['YOLA', "Okay. I'll keep the radio on.", true],
  l37: ['MARC', "We're coming.", true],
  // the looters (remake, draft): the warning at the club and their fight
  w01: ['LOOTER', 'Keep walking! This place is taken!'],
  w02: ['LOOTER', "That's our gas now. Put it down!"],
  w03: ['LOOTER', "He's inside! Light him up!"],
  // the dock before Lilah (remake, draft)
  d01: ['MARC', 'Not without Lilah.'],
};
export const SPEAKER_COLOR = { MARC: '#9fd3ff', YOLA: '#ffc6e0', ARIANNA: '#ffe39a', SURVIVOR: '#cfe8b8', LOOTER: '#ff8a7a' };
// the objectives (HUD, top left)
export const GOALS = {
  home: 'Hold the yard',
  rifle: 'Grab the rifle',
  push: 'Push through the barricade on the curve',
  cutters: 'Find something to cut the gate chain',
  gate: 'Cut the chain on the gate',
  holdgate: 'Hold the gate',
  lot: 'Get to the parking lot',
  gas: 'Find the gas can',
  keys: 'Get the boat keys from the club office',
  looters: 'Take the clubhouse',
  roadblock: 'Unlock the looters’ roadblock',
  stow: 'Leave the gas at the boat (past the pool)',
  lilah: 'Get Lilah from Grandma’s',
  boat: 'Get the girls to the boat',
  fuel: 'Fuel the boat',
  hold: 'Hold the dock',
  launch: 'Launch the boat',
};
