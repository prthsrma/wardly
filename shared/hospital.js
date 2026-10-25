// Simulated "Demo District Hospital" seed (PRD §12). Single source for server, client and tests.
// Dogri (doi) / Kashmiri (ks) strings are drafts: native-speaker review needed. Danger signs: clinician review needed.

export const LANGS = [
  { code: 'en', native: 'English', speech: 'en-IN', rtl: false },
  { code: 'hi', native: 'हिन्दी', speech: 'hi-IN', rtl: false },
  { code: 'ur', native: 'اردو', speech: 'ur-IN', rtl: true },
  { code: 'doi', native: 'डोगरी', speech: null, rtl: false },
  { code: 'ks', native: 'کٲشُر', speech: null, rtl: true },
];

export const HOSPITAL = { id: 'ddh', name: 'Demo District Hospital', city: 'Jammu', hfrId: 'IN0110000999' };

export const FLOORS = [
  { n: 0, line: 'GREEN', colour: '#2f9e44' },
  { n: 1, line: 'BLUE', colour: '#1971c2' },
  { n: 2, line: 'YELLOW', colour: '#e8b400' },
];

// 8 departments: letter, names in 5 languages, official sign term, icon (lucide), daily capacity, suggester keywords.
export const DEPARTMENTS = [
  { id: 'GEN', letter: 'A', icon: 'Stethoscope', sign: 'General Medicine', cap: 120,
    names: { en: 'General Medicine', hi: 'सामान्य चिकित्सा', ur: 'عام طب', doi: 'आम दुआई', ks: 'عام علاج' },
    kw: ['fever', 'cold', 'cough', 'bukhar', 'बुखार', 'खांसी', 'بخار', 'weakness', 'sugar', 'bp', 'pain', 'vomit', 'ulti', 'दस्त', 'diarrhoea', 'headache', 'sir dard', 'सिर दर्द'] },
  { id: 'EYE', letter: 'B', icon: 'Eye', sign: 'Ophthalmology', cap: 80,
    names: { en: 'Eye', hi: 'आँख', ur: 'آنکھ', doi: 'अक्ख', ks: 'اَچھ' },
    kw: ['eye', 'aankh', 'आँख', 'आंख', 'آنکھ', 'vision', 'blur', 'nazar', 'नज़र', 'chashma', 'glasses', 'cataract', 'motiyabind'] },
  { id: 'ORTHO', letter: 'C', icon: 'Bone', sign: 'Orthopaedics', cap: 90,
    names: { en: 'Bone (Ortho)', hi: 'हड्डी विभाग', ur: 'ہڈی', doi: 'हड्डी', ks: 'اَڈِج' },
    kw: ['bone', 'haddi', 'हड्डी', 'ہڈی', 'fracture', 'joint', 'knee', 'ghutna', 'घुटना', 'back pain', 'kamar', 'कमर', 'sprain', 'moch'] },
  { id: 'PAED', letter: 'D', icon: 'Baby', sign: 'Paediatrics', cap: 80,
    names: { en: 'Child', hi: 'बच्चों का विभाग', ur: 'بچوں کا شعبہ', doi: 'बच्चें दा', ks: 'شُرِین ہُند' },
    kw: ['child', 'baby', 'bachcha', 'बच्चा', 'بچہ', 'infant', 'vaccine', 'teeka', 'टीका', 'kid'] },
  { id: 'OBGYN', letter: 'E', icon: 'HeartPulse', sign: 'Obstetrics & Gynaecology', cap: 70,
    names: { en: 'Pregnancy & Women', hi: 'गर्भावस्था व महिला', ur: 'حمل اور خواتین', doi: 'गर्भ ते जनानियां', ks: 'حَمل تہٕ زَنانہٕ' },
    kw: ['pregnant', 'pregnancy', 'garbh', 'गर्भ', 'حمل', 'period', 'mahavari', 'माहवारी', 'women', 'delivery'] },
  { id: 'SKIN', letter: 'F', icon: 'Hand', sign: 'Dermatology', cap: 60,
    names: { en: 'Skin', hi: 'त्वचा', ur: 'جلد', doi: 'चमड़ी', ks: 'چَم' },
    kw: ['skin', 'twacha', 'त्वचा', 'جلد', 'rash', 'itch', 'khujli', 'खुजली', 'allergy', 'daane', 'pimple'] },
  { id: 'DENT', letter: 'G', icon: 'Smile', sign: 'Dental', cap: 60,
    names: { en: 'Teeth', hi: 'दाँत', ur: 'دانت', doi: 'दंद', ks: 'دَنٛد' },
    kw: ['tooth', 'teeth', 'daant', 'दांत', 'दाँत', 'دانت', 'gum', 'masoode', 'toothache'] },
  { id: 'ENT', letter: 'H', icon: 'Ear', sign: 'ENT', cap: 70,
    names: { en: 'Ear, Nose, Throat', hi: 'कान, नाक, गला', ur: 'کان، ناک، گلا', doi: 'कन्न, नक्क, गला', ks: 'کَن، نَس، ہوٚٹ' },
    kw: ['ear', 'kaan', 'कान', 'کان', 'nose', 'naak', 'नाक', 'throat', 'gala', 'गला', 'hearing', 'sunai'] },
];

