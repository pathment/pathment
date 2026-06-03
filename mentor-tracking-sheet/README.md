# Mentee tracking sheet

A good-enough sheet for mentors to track each mentee while Pathment is being
built. It follows the Dev Weekend methodology, see `../METHODOLOGY.md`. When
Pathment is ready it will do all of this automatically.

## The file

`Dev Weekend - Mentee Tracker.xlsx` has four tabs:

- **Guide** how to use it, what each column means, and an at-a-glance summary
  that updates from the tracker (mentees, on track, watch, at risk, averages).
- **Mentee Tracker** one row per mentee. The single view of where everyone is:
  roadmap and step, absolute and relative progress, on-time rate, momentum,
  sentiment, risk (colour-coded), blockers, last and next 1:1, the working-style
  read, and mentor notes.
- **Daily Log** day-by-day habit and task tracking, the talks, journaling,
  reading, core work, the weekend grind and family time, plus a note.
- **1-on-1 Log** session notes, with a "Logged by" column so every read is
  attributed, including a psychologist or other specialist.

It comes prefilled with example mentees so you can see how it is meant to be
used. Clear the example rows and add your own.

## How to use it

1. Open in Google Sheets: New sheet, File, Import, Upload, choose this file,
   then Replace spreadsheet. Or open directly in Excel.
2. Share it with your co-mentors with comment or edit access.
3. Update the tracker as you go, log the day in Daily Log, and record sessions
   in 1-on-1 Log.

Risk, Momentum, Sentiment, and session Type use dropdowns so everyone stays
consistent. The risk column turns green, amber, or red so the people who need
you stand out.

`build_tracker.py` is the script that generates the file, kept so the sheet can
be regenerated if the columns change.
