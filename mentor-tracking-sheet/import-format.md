# Import format for Pathment

This is the shape the tracking sheet keeps so Pathment can import it later,
without making the sheet any harder to fill. If you just fill the sheet normally
and leave the headers and dropdowns alone, it will import.

## The simple rules

- Each data tab is a flat table. Row 1 is the header, every row after it is one
  record. Do not insert extra header rows or merge cells in the data tabs.
- Keep the header names as they are.
- Keep the dropdown values as they are. They are the vocabulary Pathment reads.
- Email is the key. Every mentee has one email on the Mentee Tracker. The Daily
  Log and the 1-on-1 Log refer to a mentee by name from a dropdown, and Pathment
  matches that name back to the email.
- The Guide tab is notes for humans. Pathment ignores it on import.
- On the Weekly Tracker, the blue week bars are visual dividers. Skip any row
  where Mentee is empty. Every real row carries its own "Week of" date, so the
  data does not depend on the bar.
- To hand it over, export each data tab to CSV (UTF-8), or just share the file.

## Weekly Tracker maps to weekly check-ins

Key: Email (or Mentee) plus Week of.

| Column | Pathment field | Notes / allowed values |
| --- | --- | --- |
| Week of | week | the Monday of that week, a date |
| Mentee | mentee | name, matched to email |
| Email | email | the key, may be blank if Mentee is set |
| Journaling /5 | journaling adherence | days done out of the 5 weekdays |
| Reading /5 | morning reading adherence | days done out of 5 |
| Mindset talk /5 | mindset talk adherence | days done out of 5 |
| Eng. talk /5 | engineering talk adherence | days done out of 5 |
| Dean talk /5 | dean talk adherence | days done out of 5 |
| Core work assigned | assigned task | free text, what was set this week |
| Core work completed | completed task | free text, what they finished |
| Core % | core completion | 0 to 100 |
| Grind h /10 | weekend grind hours | hours done out of the 10-hour target |
| Family time | family time | Yes, No |
| Points /10 | weekly score | 0 to 10, the mentor's mark for the week |
| Risk | risk | On track, Watch, At risk |
| Feedback / focus for next week | note | free text |

The habit and talk columns line up with the schedule: the target is the five
weekday days, so a 4 means four of the five days. Core work carries the actual
assigned and completed tasks and the percent done. The grind is hours out of
ten. That is what was assigned, what was completed, and how much.

## Mentee Tracker maps to mentees

Key: Email.

| Column | Pathment field | Notes / allowed values |
| --- | --- | --- |
| Mentee | name | |
| Email | email | the unique key |
| Clan | clan | |
| Level | level | |
| Location | location | |
| Week | program week | format X/Y, for example 6/12 |
| Current roadmap | roadmap | a roadmap name, or "Not started" |
| Current step | roadmap step | format "N. Title", or "-" |
| Absolute % | absolute progress | 0 to 100 |
| Relative % | relative progress | 0 to 100 |
| On-time % | on-time rate | 0 to 100 |
| Momentum | momentum | Up, Flat, Down |
| Sentiment | sentiment | Positive, Neutral, Low |
| Risk | risk | On track, Watch, At risk |
| Open blockers | open blockers | a count |
| Last active | last active | free text, informational |
| Nudges (wk) | nudges this week | a count |
| Last 1:1 | last 1:1 | date text |
| Next 1:1 | next 1:1 | date text |
| Consistency | personality.consistency | 0 to 100 |
| Communication | personality.communication | 0 to 100 |
| Resilience | personality.resilience | 0 to 100 |
| Independence | personality.independence | 0 to 100 |
| Mentor notes / next steps | notes | free text |
| Points to date | total weekly points | computed by the sheet, sum of this mentee's weekly points |

## Daily Log maps to daily logs

Key: Mentee plus Date.

| Column | Pathment field | Notes / allowed values |
| --- | --- | --- |
| Date | date | the day |
| Mentee | mentee | name from the dropdown, matched to email |
| Journaling | slot done | Yes, No, or - |
| Morning reading | slot done | Yes, No, or - |
| Mindset talk (breakfast) | slot done | Yes, No, or - |
| Core work | slot done | Yes, No, or - |
| Engineering talk (lunch) | slot done | Yes, No, or - |
| Dean talk (dinner) | slot done | Yes, No, or - |
| Weekend grind | slot done | Yes, No, or - |
| Family time | slot done | Yes, No, or - |
| Tasks done today | tasks done | free text |
| Note | note | free text |

A dash means the slot is not scheduled that day, for example the weekday talks
on a weekend, or the grind on a weekday.

## 1-on-1 Log maps to meeting notes

| Column | Pathment field | Notes / allowed values |
| --- | --- | --- |
| Date | date | the day |
| Mentee | mentee | name from the dropdown |
| Logged by | by | who logged it, for attribution |
| Type | kind | 1:1, Pairing session, Career chat, Psychological session, Check-in |
| Sentiment | sentiment | Positive, Neutral, Low |
| Summary | summary | free text |
| Issues raised | issues | free text |
| Next steps | next steps | free text |

That is the whole format. Nothing here changes how you use the sheet day to day,
it just means the work you put in now carries straight into Pathment later.