// Map graph (PRD F5). Coordinates on a 1000 x 600 canvas per floor; 10 units = 1 metre.
// place: translatable place word (see PLACE_WORDS), code: room/lift number, lm: landmark key.
export const NODES = [
  // Ground floor (GREEN line)
  { id: 'G_ENT', floor: 0, x: 90, y: 520, kind: 'ENTRANCE', place: 'mainEntrance', cp: true },
  { id: 'G_REG', floor: 0, x: 260, y: 520, kind: 'ROOM', place: 'registration', cp: true },
  { id: 'G_J1', floor: 0, x: 260, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'ganeshMural', cp: true },
  { id: 'G_ED', floor: 0, x: 110, y: 200, kind: 'ROOM', place: 'casualty', cp: true },
  { id: 'G_EDENT', floor: 0, x: 30, y: 200, kind: 'EXIT', place: 'edEntrance' },
  { id: 'G_ST1', floor: 0, x: 300, y: 150, kind: 'STAIRS', place: 'stairs', code: '1' },
  { id: 'G_LA', floor: 0, x: 400, y: 150, kind: 'LIFT', place: 'lift', code: 'A', cp: true },
  { id: 'G_BILL', floor: 0, x: 400, y: 520, kind: 'ROOM', place: 'billing' },
  { id: 'G_J2', floor: 0, x: 500, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'teaStall', cp: true },
  { id: 'G_WAIT', floor: 0, x: 520, y: 170, kind: 'ROOM', place: 'waitingHall', code: 'G' },
  { id: 'G_PHAR', floor: 0, x: 560, y: 520, kind: 'ROOM', place: 'pharmacy', lm: 'bluePharmacy', cp: true },
  { id: 'G_TOIL', floor: 0, x: 640, y: 170, kind: 'ROOM', place: 'toilets' },
  { id: 'G_J3', floor: 0, x: 740, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'notice', cp: true },
  { id: 'G_LAB', floor: 0, x: 740, y: 520, kind: 'ROOM', place: 'lab', code: 'G-04' },
  { id: 'G_XRAY', floor: 0, x: 740, y: 170, kind: 'ROOM', place: 'xray', code: 'G-08' },
  { id: 'G_LB', floor: 0, x: 880, y: 360, kind: 'LIFT', place: 'lift', code: 'B', cp: true },
  { id: 'G_ST2', floor: 0, x: 880, y: 200, kind: 'STAIRS', place: 'stairs', code: '2' },
  { id: 'G_RAMP', floor: 0, x: 900, y: 540, kind: 'EXIT', place: 'rampExit' },
  { id: 'G_EXIT', floor: 0, x: 970, y: 360, kind: 'EXIT', place: 'rearExit' },
  // First floor (BLUE line)
  { id: 'F1_ST1', floor: 1, x: 300, y: 150, kind: 'STAIRS', place: 'stairs', code: '1' },
  { id: 'F1_LA', floor: 1, x: 400, y: 150, kind: 'LIFT', place: 'lift', code: 'A', cp: true },
  { id: 'F1_J1', floor: 1, x: 400, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'plants' },
  { id: 'F1_R11', floor: 1, x: 260, y: 500, kind: 'ROOM', place: 'room', code: '11' },
  { id: 'F1_R12', floor: 1, x: 440, y: 500, kind: 'ROOM', place: 'room', code: '12' },
  { id: 'F1_WAIT', floor: 1, x: 560, y: 170, kind: 'ROOM', place: 'waitingHall', code: '1' },
  { id: 'F1_J2', floor: 1, x: 660, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'waterCooler', cp: true },
  { id: 'F1_R14', floor: 1, x: 640, y: 500, kind: 'ROOM', place: 'room', code: '14' },
  { id: 'F1_R15', floor: 1, x: 800, y: 500, kind: 'ROOM', place: 'room', code: '15' },
  { id: 'F1_LB', floor: 1, x: 880, y: 360, kind: 'LIFT', place: 'lift', code: 'B', cp: true },
  { id: 'F1_ST2', floor: 1, x: 880, y: 200, kind: 'STAIRS', place: 'stairs', code: '2' },
  // Second floor (YELLOW line)
  { id: 'F2_ST1', floor: 2, x: 300, y: 150, kind: 'STAIRS', place: 'stairs', code: '1' },
  { id: 'F2_LA', floor: 2, x: 400, y: 150, kind: 'LIFT', place: 'lift', code: 'A', cp: true },
  { id: 'F2_J1', floor: 2, x: 400, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'murals' },
  { id: 'F2_R21', floor: 2, x: 260, y: 500, kind: 'ROOM', place: 'room', code: '21' },
  { id: 'F2_R22', floor: 2, x: 440, y: 500, kind: 'ROOM', place: 'room', code: '22' },
  { id: 'F2_WAIT', floor: 2, x: 560, y: 170, kind: 'ROOM', place: 'waitingHall', code: '2' },
  { id: 'F2_J2', floor: 2, x: 660, y: 360, kind: 'JUNCTION', place: 'junction', lm: 'clock', cp: true },
  { id: 'F2_R23', floor: 2, x: 640, y: 500, kind: 'ROOM', place: 'room', code: '23' },
  { id: 'F2_R24', floor: 2, x: 800, y: 500, kind: 'ROOM', place: 'room', code: '24' },
  { id: 'F2_R25', floor: 2, x: 760, y: 170, kind: 'ROOM', place: 'room', code: '25' },
  { id: 'F2_LB', floor: 2, x: 880, y: 360, kind: 'LIFT', place: 'lift', code: 'B', cp: true },
  { id: 'F2_ST2', floor: 2, x: 880, y: 200, kind: 'STAIRS', place: 'stairs', code: '2' },
];

