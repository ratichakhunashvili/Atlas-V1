# Admin console audit — 2026-11-05

A hands-on audit of every admin page and action, acting as an administrator, plus a read of all the admin code. Then the fixes, and a second pass re-testing each fix in the browser.

**Where it ran:** a throwaway PostgreSQL on this computer, with all 25 migrations and the dev fixtures (two hotels, seven places). Nothing touched Neon or the live site atlas-v1.1. I signed in as the local fixture admin. One extra run used `ATLAS_DEPLOYMENT_ENV=production` to check what the live site will show.

**Checks on the final code:**
- Typecheck: clean.
- Lint: 0 errors. The 2 warnings were there before, in the old `atlas-guest-prototype/` folder.
- Tests: **1183 of 1183 pass**, 10 more than before.
- Production build: passes.

Severity: **High** = broken, crashes, or breaks a product rule. **Medium** = confusing, or a missing safety step. **Low** = polish.

## 1. Broken or unsafe

| # | Area | What was wrong | Severity | Status |
|---|------|----------------|----------|--------|
| 1 | Every admin page | When the computer is in dark mode, the default text turned light grey on the cream background. "Edit hotel", the "Hotel entry QR" title and the Place dropdown were nearly invisible. | High | **Fixed, re-tested in dark mode.** The console now always draws light, in Atlas colours. |
| 2 | Hotel partnerships, Hotel facilities | Another **hotel** could be added and confirmed as a "partner" or facility of a hotel. In testing, Hotel B became an *active* partner of Hotel A, so Hotel A's guests could have been recommended a different hotel. | High | **Fixed, re-tested.** Hotels are no longer offered in the dropdowns, and the server refuses them even when the form is tampered with ("A hotel can't be another hotel's partner."). New unit tests cover it. |
| 3 | Edit hotel | Choosing a place that already belongs to another hotel crashed the page. Creating or editing a hotel could also silently turn a contracted business, a facility or a partner into a hotel. | High | **Fixed, re-tested.** It now gives a clear sentence ("This place already belongs to another hotel."). New rules, with tests. |
| 4 | Detail pages | A mistyped id in the address (e.g. `/admin/places/abc`) crashed with a server error. | Medium | **Fixed, re-tested.** It now shows "Not found" on hotels, places, achievements, models and the hotel sub-pages. |
| 5 | Hotel events | Typed times were read in the *server's* time zone. On Vercel (UTC), an event typed as 18:00 would have been saved as 22:00 Tbilisi time. | High | **Fixed, re-tested.** Times are read and shown as Tbilisi time, and the form says so. Unit tests prove it works whatever the server's zone. |
| 6 | Advisor testing | Any `%` in an error message crashed the page. Delete scenario and Promote test user had no live-site guard, and promoting someone to admin wasn't audited. | Medium | **Fixed, re-tested.** On the live site the page says it's turned off and every action refuses. Promotion is now in the audit log. |
| 7 | Hotel events | Cancel didn't check the event was still scheduled, so a stale page or a double click could act twice. | Low | **Fixed.** Facility activate/deactivate sets a value, so repeating it is already harmless. |

## 2. Feedback and safety

| # | Area | What was wrong | Severity | Status |
|---|------|----------------|----------|--------|
| 8 | Places, Hotels, Events | Saving gave no "Saved" message. | Medium | **Fixed, re-tested.** Every save, create, archive, delete and cancel now says what happened. |
| 9 | A place's own page | Contract and kind buttons threw the admin over to the Contracts page. | Medium | **Fixed, re-tested.** You stay on the page you were on. The return address is strictly checked, so it can't be abused as a redirect. |
| 10 | Destructive buttons | Revoke QR, replace QR, End/Suspend contract, Suspend/Revoke partnership, Archive and Delete place, Delete hotel, Cancel event, Deactivate facility, grant/remove admin, Remove model, Remove camera reference, Delete achievement and Delete scenario all acted instantly. | Medium | **Fixed, re-tested.** Each now asks "are you sure?" and names what will happen. Cancelling stops it. |
| 11 | New achievement | A typo sent the admin to the list and erased everything typed. | Medium | **Fixed, re-tested.** You stay on the form with your values. |
| 12 | Hotel events, Edit place | A validation error erased the typed values. Cancelled events stayed under "Scheduled". | Low | **Fixed, re-tested.** Values are kept. The lists are now "Upcoming" and "Past and cancelled". |
| 13 | Place kind dropdown | It offered "Hotel" for places that can never be a hotel. | Low | **Fixed, re-tested.** |
| 14 | Guest support | The result didn't say which email it was for. | Low | **Fixed, re-tested.** |
| 15 | Achievements | Delete existed in code but no button reached it. | Low | **Fixed, re-tested.** It's on the achievement's page, only while nobody has earned it. |
| 16 | Places | Archive / Unarchive / Delete were only on a hidden page. | Medium | **Fixed, re-tested.** They're on each place's page. Delete is refused with a clear reason when the place has history. |

