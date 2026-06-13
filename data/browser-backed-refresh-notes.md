# Browser-Backed Refresh Notes

These sources are useful but can block simple shell fetches. When `curl` or Node
fetch returns a Cloudflare challenge, use the in-app browser and read the
rendered page. Prefer official pages over Patch or other directory reposts.

## Somerset County Park Commission

Base site: `https://www.somersetcountyparks.org/`

Observed behavior:

- Simple shell fetches can return a Cloudflare managed challenge.
- Rendered pages are readable in the in-app browser.
- For park subpages, open the park landing page first and click the sidebar link
  from the rendered DOM. Direct subpage navigation can be less reliable during a
  fresh session.
- Park calendar `Upcoming` pages may say no upcoming events even when sidebar
  program pages contain dated public activities.

### Duke Island Park

Source record: `duke-island-park`

Refresh path:

1. Open `https://www.somersetcountyparks.org/duke-island-park`.
2. Click the sidebar link named `2026 Summer Concert Series`.
3. Read the rendered article headings and nearby bold time text.
4. Import only rows whose heading says `at Duke Island Park`.
5. Exclude the July 3 Independence Day Fireworks row from Duke Island Park; that
   event belongs to North Branch Park.
6. Use `https://www.somersetcountyparks.org/duke-island-park/pages/2026-summer-concert-series`
   as `sourceUrl` for imported concert rows.

2026 rows captured on 2026-06-13:

- July 12, 2026, 6:30 PM-8:00 PM: Arena Flashback
- July 19, 2026, 6:30 PM-8:00 PM: The Tee Tones
- July 26, 2026, 6:30 PM-8:00 PM: Whiskey & Roses
- August 2, 2026, 6:30 PM-8:00 PM: Starman - David Bowie
- August 9, 2026, 6:30 PM-8:00 PM: High in the Mid 80's

Normalization notes:

- Category: `outdoor-concert`
- Cost: `Free`
- Registration: `None required`
- Venue: `Duke Island Park`
- Address: `191 Old York Road, Bridgewater, NJ 08807`
- Coordinates used: `40.5555576`, `-74.6650838`

### North Branch Park

Source record: `north-branch-park`

Refresh path:

1. Open `https://www.somersetcountyparks.org/north-branch-park`.
2. Click the sidebar link named `Independence Day Fireworks`.
3. Read the article body for the event date, gate-opening time, fireworks time,
   admission, activities, and restrictions.
4. Click the sidebar link named `Special Events` for venue-context evidence.
5. Do not duplicate Patch rows when a matching event already exists; update the
   existing event to prefer the official event page.

2026 Independence Day Fireworks captured on 2026-06-13:

- Date: July 3, 2026
- Gates open: 6:00 PM
- Fireworks begin: 9:30 PM
- Admission: Free
- Activities/details: family picnicking, food trucks, NJ 3rd Regiment
  Revolutionary War encampment, lawn chairs or blankets encouraged
- Restrictions: alcohol and personal fireworks are prohibited
- Source URL:
  `https://www.somersetcountyparks.org/north-branch-park/pages/independence-day-fireworks`

Normalization notes:

- Category: `holiday-event`
- Start: `2026-07-03T18:00:00`
- End: use an estimated `2026-07-03T22:00:00` unless an official end time is
  later published; keep a `reviewNotes` explanation that the display starts at
  9:30 PM and post-event traffic flow can continue after the display.
- Venue: `North Branch Park`
- Address: `355 Milltown Rd, Bridgewater, NJ 08807`
- Current coordinates in imported row: `40.5792198`, `-74.67815449999999`

Somerset County 4-H Fair:

- The North Branch Park `Special Events` page confirms the park hosts the
  Somerset County 4-H Fair in August.
- On 2026-06-13, that official page did not list exact 2026 fair dates or daily
  hours.
- Keep existing Patch-dated daily rows with an official venue-context evidence
  link until a fuller official fair page is found.
- Do not create additional duplicate fair rows from the Special Events page
  alone.

### Washington Valley Park

Source record: `washington-valley-park`

Refresh path:

1. Open `https://www.somersetcountyparks.org/washington-valley-park`.
2. Click the sidebar link named `Washington Valley Hawk Watch`.
3. Read the rendered Hawk Watch article.
4. Check `Programs` -> `Park Ranger Programs` and `Junior Rangers` only as
   supporting context; these pages are not Washington Valley dated event feeds.

2026-06-13 result:

- No specific upcoming dated public event was found for Washington Valley Park.
- The Hawk Watch page describes a seasonal viewing area active from August
  through November, but it does not provide exact 2026 public event dates,
  start/end times, or host-led sessions.
- Park Ranger Programs are group/appointment-based and should not be imported as
  public calendar events without a specific dated listing.
- Junior Rangers says the program is suspended until further notice.

Normalization notes:

- Do not expand the broad August-November Hawk Watch season into daily event
  rows.
- Keep Washington Valley Park as a manual/browser-backed source for future
  seasonal checks.
- If a future official page lists dated hawk-watch walks, ranger hikes, fishing
  clinics, or public nature programs at Washington Valley Park, import those
  dated rows with venue `Washington Valley Park` and sourceId
  `washington-valley-park`.
