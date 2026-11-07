import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import type {
  EntriesFilter,
  Entry,
  EntryChat,
  EntrySource,
  EntryType,
  Rating,
  ReviewCard,
  ReviewMode,
  ReviewState,
  ReviewStats,
  StructuredData
} from '@shared/types'
import { dueDateFrom, schedule } from '@shared/srs'

let db: Database.Database

interface EntryRow {
  id: number
  type: EntryType
  text: string
  context: string | null
  source: EntrySource
  image_path: string | null
  structured: string | null
  markdown: string | null
  note: string
  is_starred: number
  suspended: number
  lookup_count: number
  created_at: string
  updated_at: string
}

interface ReviewRow {
  entry_id: number
  ease: number
  interval_days: number
  due_at: string
  reps: number
  lapses: number
  introduced_at: string | null
  last_reviewed_at: string | null
}

const nowIso = (): string => new Date().toISOString()

export function initDb(): void {
  db = new Database(path.join(app.getPath('userData'), 'learn-english.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('word','sentence')),
      text TEXT NOT NULL,
      context TEXT,
      source TEXT NOT NULL DEFAULT 'selection',
      image_path TEXT,
      structured TEXT,
      markdown TEXT,
      note TEXT NOT NULL DEFAULT '',
      is_starred INTEGER NOT NULL DEFAULT 0,
      suspended INTEGER NOT NULL DEFAULT 0,
      lookup_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_text ON entries(text) WHERE source != 'image';
    CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);
    CREATE TABLE IF NOT EXISTS review_state (
      entry_id INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
      ease REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      due_at TEXT NOT NULL,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      introduced_at TEXT,
      last_reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'recall',
      interval_before REAL,
      interval_after REAL,
      ease_after REAL,
      reviewed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logs_reviewed ON review_logs(reviewed_at);
    CREATE TABLE IF NOT EXISTS entry_chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_entry ON entry_chats(entry_id, created_at);
  `)
  // 老库迁移：补 markdown 缓存列
  const cols = (db.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map(
    (c) => c.name
  )
  if (!cols.includes('markdown')) {
    db.exec('ALTER TABLE entries ADD COLUMN markdown TEXT')
  }
}

// ---------- 行映射 ----------

function rowToReview(r: ReviewRow | undefined): ReviewState | null {
  if (!r) return null
  return {
    entryId: r.entry_id,
    ease: r.ease,
    intervalDays: r.interval_days,
    dueAt: r.due_at,
    reps: r.reps,
    lapses: r.lapses,
    introducedAt: r.introduced_at,
    lastReviewedAt: r.last_reviewed_at
  }
}

function rowToEntry(r: EntryRow): Entry {
  let structured: StructuredData | null = null
  if (r.structured) {
    try {
      structured = JSON.parse(r.structured) as StructuredData
    } catch {
      structured = null
    }
  }
  const review = rowToReview(
    db.prepare('SELECT * FROM review_state WHERE entry_id = ?').get(r.id) as ReviewRow | undefined
  )
  return {
    id: r.id,
    type: r.type,
    text: r.text,
    context: r.context,
    source: r.source,
    imagePath: r.image_path,
    structured,
    markdown: r.markdown ?? null,
    note: r.note,
    isStarred: !!r.is_starred,
    suspended: !!r.suspended,
    lookupCount: r.lookup_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    review
  }
}

// ---------- 查询历史 / 词条 ----------

/** 记录一次查询：已存在则 lookup_count+1，否则新建。图片查询每次都新建。 */
export function upsertLookup(p: {
  text: string
  type: EntryType
  source: EntrySource
  context?: string | null
  imagePath?: string | null
}): Entry {
  const t = nowIso()
  if (p.source !== 'image') {
    const existing = db
      .prepare("SELECT * FROM entries WHERE text = ? AND source != 'image'")
      .get(p.text) as EntryRow | undefined
    if (existing) {
      db.prepare(
        `UPDATE entries SET lookup_count = lookup_count + 1, context = COALESCE(?, context),
         updated_at = ? WHERE id = ?`
      ).run(p.context ?? null, t, existing.id)
      return getEntryById(existing.id)!
    }
  }
  const info = db
    .prepare(
      `INSERT INTO entries (type, text, context, source, image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(p.type, p.text, p.context ?? null, p.source, p.imagePath ?? null, t, t)
  return getEntryById(Number(info.lastInsertRowid))!
}

export function getEntryById(id: number): Entry | null {
  const r = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as EntryRow | undefined
  return r ? rowToEntry(r) : null
}

export function findEntryByText(text: string): Entry | null {
  const r = db
    .prepare("SELECT * FROM entries WHERE text = ? AND source != 'image'")
    .get(text) as EntryRow | undefined
  return r ? rowToEntry(r) : null
}

export function saveStructured(
  id: number,
  structured: StructuredData | null,
  markdown?: string
): Entry | null {
  // 截图查询：若 AI 转录出了原文，把 text 修正为原文
  if (structured?.sourceText) {
    const entry = getEntryById(id)
    if (entry && entry.source === 'image') {
      const dup = findEntryByText(structured.sourceText)
      if (dup && dup.id !== id) {
        // 已有相同原文的词条：合并（次数累加），删除临时图片词条
        db.prepare('UPDATE entries SET lookup_count = lookup_count + 1 WHERE id = ?').run(dup.id)
        mergeEntryInto(id, dup.id)
        db.prepare('UPDATE entries SET structured = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify(structured),
          nowIso(),
          dup.id
        )
        return getEntryById(dup.id)
      }
      db.prepare('UPDATE entries SET text = ?, updated_at = ? WHERE id = ?').run(
        structured.sourceText,
        nowIso(),
        id
      )
    }
  }
  if (structured) {
    db.prepare('UPDATE entries SET structured = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(structured),
      nowIso(),
      id
    )
  }
  if (markdown !== undefined) {
    db.prepare('UPDATE entries SET markdown = ?, updated_at = ? WHERE id = ?').run(
      markdown,
      nowIso(),
      id
    )
  }
  return getEntryById(id)
}

/** 把 srcId 的复习状态/日志迁移到 targetId 后删除 src（截图查询合并用） */
function mergeEntryInto(srcId: number, targetId: number): void {
  const src = db.prepare('SELECT * FROM review_state WHERE entry_id = ?').get(srcId) as
    | ReviewRow
    | undefined
  if (src) {
    db.prepare('DELETE FROM review_state WHERE entry_id = ?').run(targetId)
    db.prepare('UPDATE review_state SET entry_id = ? WHERE entry_id = ?').run(targetId, srcId)
  }
  db.prepare('UPDATE review_logs SET entry_id = ? WHERE entry_id = ?').run(targetId, srcId)
  db.prepare('DELETE FROM review_state WHERE entry_id = ?').run(srcId)
  db.prepare('DELETE FROM entries WHERE id = ?').run(srcId)
}

export function listEntries(filter: EntriesFilter = {}): Entry[] {
  const { query, type, source, starredOnly, limit = 200, offset = 0 } = filter
  const conds: string[] = []
  const params: unknown[] = []
  if (query) {
    conds.push('(text LIKE ? OR note LIKE ? OR context LIKE ?)')
    params.push(`%${query}%`, `%${query}%`, `%${query}%`)
  }
  if (type && type !== 'all') {
    conds.push('type = ?')
    params.push(type)
  }
  if (source && source !== 'all') {
    conds.push('source = ?')
    params.push(source)
  }
  if (starredOnly) conds.push('is_starred = 1')
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT * FROM entries ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as EntryRow[]
  return rows.map(rowToEntry)
}

export function setStarred(id: number, starred: boolean): Entry | null {
  db.prepare('UPDATE entries SET is_starred = ?, updated_at = ? WHERE id = ?').run(
    starred ? 1 : 0,
    nowIso(),
    id
  )
  if (starred) ensureReviewState(id)
  return getEntryById(id)
}

export function setSuspended(id: number, suspended: boolean): Entry | null {
  db.prepare('UPDATE entries SET suspended = ?, updated_at = ? WHERE id = ?').run(
    suspended ? 1 : 0,
    nowIso(),
    id
  )
  return getEntryById(id)
}

export function setNote(id: number, note: string): Entry | null {
  db.prepare('UPDATE entries SET note = ?, updated_at = ? WHERE id = ?').run(note, nowIso(), id)
  return getEntryById(id)
}

export function deleteEntry(id: number): void {
  db.prepare('DELETE FROM review_logs WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM review_state WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
}

// ---------- 复习 ----------

function ensureReviewState(entryId: number): void {
  const has = db.prepare('SELECT 1 FROM review_state WHERE entry_id = ?').get(entryId)
  if (!has) {
    db.prepare(
      'INSERT INTO review_state (entry_id, due_at) VALUES (?, ?)'
    ).run(entryId, nowIso())
  }
}

export function markIntroduced(entryId: number): void {
  db.prepare(
    'UPDATE review_state SET introduced_at = ? WHERE entry_id = ? AND introduced_at IS NULL'
  ).run(nowIso(), entryId)
}

export function answer(entryId: number, rating: Rating, mode: ReviewMode): ReviewState | null {
  const entry = getEntryById(entryId)
  if (!entry) return null
  ensureReviewState(entryId)
  const row = db.prepare('SELECT * FROM review_state WHERE entry_id = ?').get(entryId) as ReviewRow
  const prev = {
    ease: row.ease,
    intervalDays: row.interval_days,
    reps: row.reps,
    lapses: row.lapses
  }
  const next = schedule(prev, rating)
  const dueAt = dueDateFrom(next.dueInMinutes).toISOString()
  db.prepare(
    `UPDATE review_state SET ease = ?, interval_days = ?, due_at = ?, reps = ?, lapses = ?,
     last_reviewed_at = ? WHERE entry_id = ?`
  ).run(next.ease, next.intervalDays, dueAt, next.reps, next.lapses, nowIso(), entryId)
  db.prepare(
    `INSERT INTO review_logs (entry_id, rating, mode, interval_before, interval_after, ease_after, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(entryId, rating, mode, prev.intervalDays, next.intervalDays, next.ease, nowIso())
  return rowToReview(db.prepare('SELECT * FROM review_state WHERE entry_id = ?').get(entryId) as ReviewRow)
}

export function getReviewQueue(dailyNew: number): {
  due: ReviewCard[]
  newCards: ReviewCard[]
  dueCount: number
  newRemaining: number
} {
  const now = nowIso()
  const sql = `
    SELECT e.*, r.ease, r.interval_days, r.due_at, r.reps, r.lapses, r.introduced_at, r.last_reviewed_at
    FROM entries e JOIN review_state r ON r.entry_id = e.id
    WHERE e.is_starred = 1 AND e.suspended = 0`
  const all = db.prepare(sql).all() as (EntryRow & ReviewRow)[]

  const toCard = (row: EntryRow & ReviewRow, isNew: boolean): ReviewCard => ({
    entry: rowToEntry(row),
    state: rowToReview(row)!,
    isNew
  })

  const dueAll = all
    .filter((r) => r.reps > 0 && r.due_at <= now)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
  const newPool = all
    .filter((r) => r.reps === 0 && !r.introduced_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const introducedTodayCount = all.filter((r) => {
    if (!r.introduced_at) return false
    return isSameLocalDay(r.introduced_at, Date.now())
  }).length

  const newQuota = Math.max(0, dailyNew - introducedTodayCount)
  const newCards = newPool.slice(0, newQuota).map((r) => toCard(r, true))

  return {
    due: dueAll.map((r) => toCard(r, false)),
    newCards,
    dueCount: dueAll.length,
    newRemaining: newCards.length
  }
}

/** 自由练习队列：所有划重点且未暂停的卡片随机抽取，不区分是否到期（不计入调度） */
export function getFreePracticeQueue(limit = 50): ReviewCard[] {
  const rows = db
    .prepare(
      `SELECT e.*, r.ease, r.interval_days, r.due_at, r.reps, r.lapses, r.introduced_at, r.last_reviewed_at
       FROM entries e JOIN review_state r ON r.entry_id = e.id
       WHERE e.is_starred = 1 AND e.suspended = 0
       ORDER BY RANDOM() LIMIT ?`
    )
    .all(limit) as (EntryRow & ReviewRow)[]
  return rows.map((row) => ({ entry: rowToEntry(row), state: rowToReview(row)!, isNew: false }))
}

export function getReviewStats(): ReviewStats {
  const now = nowIso()
  const totalEntries = (db.prepare('SELECT COUNT(*) c FROM entries').get() as { c: number }).c
  const starred = (
    db.prepare('SELECT COUNT(*) c FROM entries WHERE is_starred = 1').get() as { c: number }
  ).c
  const reviewRows = db
    .prepare(
      `SELECT r.* FROM review_state r JOIN entries e ON e.id = r.entry_id
       WHERE e.is_starred = 1 AND e.suspended = 0`
    )
    .all() as ReviewRow[]

  const dueNow = reviewRows.filter((r) => r.reps > 0 && r.due_at <= now).length
  const newToday = reviewRows.filter(
    (r) => r.introduced_at && isSameLocalDay(r.introduced_at, Date.now())
  ).length

  const reviewedToday = (
    db
      .prepare("SELECT COUNT(DISTINCT entry_id) c FROM review_logs WHERE reviewed_at >= ?")
      .get(new Date(new Date().setHours(0, 0, 0, 0)).toISOString()) as { c: number }
  ).c

  const mastered = reviewRows.filter((r) => r.reps > 0 && r.interval_days >= 21).length

  // 连续打卡：从今天（或昨天）往前数连续有复习记录的天数
  const days = new Set(
    (
      db.prepare('SELECT DISTINCT reviewed_at FROM review_logs').all() as {
        reviewed_at: string
      }[]
    ).map((r) => localDateStr(r.reviewed_at))
  )
  let streak = 0
  const cursor = new Date()
  if (!days.has(localDateStr(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(localDateStr(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  // 未来 7 天到期分布（含今天）
  const upcoming: { date: string; count: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const ds = localDateStr(d)
    const start = new Date(d)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const count = reviewRows.filter((r) => {
      if (r.reps === 0) return false
      const t = new Date(r.due_at).getTime()
      return t >= start.getTime() && t < end.getTime()
    }).length
    upcoming.push({ date: ds, count })
  }

  return {
    totalEntries,
    starred,
    dueNow,
    reviewedToday,
    newToday,
    streakDays: streak,
    mastered,
    upcoming
  }
}

// ---------- 追问（即笔记） ----------

export function addEntryChat(entryId: number, question: string, answer: string): EntryChat {
  const info = db
    .prepare('INSERT INTO entry_chats (entry_id, question, answer, created_at) VALUES (?, ?, ?, ?)')
    .run(entryId, question, answer, nowIso())
  return {
    id: Number(info.lastInsertRowid),
    entryId,
    question,
    answer,
    createdAt: nowIso()
  }
}

export function listEntryChats(entryId: number): EntryChat[] {
  return db
    .prepare('SELECT * FROM entry_chats WHERE entry_id = ? ORDER BY created_at, id')
    .all(entryId) as unknown as EntryChat[]
}

export function deleteEntryChat(id: number): void {
  db.prepare('DELETE FROM entry_chats WHERE id = ?').run(id)
}

// ---------- 目标词程序化加粗 ----------

/** 在例句里给目标词（含常见屈折变化）加粗；已加粗的先剥离再统一加粗，可重复点击。
 *  加粗属于排版修正：无论是否有变化都不更新 updated_at，不影响列表排序。 */
export function boldEntryTargets(id: number): Entry | null {
  const entry = getEntryById(id)
  if (!entry?.structured?.examples || !entry.structured.examples.length) return entry
  const word = entry.text.trim()
  if (!word || word.length > 40) return entry
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b(${esc}(?:s|es|ed|d|ing)?)\\b`, 'gi')
  const s: StructuredData = {
    ...entry.structured,
    examples: entry.structured.examples.map((ex) => ({
      ...ex,
      en: ex.en.replace(/\*\*/g, '').replace(re, '**$1**')
    }))
  }
  // 无实际变化不写库；有变化也只更新 structured 字段，不动 updated_at
  if (JSON.stringify(s) === JSON.stringify(entry.structured)) return entry
  db.prepare('UPDATE entries SET structured = ? WHERE id = ?').run(JSON.stringify(s), id)
  return getEntryById(id)
}

// ---------- 工具 ----------

export function localDateStr(input: string | number | Date): string {
  const d = new Date(input)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isSameLocalDay(iso: string, timeMs: number): boolean {
  return localDateStr(iso) === localDateStr(new Date(timeMs))
}