const w = (a, b, extra) => ({ from: a, to: b, kind: 'WALK', ...extra });
// Vertical links: [id, from, to, kind, metres]
export const EDGES = [
  w('G_ENT', 'G_REG'), w('G_REG', 'G_J1'), w('G_REG', 'G_BILL'), w('G_J1', 'G_ED'), w('G_ED', 'G_EDENT'),
  w('G_J1', 'G_ST1'), w('G_J1', 'G_J2'), w('G_J2', 'G_LA'), w('G_BILL', 'G_PHAR'), w('G_J2', 'G_PHAR'),
  w('G_J2', 'G_WAIT'), w('G_J2', 'G_J3'), w('G_J3', 'G_TOIL'), w('G_J3', 'G_LAB'), w('G_J3', 'G_XRAY'),
  w('G_J3', 'G_LB'), w('G_LB', 'G_ST2'), w('G_LB', 'G_EXIT'), w('G_LAB', 'G_RAMP'), w('G_ENT', 'G_ED', { note: 'outside path' }),
  w('F1_ST1', 'F1_J1'), w('F1_LA', 'F1_J1'), w('F1_J1', 'F1_R11'), w('F1_J1', 'F1_R12'), w('F1_J1', 'F1_J2'),
  w('F1_J2', 'F1_WAIT'), w('F1_J2', 'F1_R14'), w('F1_J2', 'F1_R15'), w('F1_J2', 'F1_LB'), w('F1_LB', 'F1_ST2'),
  w('F2_ST1', 'F2_J1'), w('F2_LA', 'F2_J1'), w('F2_J1', 'F2_R21'), w('F2_J1', 'F2_R22'), w('F2_J1', 'F2_J2'),
  w('F2_J2', 'F2_WAIT'), w('F2_J2', 'F2_R23'), w('F2_J2', 'F2_R24'), w('F2_J2', 'F2_R25'), w('F2_J2', 'F2_LB'), w('F2_LB', 'F2_ST2'),
  { from: 'G_ST1', to: 'F1_ST1', kind: 'STAIRS', m: 14, name: 'Stairs 1 (G–1)' },
  { from: 'F1_ST1', to: 'F2_ST1', kind: 'STAIRS', m: 14, name: 'Stairs 1 (1–2)' },
  { from: 'G_ST2', to: 'F1_ST2', kind: 'STAIRS', m: 14, name: 'Stairs 2 (G–1)' },
  { from: 'F1_ST2', to: 'F2_ST2', kind: 'STAIRS', m: 14, name: 'Stairs 2 (1–2)' },
  { from: 'G_LA', to: 'F1_LA', kind: 'LIFT', m: 4, name: 'Lift A (G–1)', group: 'LIFT_A' },
  { from: 'F1_LA', to: 'F2_LA', kind: 'LIFT', m: 4, name: 'Lift A (1–2)', group: 'LIFT_A' },
  { from: 'G_LB', to: 'F1_LB', kind: 'LIFT', m: 4, name: 'Lift B (G–1)', group: 'LIFT_B' },
  { from: 'F1_LB', to: 'F2_LB', kind: 'LIFT', m: 4, name: 'Lift B (1–2)', group: 'LIFT_B' },
].map((e, i) => ({ id: `E${i + 1}`, ...e }));

