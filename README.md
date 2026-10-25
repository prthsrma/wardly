<p align="center">
  <img src="public/icon.svg" alt="Wardly logo" width="96" />
</p>

<h1 align="center">Wardly</h1>

<p align="center"><b>One token. Every counter. Your language.</b><br/>
Smart queue management and accessible navigation for government hospital OPDs.</p>

<p align="center">
  Hackcache · Smart Queue Management and Accessible Navigation for Government Hospitals<br/>
  Team NovoCore, MIET Jammu · Working prototype with simulated hospital data · ₹0 to run
</p>

---

## The problem

Registration in Indian government hospitals is getting faster (ABDM Scan & Share), but the rest of the visit is not:

- Patients wait about **98.6 min** for a consultation that lasts about **6.5 min**.
- The wait repeats at every counter: registration 38 min, doctor 41 min, sample collection 50 min, pharmacy 61 min.
- **91%** of patients could not find their way using signs alone, and **69.6%** of first-time visitors needed a person to guide them.
- **74.7%** of patients who waited over 3 hours would not come back.
- Only about 45% of people aged 60–69 have a smartphone, and most hospital signs are in English.
- Many emergency departments have no standard way to sort urgent patients from the rest.

## What Wardly does

A patient registers once and gets **one journey token** that follows them through the whole visit — doctor, lab, X-ray, pharmacy — with a live place in line, an expected time for their turn and step-free directions, in their own language. Emergencies are caught on the first screen and sent straight to a nurse, never into a queue.

| Evaluation focus | How Wardly handles it |
|---|---|
| **Ease of registration** | Three ways in: ABHA Scan & Share (mock gateway), a 4-step self-service flow with no OTP or Aadhaar, or a helper registering a relative on their own phone. A live timer shows each registration takes well under 5 minutes. |
| **Language accessibility** | Hindi, Urdu, Dogri, Kashmiri and English, switchable on every screen. Urdu and Kashmiri render right-to-left. Official sign terms kept in brackets, e.g. "हड्डी विभाग (Orthopaedics)". The token's language travels to boards, SMS and staff screens. **Voice guidance is optional** — when switched on, every button reads itself aloud. |
| **Inclusive design** | A needs profile (avoid stairs, wheelchair, low vision, hard of hearing, needs a helper, large text, pregnant) changes routes, alerts and staff screens. Three text sizes, high contrast, read-aloud, flashing + vibrating call for deaf patients, printed slip for patients without a phone, kiosk "Call a helper" button. Priority lane for elderly, disabled and pregnant patients at a ratio set by staff. |
| **Queue-management efficiency** | Live queue at every service point. Doctor taps **Done + next steps** and the token moves to lab / X-ray / pharmacy automatically; the pharmacy and lab see the order **before** the patient arrives. Waits are shown as an honest, rounded-up range plus an **expected turn time based on the last 20 patients at that counter**. Doctor break / absent updates every waiting patient in about a second; whole queues can be moved to another doctor; missed turns can be recalled. |
| **Navigation accuracy** | Hospital modelled as a graph (3 floors, lifts, stairs, landmarks). Landmark directions ("Take Lift B to Floor 1, walk past the water cooler…"), step-free routing, floor maps, QR checkpoint stickers instead of beacons, and slip-to-destination search ("kamra 12", "कमरा 12" and "Room No. 12" all find Room 12). Closing a lift re-routes everyone. Route tests cover 20+ room pairs with stairs on and off. |
| **Emergency handling** | An **Emergency** button on every screen (before registration too) shows the way to Casualty, tells the person to go now or tell any staff, and shows 112 / 108. The first registration screen lists danger signs: "Any of these? Go to Emergency now. You don't need a token." An **I need urgent help** button pins a flag, with sound, to the top of every staff console until someone marks it seen. Nurses set DGHS Red / Yellow / Green; unacknowledged alerts escalate after 60 s. The emergency screen works offline. **The software never decides urgency or tells anyone they can wait.** |
| **Technical execution** | Real-time updates over Socket.IO across devices, role-based staff consoles with server-side permission checks, signed QR codes, rate limiting, offline service worker, 37 automated tests, responsive layout for phone and laptop. |
| **Real-world usefulness** | Built to sit on top of e-Hospital / eSushrut, ABDM-ready, DGHS triage colours, a daily stage-wise wait report formatted for NQAS / Kayakalp review (CSV + print), crowding and bottleneck alerts, evacuation mode, no Aadhaar, ₹0 running cost. |

## Screens

| Screen | URL | Who uses it |
|---|---|---|
| Home + start window | `/` | Everyone |
| Registration | `/register` (`/register?kiosk=1` for kiosk mode) | Patients, helpers |
| Live token status | `/visit/:token` | Patients |
| Where do I go? | `/navigate` | Patients, visitors |
| Emergency | `/emergency` | Anyone |
| Display board | `/board` | Waiting-hall TV |
| SMS / voice-call simulator | `/phone` | Demo only |
| Staff consoles | `/staff` | Desk, doctor, nurse, pharmacy, lab, admin |
| QR checkpoint stickers | `/staff/qr` | Hospital admin (printable) |

