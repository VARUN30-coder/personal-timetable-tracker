"""Personal Timetable & Daily Task Tracker - Flask + SQLite backend."""
import sqlite3
from datetime import date, timedelta
from flask import Flask, g, jsonify, render_template, request

app = Flask(__name__)
DB = "database.db"

COLS = [
    "name", "notes", "start", "end", "category",
    "priority", "date", "repeat", "days",
]


def db():
    """One SQLite connection per request."""
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_):
    conn = g.pop("db", None)
    if conn:
        conn.close()


def init_db():
    with sqlite3.connect(DB) as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS tasks("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name TEXT NOT NULL, "
            "notes TEXT DEFAULT '', "
            "start TEXT NOT NULL, "
            "end TEXT NOT NULL, "
            "category TEXT DEFAULT 'Other', "
            "priority TEXT DEFAULT 'Medium', "
            "date TEXT NOT NULL, "
            "repeat TEXT DEFAULT 'none', "
            "days TEXT DEFAULT '')"
        )
        c.execute(
            "CREATE TABLE IF NOT EXISTS status("
            "task_id INTEGER, "
            "date TEXT, "
            "status TEXT, "
            "PRIMARY KEY(task_id, date))"
        )
        c.execute(
            "CREATE TABLE IF NOT EXISTS goals("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "text TEXT NOT NULL)"
        )
        c.execute(
            "CREATE TABLE IF NOT EXISTS goal_log("
            "goal_id INTEGER, "
            "date TEXT, "
            "PRIMARY KEY(goal_id, date))"
        )
        c.execute(
            "CREATE TABLE IF NOT EXISTS reviews("
            "date TEXT PRIMARY KEY, "
            "notes TEXT)"
        )


def occurs(t, d):
    """Does task t appear on date d?"""
    start = date.fromisoformat(t["date"])
    if d < start:
        return False
    rep = t["repeat"]
    wd = d.weekday()
    if rep == "none":
        return d == start
    if rep == "daily":
        return True
    if rep == "weekdays":
        return wd < 5
    if rep == "weekly":
        return wd == start.weekday()
    if rep == "custom":
        return str(wd) in t["days"].split(",")
    return False


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/range")
def get_range():
    """Return {date: [tasks with status]} for start..end."""
    s = date.fromisoformat(request.args["start"])
    e = date.fromisoformat(request.args["end"])
    tasks = [dict(r) for r in db().execute("SELECT * FROM tasks")]
    st = {}
    for r in db().execute("SELECT * FROM status"):
        st[(r["task_id"], r["date"])] = r["status"]
    out = {}
    d = s
    while d <= e:
        key = d.isoformat()
        day_tasks = []
        for t in tasks:
            if occurs(t, d):
                item = dict(t)
                item["status"] = st.get((t["id"], key), "pending")
                day_tasks.append(item)
        day_tasks.sort(key=lambda x: x["start"])
        out[key] = day_tasks
        d += timedelta(days=1)
    return jsonify(out)


@app.post("/api/tasks")
def add_task():
    j = request.json
    names = ",".join(COLS)
    marks = ",".join("?" for _ in COLS)
    sql = "INSERT INTO tasks(" + names + ") VALUES(" + marks + ")"
    db().execute(sql, [j.get(c, "") for c in COLS])
    db().commit()
    return jsonify(ok=True)


@app.put("/api/tasks/<int:tid>")
def edit_task(tid):
    j = request.json
    sets = ",".join(c + "=?" for c in COLS)
    sql = "UPDATE tasks SET " + sets + " WHERE id=?"
    values = [j.get(c, "") for c in COLS] + [tid]
    db().execute(sql, values)
    db().commit()
    return jsonify(ok=True)


@app.delete("/api/tasks/<int:tid>")
def del_task(tid):
    db().execute("DELETE FROM tasks WHERE id=?", (tid,))
    db().execute("DELETE FROM status WHERE task_id=?", (tid,))
    db().commit()
    return jsonify(ok=True)


@app.post("/api/status")
def set_status():
    j = request.json
    db().execute(
        "INSERT OR REPLACE INTO status VALUES(?,?,?)",
        (j["task_id"], j["date"], j["status"]),
    )
    db().commit()
    return jsonify(ok=True)


@app.route("/api/goals", methods=["GET", "POST"])
def goals():
    if request.method == "POST":
        text = request.json["text"]
        db().execute("INSERT INTO goals(text) VALUES(?)", (text,))
        db().commit()
        return jsonify(ok=True)
    d = request.args["date"]
    rows = db().execute("SELECT id, text FROM goals").fetchall()
    logged = db().execute(
        "SELECT goal_id FROM goal_log WHERE date=?", (d,)
    ).fetchall()
    done_ids = {r["goal_id"] for r in logged}
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "text": r["text"],
            "done": r["id"] in done_ids,
        })
    return jsonify(result)


@app.delete("/api/goals/<int:gid>")
def del_goal(gid):
    db().execute("DELETE FROM goals WHERE id=?", (gid,))
    db().execute("DELETE FROM goal_log WHERE goal_id=?", (gid,))
    db().commit()
    return jsonify(ok=True)


@app.post("/api/goals/toggle")
def toggle_goal():
    j = request.json
    gid = j["id"]
    d = j["date"]
    hit = db().execute(
        "SELECT 1 FROM goal_log WHERE goal_id=? AND date=?", (gid, d)
    ).fetchone()
    if hit:
        db().execute(
            "DELETE FROM goal_log WHERE goal_id=? AND date=?", (gid, d)
        )
    else:
        db().execute("INSERT INTO goal_log VALUES(?,?)", (gid, d))
    db().commit()
    return jsonify(ok=True)


@app.route("/api/review/<d>", methods=["GET", "POST"])
def review(d):
    if request.method == "POST":
        db().execute(
            "INSERT OR REPLACE INTO reviews VALUES(?,?)",
            (d, request.json["notes"]),
        )
        db().commit()
        return jsonify(ok=True)
    r = db().execute(
        "SELECT notes FROM reviews WHERE date=?", (d,)
    ).fetchone()
    return jsonify(notes=r["notes"] if r else "")


if __name__ == "__main__":
    init_db()
    app.run(debug=True)