// Closures are toggled per group so "close Lift A" closes every Lift A edge (PRD S5).
export const CLOSABLE = [
  { id: 'LIFT_A', label: 'Lift A' },
  { id: 'LIFT_B', label: 'Lift B' },
  { id: 'G_J1-G_J2', label: 'Ground corridor (mural ↔ tea stall)' },
  { id: 'F1_J1-F1_J2', label: 'Floor 1 corridor (plants ↔ water cooler)' },
  { id: 'STAIRS_1', label: 'Stairs 1' },
];

export const WAIT_ZONES = [
  { id: 'Z_REG', label: 'Registration hall', nodeId: 'G_REG', seats: 40, sps: ['REG1'] },
  { id: 'Z_G', label: 'Ground waiting hall', nodeId: 'G_WAIT', seats: 30, sps: ['LAB1', 'XRAY1', 'PHAR1', 'PHAR2', 'BILL1'] },
  { id: 'Z_1', label: 'Floor 1 waiting', nodeId: 'F1_WAIT', seats: 36, sps: ['GEN1', 'GEN2', 'ORTHO1', 'EYE1'] },
  { id: 'Z_2', label: 'Floor 2 waiting', nodeId: 'F2_WAIT', seats: 36, sps: ['PAED1', 'OBGYN1', 'SKIN1', 'ENT1', 'DENT1'] },
];

// 15 service points.
export const SERVICE_POINTS = [
  { id: 'REG1', type: 'REGISTRATION', label: 'Registration Counter 1', nodeId: 'G_REG', avg: 3 },
  { id: 'GEN1', type: 'DOCTOR', dept: 'GEN', label: 'Dr. Anjali Gupta', nodeId: 'F1_R11', avg: 6 },
  { id: 'GEN2', type: 'DOCTOR', dept: 'GEN', label: 'Dr. Imran Wani', nodeId: 'F1_R12', avg: 6 },
  { id: 'ORTHO1', type: 'DOCTOR', dept: 'ORTHO', label: 'Dr. Rakesh Sharma', nodeId: 'F1_R14', avg: 7 },
  { id: 'EYE1', type: 'DOCTOR', dept: 'EYE', label: 'Dr. Sana Mir', nodeId: 'F1_R15', avg: 5 },
  { id: 'PAED1', type: 'DOCTOR', dept: 'PAED', label: 'Dr. Vikram Singh', nodeId: 'F2_R21', avg: 7 },
  { id: 'OBGYN1', type: 'DOCTOR', dept: 'OBGYN', label: 'Dr. Meenakshi Raina', nodeId: 'F2_R22', avg: 8 },
  { id: 'SKIN1', type: 'DOCTOR', dept: 'SKIN', label: 'Dr. Farooq Bhat', nodeId: 'F2_R23', avg: 5 },
  { id: 'ENT1', type: 'DOCTOR', dept: 'ENT', label: 'Dr. Neha Kotwal', nodeId: 'F2_R24', avg: 6 },
  { id: 'DENT1', type: 'DOCTOR', dept: 'DENT', label: 'Dr. Arjun Dogra', nodeId: 'F2_R25', avg: 8 },
  { id: 'LAB1', type: 'LAB', label: 'Sample Collection G-04', nodeId: 'G_LAB', avg: 4 },
  { id: 'XRAY1', type: 'XRAY', label: 'X-ray G-08', nodeId: 'G_XRAY', avg: 6 },
  { id: 'PHAR1', type: 'PHARMACY', label: 'Pharmacy Counter 1', nodeId: 'G_PHAR', avg: 3 },
  { id: 'PHAR2', type: 'PHARMACY', label: 'Pharmacy Counter 2', nodeId: 'G_PHAR', avg: 3, closed: true },
  { id: 'BILL1', type: 'BILLING', label: 'Billing Counter', nodeId: 'G_BILL', avg: 2 },
];