## 3. Navigation

| # | Area | What was wrong | Severity | Status |
|---|------|----------------|----------|--------|
| 17 | Sidebar | Eight working pages had no link anywhere. | Medium | **Fixed.** The menu now has three groups: Catalogue, Guest experience, Operations. Advisor testing appears only on local/dev builds (checked in live-site mode). |
| 18 | "Facilities" and "QR codes" in the menu | Both opened **Figma sample screens with fake data**. "Create code" and "Revoke code" did nothing. | High | **Fixed, re-tested.** They are now real lists. QR codes shows every live code, which hotels have no code yet, and links to where to issue or revoke. |
| 19 | Sample screens (`/hotels/edit`, `/places/edit`, `/partners/edit`, `/facilities/edit`, `/achievements/edit`, `/qr/new`, `/qr/created`, `/qr/revoke`) | Fake data reachable by address. | Medium | **Fixed, checked in live-site mode.** They redirect to the real screens. They stay viewable on local/dev builds as a design reference, per your earlier "hide in production" decision. |
| 20 | Hotels | There were two hotel lists, and saving sent you to the old one. Hotel names looked like links but weren't. | Medium | **Fixed, re-tested.** There is one list. Names are links in every table. |
| 21 | Edit hotel / place / achievement | Generic headings ("Edit hotel"), with no way back. | Low | **Fixed.** The heading is the record's name, with a ← back link. |

## 4. Wording and look

| # | Area | What was wrong | Severity | Status |
|---|------|----------------|----------|--------|
| 22 | Whole console | About 20 older pages used grey "slate" styling and Arial. | Low | **Fixed.** Remapped to the Atlas palette and Manrope **inside the admin only**. Guest screens are untouched. |
| 23 | Wording | "Hotel partners" / "External partners" / "Partners" for one thing. Raw values such as `pending review`, `room service`, `restaurant`. Achievements called "badges" in some places. | Low | **Fixed.** It's "Hotel partnerships" everywhere, values read as normal words, and admin screens say "Achievement". |
| 24 | Places list | It said "A hotel only shows one it has a partnership with", which is wrong because facilities need none. | Low | **Fixed.** A **Kind** column was added too (a "?" means not yet confirmed). |
| 25 | "Attractions" page | Its name now clashes with the new catalogue meaning, and its counts included suspended, pending and revoked partnerships. | Low | **Fixed.** Renamed **Guest reach**, and it only counts what lets a guest see the place today. |
| 26 | Achievements list | It said "Active" even when the place was a draft. | Low | **Fixed, re-tested.** It now says Inactive until the place is published and verified. |
| 27 | Browser tab titles | About 18 pages had no title. | Low | **Fixed.** |
| 28 | Hotel partnerships | The Featured & offer form appeared on suspended and revoked partnerships. | Low | **Fixed, re-tested.** |
| 29 | Audit log | It shows raw action keys and ids. | Low | **Open.** Readable enough for an admin, so left alone. |
| 30 | Edit hotel's place dropdown | It still lists places the server will refuse (facilities, partners). | Low | **Open.** The server refuses them with a clear sentence. Hiding them needs an extra query, which wasn't worth it this pass. |

## Everything tested by hand (after the fixes)

- **Sign-in and access:** wrong password shows an error; an empty form is blocked; signed-out visitors are sent to sign-in; a non-admin gets "Access denied"; sign out works.
- **Hotels:** list, edit (with error), delete refused with a reason while the hotel has guests, hotel QR issue / replace / revoke.
- **Places:** create, edit (error keeps the values), archive, unarchive, delete (refused with history, allowed without).
- **Contracts and kinds:** propose / confirm / suspend / resume / end contract from both pages, plus the kind guard rails.
- **Hotel partnerships:** propose / confirm / suspend / revoke / re-open, featured & offer, and a hotel refused as a partner.
- **Hotel facilities:** add, deactivate / activate, and a hotel refused as a facility.
- **Hotel events:** schedule (error keeps the values, Tbilisi time) and cancel.
- **Achievements:** create (error keeps the values), edit, delete.
- **Staff access:** grant and remove admin, with confirmation; Cancel really stops it.
- **Guest support:** lookup, audited.
- **Other pages:** audit log, analytics (7 / 30 / 90 days, bad value falls back to 30), the QR codes and Hotel facilities lists, Advisor testing (create, promote, delete; off in live-site mode), and a dark-mode, narrow-screen and wide-screen look.

**Not tested:** uploading a 3D model (file storage isn't configured, and the page says so), saving a camera reference (needs a photo), and anything on a phone.

## Please check on the live site

- **atlas-v1.1 → Hotel partnerships:** make sure no hotel is listed as another hotel's partner, and that no hotel is listed as a facility. Bug #2 made both possible, and I can't read your live database.
- Nothing in this audit changed your Neon data.
