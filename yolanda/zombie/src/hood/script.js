// Chapter 2: the lines. The story reset, version 3 (design/HANDOFF_NEXT.md, 2026-10-22) with Marc's dialogue pack of the
// same day (Chapter2_New_Audio: voices Marc = Frank, Yola = Lara, Sophie = Maggie, Adam = Chad; the c2_<beat><n> files),
// and only those of the earlier pack's recordings the new script says to reuse: James's and Pete's (Marc, the same day: "Cut
// every line that isn't in my new script"). The recordings are assets/neighborhood/voice/<file>.mp3; the subtitles are the spoken
// words only (never the voice directions).
// id: [speaker, text, radio card?, file, radio filter?]. The card (src/hood/radio.js: the two faces) shows Marc's and
// Yola's call; the walkie-talkie's band (voice.js) goes only where the pack's filename map says so (the fifth field, else
// the card's): Marc's whispers into the radio at the start were recorded clean and stay clean.
// Trigger by id from the story (level.js).
export const LINES = {
  // 1. The sneak in: the call (whispered)
  c106: ['MARC', 'Yola, I have no idea how I\'m going to get out of here with this.', true, 'c2_106_marc', false],
  c107: ['YOLA', 'Figure it out. The family\'s counting on you.', true, 'c2_107_yola'],
  c103: ['YOLA', 'The vials are in the garage. The second fridge. Four vials of the vaccine.', true, 'c2_103_yola'],
  c108: ['MARC', 'I\'ll get the vaccine to the family.', true, 'c2_108_marc', false],
  // 4. The house (James)
  J01: ['JAMES', 'What the fuck? Who are you? Who are you, motherfucker? Who are YOU?', false, 'J01_james'],
  c303: ['MARC', 'Sorry, buddy. Wrong fridge.', false, 'c2_303_marc'],
  c304: ['MARC', 'Behind the beer. Smart.', false, 'c2_304_marc'],
  // 5. The rescue (Adam and Sophie)
  c401: ['SOPHIE', 'No! Stop! Please, stop!', false, 'c2_401_sophie'],
  c402: ['ADAM', 'Stay behind me! Sophie, stay behind me!', false, 'c2_402_adam'],
  c403: ['ADAM', 'Run! Sophie, run!', false, 'c2_403_adam'],
  c404: ['SOPHIE', 'Help! Somebody help us! Please!', false, 'c2_404_sophie'],
  c405: ['ADAM', 'Hey. I\'ve got you.', false, 'c2_405_adam'],
  c406: ['SOPHIE', 'Adam. Adam, no. Stay with me.', false, 'c2_406_sophie'],
  c408: ['SOPHIE', 'Adam? Adam, it\'s me. It\'s me.', false, 'c2_408_sophie'],
  c410: ['SOPHIE', 'He just went out to get the car.', false, 'c2_410_sophie'],
  // 6. The reveal and the deal
  c501: ['SOPHIE', 'Is that what I think it is?', false, 'c2_501_sophie'],
  c502: ['SOPHIE', 'That\'s the hospital\'s symbol. You\'re the one who\'s been hiding the supplies, aren\'t you?', false, 'c2_502_sophie'],
  c503: ['SOPHIE', 'Would it have helped him?', false, 'c2_503_sophie'],
  c504: ['MARC', 'No. It only works before.', false, 'c2_504_marc'],
  c505: ['MARC', 'I have to go.', false, 'c2_505_marc'],
  c506: ['SOPHIE', 'Wait. Where are you going?', false, 'c2_506_sophie'],
  c507: ['MARC', 'To my family. We have to get across the water.', false, 'c2_507_marc'],
  c508: ['SOPHIE', 'I have a boat.', false, 'c2_508_sophie'],
  c509: ['MARC', 'You have a boat?', false, 'c2_509_marc'],
  c510: ['SOPHIE', 'At the club. It\'s out of gas. Can you help me?', false, 'c2_510_sophie'],
  c511: ['MARC', 'I\'m not here to help anyone but my own family. I\'m sorry.', false, 'c2_511_marc'],
  c512: ['SOPHIE', 'Please. I\'m alone. I don\'t have anyone left. Help me get past the horde and you can use my boat.', false, 'c2_512_sophie'],
  c513: ['MARC', '...Okay.', false, 'c2_513_marc'],
  c514: ['SOPHIE', 'Thank you. Thank you. Come this way.', false, 'c2_514_sophie'],
  // 7 - 8. The radio's battery; the gate
  c601: ['MARC', 'Battery\'s almost gone.', false, 'c2_601_marc', true],
  c602: ['SOPHIE', 'Gate\'s locked. Don\'t worry, I\'ve got this.', false, 'c2_602_sophie'],
  c603: ['SOPHIE', 'You\'ll want something quiet. That house there. The door\'s open.', false, 'c2_603_sophie'],
  c603b: ['SOPHIE', 'Good. You found something quiet.', false, 'c2_603b_sophie'],
  c604: ['MARC', 'When did you learn that?', false, 'c2_604_marc'],
  c605: ['SOPHIE', 'Come on.', false, 'c2_605_sophie'],
  // 9. The busted house; Yola's call
  c701: ['MARC', 'Batteries. Good.', false, 'c2_701_marc'],
  c702: ['MARC', 'That\'ll be quiet.', false, 'c2_702_marc'],
  c703: ['YOLA', 'Marc? Marc, can you hear me? I lost you.', true, 'c2_703_yola'],
  c704: ['MARC', 'I\'m here. The radio was dying.', true, 'c2_704_marc'],
  c705: ['YOLA', 'Thank God. Did you find it?', true, 'c2_705_yola'],
  c706: ['MARC', 'I found the vaccine. Enough for the family, and one for you. I\'m bringing it with me.', true, 'c2_706_marc'],
  c711: ['YOLA', 'Then I\'ll find more. For us.', true, 'c2_711_yola'],
  c712: ['MARC', 'There\'s a woman with a boat. She saw the case.', true, 'c2_712_marc'],
  c713: ['YOLA', 'Then watch her.', true, 'c2_713_yola'],
  c714: ['MARC', 'I am.', true, 'c2_714_marc'],
  // 11. The clubhouse
  c801: ['SOPHIE', 'The clubhouse has supplies. Ammo, first aid.', false, 'c2_801_sophie'],
  c802: ['SOPHIE', 'Don\'t use your gun. You\'ll wake the horde. And then we\'re fucked.', false, 'c2_802_sophie'],
  c803: ['SOPHIE', 'Look.', false, 'c2_803_sophie'],
  c804: ['MARC', 'Jesus.', false, 'c2_804_marc'],
  c805: ['MARC', 'Keep an eye on this.', false, 'c2_805_marc'],
  c806: ['MARC', 'A suppressor. Now we\'re talking.', false, 'c2_806_marc'],
  c807: ['SOPHIE', 'Shit. It\'s not in here. He must have it on him.', false, 'c2_807_sophie'],
  c808: ['MARC', 'Who has what?', false, 'c2_808_marc'],
  c809: ['SOPHIE', 'Just follow me.', false, 'c2_809_sophie'],
  // 12. Pete in the lot
  P01: ['PETE', 'Help! Over here! Somebody!', false, 'P01_pete'],
  P02: ['PETE', 'Get back! Get BACK!', false, 'P02_pete'],
  P03: ['PETE', 'Don\'t come! They\'re... They\'re... AAAH!', false, 'P03_pete'],
  c905: ['MARC', 'Sorry, pal.', false, 'c2_905_marc'],
  c906: ['SOPHIE', 'Come on. The dock.', false, 'c2_906_sophie'],
  // 13. The dock
  c1001: ['MARC', 'That\'s your boat?', false, 'c2_1001_marc'],
  c1002: ['SOPHIE', 'It\'s all I\'ve got. It\'s nearly dry.', false, 'c2_1002_sophie'],
  c1003: ['SOPHIE', 'Give me the case. There\'s a cooler on the boat.', false, 'c2_1003_sophie'],
  c1004: ['MARC', 'What?', false, 'c2_1004_marc'],
  c1005: ['SOPHIE', 'It has to stay cold. I have no gas, so I can\'t go anywhere. The case is locked, so I can\'t open it. And I need your help.', false, 'c2_1005_sophie'],
  c1006: ['SOPHIE', 'It\'s fine. Grab the gas so we can go. Please.', false, 'c2_1006_sophie'],
  c1007: ['MARC', 'You know I\'d do anything for my family, right? Anything.', false, 'c2_1007_marc'],
  c1008: ['SOPHIE', 'Here. The shed\'s right up the bank.', false, 'c2_1008_sophie'],
  c1009: ['MARC', 'Whatever you do, don\'t start that motor. You know what it\'ll bring.', false, 'c2_1009_marc'],
  c1010: ['SOPHIE', 'I know. I know. Go.', false, 'c2_1010_sophie'],
  // 14 - 16. The shed, the engine, Sophie, the fight
  c1101: ['MARC', 'Gas.', false, 'c2_1101_marc'],
  c1103: ['SOPHIE', 'Come on. Come on, come on.', false, 'c2_1103_sophie'],
  // 17 - 18. After; leaving
  c1201: ['MARC', 'You could have come with us.', false, 'c2_1201_marc'],
  c1206: ['MARC', 'I\'ve still got all four.', true, 'c2_1206_marc'],
  c1208: ['MARC', 'The fourth one\'s still yours. I\'m going to them.', true, 'c2_1208_marc'],
};
// sounds without words (no subtitle): James's cut-off scream, Sophie's at Adam's lunge, Adam's groan as he turns, the
// outboard's pull, cough, roar and stall
export const CUES = { J02: 'J02_james_scream', c409: 'c2_409_sophie', c407: 'c2_407_adam', ENGINE: 'FX_ENGINE_outboard_start_stall' };
// the speakers' subtitle colours; the faces on the radio card (assets/ui/radio/, from the user's RADIO SIGNAL picture)
export const SPEAKER_COLOR = { MARC: '#9fd3ff', YOLA: '#ffc6e0', SOPHIE: '#ffe39a', ADAM: '#c9d8a6', JAMES: '#ff8a7a', PETE: '#cfe8b8' };
export const FACES = { MARC: 'assets/ui/radio/marc.webp', YOLA: 'assets/ui/radio/yola.webp' };
// the objectives (HUD, top left)
export const GOALS = {
  sneak: 'Get to the house',
  house: 'Go in',
  vials: 'The second fridge, in the garage',
  help: 'Find who is screaming',
  save: 'Help them',
  shoot: 'Shoot him',
  follow: 'Follow Sophie',
  quiet: 'Find something quiet',
  batteries: 'Get the batteries',
  gate: 'Wait for Sophie',
  clubhouse: 'Get to the clubhouse',
  clear: 'Clear the clubhouse. No guns',
  takeCase: 'Take the case',
  pete: 'Follow Sophie',
  savePete: 'Help him. Quietly',
  dock: 'Get to the dock',
  shed: 'Get the gas from the shed',
  sophie: 'Get to Sophie',
  horde: 'Survive',
  caseBack: 'Take the case',
  fuel: 'Fuel the boat',
  leave: 'Start the motor',
};
