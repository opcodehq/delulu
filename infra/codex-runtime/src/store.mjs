import { DatabaseSync } from "node:sqlite";

/** Single-writer durable journal. Payloads are never logged or stored in product Postgres. */
export class Store {
  constructor(path) {
    this.lock = new DatabaseSync(`${path}.lock`);
    try {
      this.lock.exec(
        "BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS singleton (id INTEGER)"
      );
    } catch (error) {
      this.lock.close();
      throw error;
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, scope TEXT NOT NULL,
        fingerprint TEXT NOT NULL, state TEXT NOT NULL, value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state);
      CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(owner);
      CREATE INDEX IF NOT EXISTS jobs_compaction ON jobs(json_extract(value, '$.compacted'), json_extract(value, '$.createdAt'));`);
  }
  get(key) {
    const row = this.db
      .prepare("SELECT value FROM records WHERE key = ?")
      .get(key);
    return row ? JSON.parse(row.value) : undefined;
  }
  put(key, value) {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(key, JSON.stringify(value));
  }
  job(id) {
    const row = this.db.prepare("SELECT value FROM jobs WHERE id = ?").get(id);
    return row ? JSON.parse(row.value) : undefined;
  }
  save(job) {
    this.db
      .prepare(
        "INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, value = excluded.value"
      )
      .run(
        job.id,
        job.owner,
        job.scope,
        job.fingerprint,
        job.state,
        JSON.stringify(job)
      );
  }
  jobs(owner) {
    const rows =
      owner === undefined
        ? this.db.prepare("SELECT value FROM jobs").all()
        : this.db.prepare("SELECT value FROM jobs WHERE owner = ?").all(owner);
    return rows.map((row) => JSON.parse(row.value));
  }
  unfinished() {
    return this.db
      .prepare(
        "SELECT value FROM jobs WHERE state IN ('running', 'waiting_approval')"
      )
      .all()
      .map((row) => JSON.parse(row.value));
  }
  compactable(before) {
    return this.db
      .prepare(
        "SELECT value FROM jobs WHERE json_extract(value, '$.compacted') IS NULL AND json_extract(value, '$.createdAt') < ? LIMIT 100"
      )
      .all(before)
      .map((row) => JSON.parse(row.value));
  }
  close() {
    this.db.close();
    this.lock.close();
  }
}
