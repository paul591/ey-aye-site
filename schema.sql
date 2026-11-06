-- D1 database "ey-aye-site". Apply with: wrangler d1 execute ey-aye-site --remote --file schema.sql
CREATE TABLE IF NOT EXISTS landings (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, path TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, term TEXT, click_id TEXT, referrer TEXT, country TEXT);
CREATE INDEX IF NOT EXISTS landings_ts ON landings(ts);
CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, name TEXT, business TEXT, email TEXT, message TEXT, heard_about TEXT, source TEXT, medium TEXT, campaign TEXT, content TEXT, click_id TEXT, landing TEXT, emailed INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS enquiries_ts ON enquiries(ts);
