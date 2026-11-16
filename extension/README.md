# JobPilot AI browser extension (Chrome, Manifest V3)

Fills job application forms on employers' sites with the user's details, their saved screening
answers and the CV JobPilot AI tailored for that job. The user checks the form and presses Submit.

## Install (beta)

1. Chrome → `chrome://extensions` → switch on **Developer mode**.
2. **Load unpacked** → choose this `extension` folder.
3. In JobPilot AI: Account → Browser extension → **Get a connection code**.
4. Click the JobPilot AI icon, enter the site's address and the code, and press Connect.

## How it behaves

- Runs only when the user clicks **Fill this form**. There are no content scripts that run on
  their own.
- Never runs on LinkedIn or Indeed (`blocked.js`, checked again inside `fill.js`).
- Fills: first, last or full name, email, phone, LinkedIn, GitHub, website, location, current
  company and title, school, degree, skills, and saved answers (right to work, sponsorship, notice
  period, salary, relocation, and the user's own saved questions). Attaches the tailored CV to a
  resume or CV upload field.
- Never answers sensitive questions (disability, ethnicity, race, health, criminal record, religion,
  sexual orientation, gender, veteran status and similar): they are outlined in amber with a note.
  So is every question without a saved answer, every tick box and every other upload.
- Never clicks, submits or presses Enter. A banner on the page reminds the user to submit.
- Stores only the site address and the connection code (`chrome.storage.local`). CV details are
  fetched when the user clicks Fill, passed to the page once and not kept. Codes expire after 12 hours.
- **Mark as applied** records the application in JobPilot AI.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Permissions: `storage`, `scripting`, `activeTab`; host access to `https` sites and local addresses, used only to fill the page the user asks for and to reach JobPilot AI |
| `background.js` | Talks to JobPilot AI with the connection code; injects `fill.js` when asked |
| `fill.js` | Runs in the page: fills, attaches, highlights. Never submits |
| `popup.html`, `popup.css`, `popup.js` | The window shown when the icon is clicked |
| `blocked.js` | Sites the extension refuses |

## Tests

`e2e/extension.spec.ts` loads this folder into Chromium and fills a Greenhouse-style and a
Lever-style form served from `e2e/fixtures/`. See the main README.