## Run it locally

Requires **Node.js 20 or newer**.

```bash
npm install
npm run dev        # http://localhost:5173  (web + API on one port)
```

Production build:

```bash
npm run build
npm start          # serves the built app on http://localhost:5173
```

Tests (queue rules, priority ratio, wait estimates, routing, slip search, emergency permissions, report):

```bash
npm test
```

Optional environment variables:

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 5173) |
| `WARDLY_SECRET` | Key used to sign QR codes and staff sessions. If not set, a random key is generated on each start. |

No API keys or paid services are needed.

## Demo guide

Staff demo accounts (prototype only) are listed on the `/staff` login page — tap one to sign in. Open each role in its own browser tab to see real-time updates.

1. **Register** at `/register`: pick a language → danger signs → "By myself" → details → department → needs → token slip with QR and expected turn time.
2. Open the **live status** from the slip ("Track live"). Keep it open.
3. In another tab, sign in as the **doctor** for that department and tap **Call next** until your token is called. The patient page flashes "It's your turn!" and the board announces it.
4. Tap **Done + next steps → Lab + Pharmacy**. The patient page moves to the lab instantly; the **pharmacy** console already shows the order.
5. Press **Emergency** or **I need urgent help** anywhere; the **nurse** console gets a pinned alert with sound. Leave it for 60 s to see escalation.
6. As **admin**: close Lift B (step-free routes change), turn on evacuation mode, start the live simulation, or generate the daily report.

## Architecture

```
Browser (React + Vite PWA)                         Node.js server (Express + Socket.IO)
├─ Patient app, kiosk, board, staff consoles  ◄──►  ├─ Queue engine (lanes, priority ratio, hand-offs)
├─ 5-language strings, RTL, optional voice          ├─ Wait + expected-turn estimator (last 20 services)
├─ Client-side routing for offline emergency        ├─ Emergency alerts + escalation ladder
└─ Service worker (offline fail-safe)                ├─ Route engine (Dijkstra, step-free, closures)
                                                     ├─ Notification fan-out (push / SMS / IVR simulated)
            shared/  ── hospital data, routing,      ├─ Reports (NQAS-style CSV), audit log
                        estimates, translations      └─ Role-based staff API (signed sessions)
```

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, lucide-react icons, custom Neo-Brutalist CSS |
| Real-time | Socket.IO |
| Backend | Node.js, Express |
| Navigation | Graph of the hospital + Dijkstra (own code), SVG floor maps, QR codes (`qrcode`), browser BarcodeDetector |
| Search | Fuse.js (multilingual fuzzy slip search) |
| Voice | Browser speech synthesis and speech recognition (optional, with tap fallback) |
| Offline | Service worker, queued emergency alerts |
| Tests | Node's built-in test runner |

```
server/   Express API, Socket.IO, queue / alert / report engine (+ tests)
shared/   Hospital seed data, routing, estimates, translations (+ tests)
src/      React app: pages/ (patient, board, emergency…), staff/ (consoles)
public/   Logos, PWA manifest, service worker, audio clip manifest
```

## Privacy and safety

- No Aadhaar is ever asked. ABHA is optional. A phone number is optional and may belong to a relative.
- Display boards and announcements show **token numbers only**, never names.
- QR codes carry a signed token, not personal data.
- Software only raises the alarm for patient-reported danger signs; **only qualified staff assess urgency** and set triage colours (downgrades are audit-logged).
- Staff actions are checked on the server by role; reissues, transfers, triage changes and closures are written to an audit log.

## Prototype limits

- All hospital data is **simulated** ("Demo District Hospital"), and data is kept in memory — it resets when the server restarts.
- ABDM Scan & Share, SMS and voice calls are simulated on screen. Production would use the ABDM gateway, a government SMS / IVR gateway and Bhashini for speech.
- Voice uses the browser's built-in voices; Dogri falls back to a Hindi voice and Kashmiri to an Urdu voice.
- Dogri and Kashmiri text are drafts awaiting native-speaker review, and the danger-sign list needs clinician review.
- Staff consoles and long homepage sections are in English.
- Demo staff PINs are public on purpose so judges can try every role; a real deployment needs proper staff login.

## Research basis

Figures come from: Datta, IJCM 2024 (OPD wait); IJPH 2024, Faridabad (stage waits); Sahoo et al., Cureus 2024 (signage); IJCMPH 2026, GMC Bhopal (wayfinding); Dev et al., Cureus 2026 (return intent); NSS CMS:T 2025 (smartphone access); Krishnan et al., JETS 2025 (ED triage); Salins et al., Mayo Clin Proc Digit Health 2025 (browser wayfinding); Shin, Health Care Manag Sci 2024 (wait ranges); DGHS STG 2025 (triage colours).
