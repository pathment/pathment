from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule

FONT = "Arial"
INK = "1F2933"
HEADER_FILL = PatternFill("solid", fgColor="1F2933")
HEADER_FONT = Font(name=FONT, bold=True, color="FFFFFF", size=10)
BASE_FONT = Font(name=FONT, size=10, color=INK)
TITLE_FONT = Font(name=FONT, bold=True, size=16, color=INK)
SUB_FONT = Font(name=FONT, size=10, color="6B7280")
BOLD = Font(name=FONT, bold=True, size=10, color=INK)
thin = Side(style="thin", color="E4E4E7")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")
TOP = Alignment(vertical="top")
CENTER = Alignment(horizontal="center", vertical="top")

GREEN = PatternFill("solid", fgColor="DCFCE7")
AMBER = PatternFill("solid", fgColor="FEF3C7")
RED = PatternFill("solid", fgColor="FEE2E2")

wb = Workbook()

# ---------------- Guide ----------------
g = wb.active
g.title = "Guide"
g.sheet_view.showGridLines = False
g["A1"] = "Dev Weekend - Mentee Tracker"
g["A1"].font = TITLE_FONT
g["A2"] = "A simple shared sheet for mentors to track each mentee while Pathment is being built."
g["A2"].font = SUB_FONT

rows = [
    ("", ""),
    ("How to use", ""),
    ("1.", "Open in Google Sheets (File, Import, Upload) or Excel. Share with your co-mentors."),
    ("2.", "Mentee Tracker is the main view. One row per mentee, one glance at where everyone is."),
    ("3.", "Daily Log is the day-by-day habit and task tracking. Add a row per mentee per day."),
    ("4.", "1-on-1 Log is for sessions. Every note records who logged it, so attribution stays clear."),
    ("5.", "Keep it honest. The sheet is to help people, not to grade them."),
    ("", ""),
    ("What the columns mean", ""),
    ("Absolute %", "Raw output against the plan. Honest and unforgiving."),
    ("Relative %", "Progress given the circumstances the mentee has logged. The fair read of effort."),
    ("On-time %", "Share of work submitted by its date."),
    ("Momentum", "Up, Flat, or Down over recent weeks."),
    ("Sentiment", "Positive, Neutral, or Low. The engagement and mood read."),
    ("Risk", "On track, Watch, or At risk. Colour-coded so the people who need you stand out."),
    ("Consistency / Communication / Resilience / Independence", "The working-style read, 0 to 100. A gentle read of how someone works, not a grade."),
    ("", ""),
    ("This sheet follows the Dev Weekend methodology. Pathment will automate it later.", ""),
]
r = 4
for a, b in rows:
    g[f"A{r}"] = a
    g[f"B{r}"] = b
    g[f"A{r}"].font = BOLD if b and a and not a.endswith(".") else SUB_FONT if not a else BASE_FONT
    g[f"B{r}"].font = BASE_FONT
    g[f"B{r}"].alignment = WRAP
    r += 1

# section labels bold
for cell in ("A5", "A12"):
    g[cell].font = Font(name=FONT, bold=True, size=11, color=INK)

# mini summary block with live formulas
sr = r + 1
g[f"A{sr}"] = "At a glance (updates from the tracker)"
g[f"A{sr}"].font = Font(name=FONT, bold=True, size=11, color=INK)
summary = [
    ("Mentees tracked", '=COUNTA(\'Mentee Tracker\'!A2:A200)'),
    ("On track", '=COUNTIF(\'Mentee Tracker\'!M2:M200,"On track")'),
    ("Watch", '=COUNTIF(\'Mentee Tracker\'!M2:M200,"Watch")'),
    ("At risk", '=COUNTIF(\'Mentee Tracker\'!M2:M200,"At risk")'),
    ("Average on-time %", '=IFERROR(ROUND(AVERAGE(\'Mentee Tracker\'!J2:J200),0),0)'),
    ("Average absolute %", '=IFERROR(ROUND(AVERAGE(\'Mentee Tracker\'!H2:H200),0),0)'),
]
rr = sr + 1
for label, formula in summary:
    g[f"A{rr}"] = label
    g[f"A{rr}"].font = BASE_FONT
    g[f"B{rr}"] = formula
    g[f"B{rr}"].font = BOLD
    rr += 1

g.column_dimensions["A"].width = 30
g.column_dimensions["B"].width = 88

