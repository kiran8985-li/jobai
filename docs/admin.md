# Admin panel

Only accounts with `is_admin` see the Admin link and can open `/admin` or `/api/admin/*`. The
middleware answers 403 to everyone else, and every admin page, action and API checks `is_admin` on
the server again before touching any data. The first account created is the admin.

| Page | What it does |
| --- | --- |
| Overview | Users, jobs stored, applications by status, the last 10 scans |
| Users and invites | Create an invite link (copy it and send it yourself), withdraw an open invite, list users, open a user's activity |
| A user's activity | Status, searches, recent applications, AI calls today against the daily limit, AI cost. Suspend or restore the account. Never shows CV contents, screening answers or emails |
| Job sources | Each source's state, last run, jobs fetched and last error. Switch a source off or on; run one now |
| Application log | Every application, filterable by status, user and period, with the skip reason or error |
| AI usage | Calls, tokens and estimated cost by purpose and by user, with the daily limit |
| System health | When the scheduler last finished a scan (warns after 30 minutes), configuration checks, every error in the last 24 hours |

`GET /api/admin/summary` returns the health summary as JSON for the admin.

## Notes

- **Suspending** an account also ends all its sessions, so the person is signed out at once, and
  the login form tells them the account is suspended. Admins cannot suspend themselves or other admins.
- **Switching a source off** is stored in `source_status.enabled`. The next scan skips it, and
  "Run now" is hidden until it is switched back on.
- **Invite emails are not sent automatically yet.** Creating an invite gives you a link to send.
- **AI cost** is an estimate: tokens × the prices in `AI_PRICE_INPUT_PER_MTOK` and
  `AI_PRICE_OUTPUT_PER_MTOK` (US dollars per million tokens). Set them to your provider's prices.