// Demo-only staff accounts (PRD F9). shortcut: plain demo PINs in seed, replace with real SSO in production.
export const STAFF = [
  { id: 'desk1', name: 'Pooja Verma', role: 'DESK', pin: '1111' },
  { id: 'desk2', name: 'Shabir Ahmed', role: 'DESK', pin: '1112' },
  { id: 'doc-gen1', name: 'Dr. Anjali Gupta', role: 'DOCTOR', pin: '2001', sp: 'GEN1' },
  { id: 'doc-gen2', name: 'Dr. Imran Wani', role: 'DOCTOR', pin: '2002', sp: 'GEN2' },
  { id: 'doc-ortho', name: 'Dr. Rakesh Sharma', role: 'DOCTOR', pin: '2003', sp: 'ORTHO1' },
  { id: 'doc-eye', name: 'Dr. Sana Mir', role: 'DOCTOR', pin: '2004', sp: 'EYE1' },
  { id: 'doc-paed', name: 'Dr. Vikram Singh', role: 'DOCTOR', pin: '2005', sp: 'PAED1' },
  { id: 'doc-obgyn', name: 'Dr. Meenakshi Raina', role: 'DOCTOR', pin: '2006', sp: 'OBGYN1' },
  { id: 'nurse1', name: 'Sr. Rubina Khan', role: 'NURSE', pin: '3001' },
  { id: 'nurse2', name: 'Br. Karan Thakur', role: 'NURSE', pin: '3002' },
  { id: 'edic', name: 'Dr. Suresh Bali (ED in-charge)', role: 'NURSE', pin: '3003' },
  { id: 'pharm1', name: 'Ravi Kumar', role: 'PHARMACY', pin: '4001', sp: 'PHAR1' },
  { id: 'lab1', name: 'Nida Shah', role: 'LAB', pin: '5001', sp: 'LAB1' },
  { id: 'admin', name: 'Dr. K. L. Sharma (MS)', role: 'ADMIN', pin: '9999' },
];

export const ABHA_PROFILES = [
  { abha: 'ramesh.kumar@abdm', name: 'Ramesh Kumar', age: 62, gender: 'M', phone: '9419000001' },
  { abha: 'shabnam.bano@abdm', name: 'Shabnam Bano', age: 34, gender: 'F', phone: '9419000002' },
  { abha: 'om.prakash@abdm', name: 'Om Prakash', age: 71, gender: 'M', phone: '' },
  { abha: 'aisha.dar@abdm', name: 'Aisha Dar', age: 26, gender: 'F', phone: '9419000004' },
  { abha: 'gurpreet.kaur@abdm', name: 'Gurpreet Kaur', age: 45, gender: 'F', phone: '9419000005' },
];

export const DANGER_SIGNS = [
  { id: 'chest', icon: 'HeartCrack' },
  { id: 'breath', icon: 'Wind' },
  { id: 'bleed', icon: 'Droplets' },
  { id: 'faint', icon: 'BedSingle' },
  { id: 'stroke', icon: 'Brain' },
  { id: 'injury', icon: 'Bandage' },
  { id: 'burn', icon: 'Flame' },
  { id: 'pregnant', icon: 'HeartPulse' },
  { id: 'child', icon: 'Baby' },
];

export const DEFAULT_SETTINGS = {
  priorityRatio: { priority: 1, normal: 2 },
  rangeFactor: 1.3,
  alertAhead: 3,
  recallWindowMin: 15,
  liftWaitSec: 60,
  escalateSec: 60,
  welfareFactor: 2,
  crowdingPct: 80,
  capacityWarnPct: 90,
  bottleneckMinutes: 3,
  waitAnywhereMin: 20,
  recheckDangerSigns: true,
};

export const TRIAGE = {
  RED: { label: 'Red', targetMin: 0, desc: 'Immediate' },
  YELLOW: { label: 'Yellow', targetMin: 30, desc: 'Within 30 min' },
  GREEN: { label: 'Green', targetMin: 60, desc: 'Within 1 hour' },
};