# ---------------- Mentee Tracker ----------------
t = wb.create_sheet("Mentee Tracker")
t.sheet_view.showGridLines = False
headers = ["Mentee", "Clan", "Level", "Location", "Week", "Current roadmap", "Current step",
           "Absolute %", "Relative %", "On-time %", "Momentum", "Sentiment", "Risk",
           "Open blockers", "Last active", "Nudges (wk)", "Last 1:1", "Next 1:1",
           "Consistency", "Communication", "Resilience", "Independence", "Mentor notes / next steps"]
mentees = [
    ["Aisha Khan","Phoenix Clan","Intermediate","Toronto, CA","6/12","Backend Foundations","3. Add authentication",72,88,84,"Up","Positive","On track",1,"2h ago",0,"May 15","Thu, May 29",85,78,92,70,"Two submissions waiting. JWT refresh-token blocker flagged early. Pair on auth Thursday."],
    ["Diego Morales","Phoenix Clan","Intermediate","Lahore, PK","6/12","Frontend Craft","1. Component composition",41,79,58,"Up","Neutral","Watch",2,"1d ago",0,"May 18","-",55,72,95,60,"Power outages and a shared machine. Struggling despite effort. Protect deadlines, shift due times to AM PKT."],
    ["Priya Nair","Phoenix Clan","Intermediate","Bengaluru, IN","6/12","Not started","-",31,34,44,"Down","Low","At risk",0,"6d ago",2,"May 20","Wed, May 28",40,38,50,65,"Disengagement risk. No login for 6 days, two nudges unanswered. Direct warm check-in. Psychologist session held May 20."],
    ["Liam Walsh","Phoenix Clan","Intermediate","Dublin, IE","6/12","Not started","-",95,76,97,"Flat","Positive","On track",0,"5h ago",0,"-","-",96,65,70,90,"Top of cohort on output, almost always early. May be coasting on easy ground. Add a stretch track."],
    ["Fatima Noor","Phoenix Clan","Intermediate","Karachi, PK","6/12","Not started","-",64,71,79,"Up","Positive","On track",1,"3h ago",0,"-","-",80,85,75,72,"Solid and improving three weeks running. One async/await blocker, working at it."],
    ["Tomas Berg","Phoenix Clan","Intermediate","Oslo, NO","6/12","Not started","-",53,49,62,"Down","Neutral","Watch",1,"2d ago",0,"-","-",60,70,64,68,"Drifting, two late tasks this week. Still responsive. A short check-in now prevents a bigger slide."],
]
t.append(headers)
for row in mentees:
    t.append(row)
BLANK_ROWS = 12
for _ in range(BLANK_ROWS):
    t.append([""] * len(headers))

ncols = len(headers)
nrows = 1 + len(mentees) + BLANK_ROWS
# header style
for c in range(1, ncols + 1):
    cell = t.cell(row=1, column=c)
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    cell.border = BORDER
# body style
center_cols = set(range(8, 23))  # numeric + status columns
for rrow in range(2, nrows + 1):
    for c in range(1, ncols + 1):
        cell = t.cell(row=rrow, column=c)
        cell.font = BASE_FONT
        cell.border = BORDER
        if c == ncols:
            cell.alignment = WRAP
        elif c in center_cols:
            cell.alignment = CENTER
        else:
            cell.alignment = TOP

widths = [16,14,13,15,7,18,22,10,10,10,11,11,11,8,11,9,10,12,11,13,10,12,52]
for i, w in enumerate(widths, start=1):
    t.column_dimensions[get_column_letter(i)].width = w
t.row_dimensions[1].height = 28
t.freeze_panes = "B2"

# dropdowns
def add_dv(col_letter, options):
    dv = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=True)
    dv.add(f"{col_letter}2:{col_letter}{nrows}")
    t.add_data_validation(dv)

add_dv("K", ["Up", "Flat", "Down"])
add_dv("L", ["Positive", "Neutral", "Low"])
add_dv("M", ["On track", "Watch", "At risk"])

# risk colour coding
rng = f"M2:M{nrows}"
t.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"At risk"'], fill=RED, font=Font(name=FONT, size=10, color="991B1B")))
t.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Watch"'], fill=AMBER, font=Font(name=FONT, size=10, color="92400E")))
t.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"On track"'], fill=GREEN, font=Font(name=FONT, size=10, color="166534")))

# ---------------- Daily Log ----------------
d = wb.create_sheet("Daily Log")
d.sheet_view.showGridLines = False
dheaders = ["Date","Mentee","Journaling","Morning reading","Mindset talk (breakfast)","Core work",
            "Engineering talk (lunch)","Dean talk (dinner)","Weekend grind","Family time","Tasks done today","Note"]
daily = [
    ["Mon May 26","Aisha Khan","Yes","Yes","Yes","Yes","Yes","Yes","-","-","SQL Fundamentals quiz","Mindset talk hit home, kept focus through the SQL quiz."],
    ["Tue May 27","Aisha Khan","Yes","Yes","Yes","Yes","Yes","No","-","-","","Missed the dean talk, ran late on the API work."],
    ["Wed May 28","Aisha Khan","Yes","Yes","Yes","Yes","Yes","Yes","-","-","Build REST API","Good focus day."],
    ["Sat May 31","Aisha Khan","-","-","-","-","-","-","Yes","Yes","Auth roadmap progress","Ten hour grind on auth, then family dinner."],
    ["Mon May 26","Diego Morales","Yes","No","Yes","Yes","Yes","Yes","-","-","","Power back by morning, used it well."],
]
d.append(dheaders)
for row in daily:
    d.append(row)
for _ in range(20):
    d.append([""] * len(dheaders))
dn = 1 + len(daily) + 20
for c in range(1, len(dheaders) + 1):
    cell = d.cell(row=1, column=c)
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    cell.border = BORDER
for rrow in range(2, dn + 1):
    for c in range(1, len(dheaders) + 1):
        cell = d.cell(row=rrow, column=c)
        cell.font = BASE_FONT
        cell.border = BORDER
        cell.alignment = WRAP if c == len(dheaders) else (CENTER if 3 <= c <= 10 else TOP)
dwidths = [12,16,11,15,22,11,20,18,13,12,20,46]
for i, w in enumerate(dwidths, start=1):
    d.column_dimensions[get_column_letter(i)].width = w
d.row_dimensions[1].height = 40
d.freeze_panes = "C2"
yesno = DataValidation(type="list", formula1='"Yes,No,-"', allow_blank=True)
yesno.add(f"C2:J{dn}")
d.add_data_validation(yesno)

# ---------------- 1-on-1 Log ----------------
o = wb.create_sheet("1-on-1 Log")
o.sheet_view.showGridLines = False
oheaders = ["Date","Mentee","Logged by","Type","Sentiment","Summary","Issues raised","Next steps"]
ones = [
    ["May 15","Aisha Khan","Sarah Chen","1:1","Positive","Discussed career goals, wants to move into backend. Motivated, prefers async written feedback.","","Share backend track. Pair on auth Thursday."],
    ["May 18","Diego Morales","Sarah Chen","1:1","Neutral","Shares a laptop with sibling, reliable power only in the mornings.","Shared hardware, evening power cuts","Shift due times to AM PKT. Check in next week."],
    ["May 6","Priya Nair","Sarah Chen","1:1","Low","Quieter than usual, mentioned feeling behind the cohort.","Comparison to peers","Personal check-in. Reassure on pace."],
    ["May 20","Priya Nair","Dr. Maya Brooks","Psychological session","Neutral","Initial session, anxiety around pace and comparison to peers. Coping strategies discussed.","Anxiety, pace","Follow-up in two weeks."],
]
o.append(oheaders)
for row in ones:
    o.append(row)
for _ in range(20):
    o.append([""] * len(oheaders))
on = 1 + len(ones) + 20
for c in range(1, len(oheaders) + 1):
    cell = o.cell(row=1, column=c)
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
    cell.border = BORDER
for rrow in range(2, on + 1):
    for c in range(1, len(oheaders) + 1):
        cell = o.cell(row=rrow, column=c)
        cell.font = BASE_FONT
        cell.border = BORDER
        cell.alignment = WRAP if c in (6, 7, 8) else (CENTER if c == 5 else TOP)
owidths = [10,16,16,22,11,46,28,40]
for i, w in enumerate(owidths, start=1):
    o.column_dimensions[get_column_letter(i)].width = w
o.row_dimensions[1].height = 16
o.freeze_panes = "A2"
otype = DataValidation(type="list", formula1='"1:1,Pairing session,Career chat,Psychological session,Check-in"', allow_blank=True)
otype.add(f"D2:D{on}")
o.add_data_validation(otype)
osent = DataValidation(type="list", formula1='"Positive,Neutral,Low"', allow_blank=True)
osent.add(f"E2:E{on}")
o.add_data_validation(osent)

out = r"D:\Projects\pathment\mentor-tracking-sheet\Dev Weekend - Mentee Tracker.xlsx"
wb.save(out)
print("saved", out)
