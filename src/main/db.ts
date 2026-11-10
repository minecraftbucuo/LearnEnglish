import path from 'node:path'
import { rmSync, unlinkSync } from 'node:fs'
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
import { isZhContent } from '@shared/text'
import { isSingleWord, isZhShort } from './prompts'

let db: Database.Database

interface EntryRow {
  id: number
  type: EntryType
  text: string
  context: string | null
  source: EntrySource
  structured: string | null
  markdown: string | null
  note: string
  is_starred: number
  suspended: number
  mastered: number
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

const REVIEW_STATE_SQL = `
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
  `

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
      mastered INTEGER NOT NULL DEFAULT 0,
      lookup_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_text ON entries(text) WHERE source != 'image';
    CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);
    ${REVIEW_STATE_SQL}
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
  // 老库迁移：撤销双轨表，回到单轨（拼写只是复习的一种出题形式，不再单独记账）
  const rCols = (
    db.prepare('PRAGMA table_info(review_state)').all() as { name: string }[]
  ).map((c) => c.name)
  if (rCols.includes('track')) {
    db.exec(`
      ALTER TABLE review_state RENAME TO review_state_old;
      ${REVIEW_STATE_SQL.replace('IF NOT EXISTS ', '')}
      INSERT INTO review_state (entry_id, ease, interval_days, due_at, reps, lapses, introduced_at, last_reviewed_at)
        SELECT entry_id, ease, interval_days, due_at, reps, lapses, introduced_at, last_reviewed_at
        FROM review_state_old WHERE track = 'recall';
      DROP TABLE review_state_old;
    `)
    console.log('[db] review_state 已迁移回单轨表（拼写轨数据弃用）')
  }
  // 老库迁移：补 markdown 缓存列
  const cols = (db.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map(
    (c) => c.name
  )
  if (!cols.includes('markdown')) {
    db.exec('ALTER TABLE entries ADD COLUMN markdown TEXT')
  }
  // 老库迁移：补熟记标记列
  if (!cols.includes('mastered')) {
    db.exec('ALTER TABLE entries ADD COLUMN mastered INTEGER NOT NULL DEFAULT 0')
  }
  // 老库迁移：截图词条并入普通词条体系（截图=先转文字的普通查询，不再单独存图）
  const imgRows = db
    .prepare("SELECT id, image_path FROM entries WHERE source = 'image'")
    .all() as { id: number; image_path: string | null }[]
  if (imgRows.length) {
    const files = imgRows.map((r) => r.image_path).filter((f): f is string => !!f)
    db.prepare("UPDATE entries SET source = 'selection', image_path = NULL WHERE source = 'image'").run()
    for (const f of files) {
      try {
        unlinkSync(f)
      } catch {
        // 文件可能已不存在
      }
    }
    try {
      rmSync(path.join(app.getPath('userData'), 'images'), { recursive: true, force: true })
    } catch {
      // 目录可能不存在
    }
    console.log(`[db] 已把 ${imgRows.length} 条截图词条转为普通词条，清理 ${files.length} 个截图文件`)
  }
  const shotRows = db
    .prepare("SELECT COUNT(*) c FROM entries WHERE source = 'screenshot'")
    .get() as { c: number }
  if (shotRows.c > 0) {
    db.prepare("UPDATE entries SET source = 'selection' WHERE source = 'screenshot'").run()
    console.log(`[db] 已把 ${shotRows.c} 条 screenshot 来源词条并入 selection`)
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
    structured,
    markdown: r.markdown ?? null,
    note: r.note,
    isStarred: !!r.is_starred,
    suspended: !!r.suspended,
    mastered: !!r.mastered,
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
}): Entry {
  const t = nowIso()
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
  const info = db
    .prepare(
      `INSERT INTO entries (type, text, context, source, image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(p.type, p.text, p.context ?? null, p.source, t, t)
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

/** 是否存在与 text 相同文本的其他词条（修正文本前提示用户） */
export function findTextDuplicate(text: string, excludeId: number): Entry | null {
  const t = text.trim()
  if (!t) return null
  const r = db
    .prepare("SELECT * FROM entries WHERE text = ? AND source != 'image' AND id != ?")
    .get(t, excludeId) as EntryRow | undefined
  return r ? rowToEntry(r) : null
}

/** 修改词条文本（修正抓取缺漏字母等）：按新文本重算词/句类型并刷新 updated_at。
 *  讲解内容不变，保存后可在详情页「重新查询」按正确文本重新生成。 */
export function updateEntryText(id: number, text: string): Entry | null {
  const t = text.trim()
  if (!t) return getEntryById(id)
  const cur = getEntryById(id)
  if (!cur || cur.text === t) return cur
  const type: EntryType = isZhContent(t)
    ? isZhShort(t)
      ? 'word'
      : 'sentence'
    : isSingleWord(t)
      ? 'word'
      : 'sentence'
  db.prepare('UPDATE entries SET text = ?, type = ?, updated_at = ? WHERE id = ?').run(
    t,
    type,
    nowIso(),
    id
  )
  return getEntryById(id)
}

/** 程序化给例句里的目标词加粗（含常见屈折变化；幂等：先剥离旧加粗再统一加）。
 *  模型经常在 markdown 全文里加粗了、在结构化例句里忘了，保存时统一自动补齐。 */
function withTargetsBold(structured: StructuredData, word: string): StructuredData {
  if (!structured.examples?.length || !word || word.length > 40) return structured
  const esc = word.replace(/[.*+?${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b(${esc}(?:s|es|ed|d|ing)?)\\b`, 'gi')
  const next: StructuredData = {
    ...structured,
    examples: structured.examples.map((ex) => ({
      ...ex,
      en: ex.en.replace(/\*\*/g, '').replace(re, '**$1**')
    }))
  }
  return JSON.stringify(next) === JSON.stringify(structured) ? structured : next
}

export function saveStructured(
  id: number,
  structured: StructuredData | null,
  markdown?: string
): Entry | null {
  if (structured) {
    // 每次保存都自动补粗（本地正则，无 API 开销），保证结构化例句与全文讲解的加粗一致
    const bolded = withTargetsBold(structured, getEntryById(id)?.text.trim() ?? '')
    db.prepare('UPDATE entries SET structured = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(bolded),
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

/** 重新查询成功后补计一次查词次数（首次查询已由 upsertLookup 计过） */
export function incrementLookupCount(id: number): Entry | null {
  db.prepare('UPDATE entries SET lookup_count = lookup_count + 1 WHERE id = ?').run(id)
  return getEntryById(id)
}

/** 本地日期(YYYY-MM-DD)当天的起始/结束时刻，转成 UTC ISO 便于和 created_at 直接比较 */
function localDayStartIso(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toISOString()
}

function localDayEndIso(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString()
}

export function listEntries(filter: EntriesFilter = {}): Entry[] {
  const {
    query,
    type,
    starredOnly,
    masteredOnly,
    reviewStatus,
    createdFrom,
    createdTo,
    limit = 200,
    offset = 0
  } = filter
  const conds: string[] = []
  const params: unknown[] = []
  let join = ''
  if (query) {
    conds.push('(text LIKE ? OR note LIKE ? OR context LIKE ?)')
    params.push(`%${query}%`, `%${query}%`, `%${query}%`)
  }
  if (type && type !== 'all') {
    conds.push('type = ?')
    params.push(type)
  }
  if (starredOnly) conds.push('is_starred = 1')
  if (masteredOnly) conds.push('mastered = 1')
  const fromIso = createdFrom ? localDayStartIso(createdFrom) : null
  if (fromIso) {
    conds.push('created_at >= ?')
    params.push(fromIso)
  }
  const toIso = createdTo ? localDayEndIso(createdTo) : null
  if (toIso) {
    conds.push('created_at < ?')
    params.push(toIso)
  }
  if (reviewStatus) {
    // 按学习状态筛重点词：未学 / 今日新学 / 已学
    join = 'LEFT JOIN review_state rs ON rs.entry_id = entries.id'
    conds.push('entries.is_starred = 1')
    if (reviewStatus === 'new') {
      conds.push('(rs.entry_id IS NULL OR (rs.reps = 0 AND rs.introduced_at IS NULL))')
    } else if (reviewStatus === 'today') {
      conds.push(
        "rs.introduced_at IS NOT NULL AND date(rs.introduced_at, 'localtime') = date('now', 'localtime')"
      )
    } else {
      conds.push('(rs.reps > 0 OR rs.lapses > 0 OR rs.introduced_at IS NOT NULL)')
    }
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT entries.* FROM entries ${join} ${where} ORDER BY entries.updated_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as EntryRow[]
  return rows.map(rowToEntry)
}

export function setStarred(id: number, starred: boolean): Entry | null {
  db.prepare('UPDATE entries SET is_starred = ? WHERE id = ?').run(starred ? 1 : 0, id)
  if (starred) ensureReviewState(id)
  return getEntryById(id)
}

export function setSuspended(id: number, suspended: boolean): Entry | null {
  db.prepare('UPDATE entries SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, id)
  return getEntryById(id)
}

/** 标记/取消熟记：熟记的词条退出所有复习队列与统计范围（不改动 updated_at） */
export function setMastered(id: number, mastered: boolean): Entry | null {
  db.prepare('UPDATE entries SET mastered = ? WHERE id = ?').run(mastered ? 1 : 0, id)
  return getEntryById(id)
}

export function deleteEntry(id: number): void {
  db.prepare('DELETE FROM review_logs WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM review_state WHERE entry_id = ?').run(id)
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
}

// ---------- 复习 ----------

function ensureReviewState(entryId: number): void {
  db.prepare(
    'INSERT INTO review_state (entry_id, due_at) VALUES (?, ?) ON CONFLICT(entry_id) DO NOTHING'
  ).run(entryId, nowIso())
}

export function markIntroduced(entryId: number): void {
  db.prepare(
    'UPDATE review_state SET introduced_at = ? WHERE entry_id = ? AND introduced_at IS NULL'
  ).run(nowIso(), entryId)
}

// 复习作答撤销栈：answer() 前快照该词条的排期与日志行 id，undoAnswer 按后进先出原样回滚。
// 仅应用运行期间有效（会话状态本就在渲染层内存里，重启后一起失效）
interface AnswerSnapshot {
  entryId: number
  before: {
    ease: number
    intervalDays: number
    dueAt: string
    reps: number
    lapses: number
    lastReviewedAt: string | null
  }
  logId: number
}
const answerUndoStack: AnswerSnapshot[] = []
const ANSWER_UNDO_LIMIT = 200

export function answer(entryId: number, rating: Rating, mode: ReviewMode): ReviewState | null {
  const entry = getEntryById(entryId)
  if (!entry) return null
  // 行缺失时兜底补建；mode 只是出题形式（识记/拼写），进度同一条，作答形式记入日志
  db.prepare(
    'INSERT INTO review_state (entry_id, due_at) VALUES (?, ?) ON CONFLICT(entry_id) DO NOTHING'
  ).run(entryId, nowIso())
  const row = db.prepare('SELECT * FROM review_state WHERE entry_id = ?').get(entryId) as ReviewRow
  const before = {
    ease: row.ease,
    intervalDays: row.interval_days,
    dueAt: row.due_at,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewedAt: row.last_reviewed_at
  }
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
  const logInfo = db
    .prepare(
      `INSERT INTO review_logs (entry_id, rating, mode, interval_before, interval_after, ease_after, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(entryId, rating, mode, prev.intervalDays, next.intervalDays, next.ease, nowIso())
  answerUndoStack.push({ entryId, before, logId: Number(logInfo.lastInsertRowid) })
  if (answerUndoStack.length > ANSWER_UNDO_LIMIT) answerUndoStack.shift()
  return rowToReview(
    db.prepare('SELECT * FROM review_state WHERE entry_id = ?').get(entryId) as ReviewRow
  )
}

/** 撤销该词条最近一次作答：恢复排期快照并删除对应日志（复习会话"回到上一张"用）。
 *  栈里没有该词条的快照（如重启后）返回 false */
export function undoAnswer(entryId: number): boolean {
  const idx = answerUndoStack.findLastIndex((s) => s.entryId === entryId)
  if (idx < 0) return false
  const snap = answerUndoStack.splice(idx, 1)[0]
  db.prepare(
    `UPDATE review_state SET ease = ?, interval_days = ?, due_at = ?, reps = ?, lapses = ?,
     last_reviewed_at = ? WHERE entry_id = ?`
  ).run(
    snap.before.ease,
    snap.before.intervalDays,
    snap.before.dueAt,
    snap.before.reps,
    snap.before.lapses,
    snap.before.lastReviewedAt,
    entryId
  )
  db.prepare('DELETE FROM review_logs WHERE id = ?').run(snap.logId)
  return true
}

export function getReviewQueue(dailyNew: number): {
  due: ReviewCard[]
  newCards: ReviewCard[]
  newRemaining: number
} {
  const now = nowIso()
  const all = db
    .prepare(
      `SELECT e.*, r.ease, r.interval_days, r.due_at, r.reps, r.lapses, r.introduced_at, r.last_reviewed_at
       FROM entries e JOIN review_state r ON r.entry_id = e.id
       WHERE e.is_starred = 1 AND e.suspended = 0 AND e.mastered = 0
       ORDER BY RANDOM()`
    )
    .all() as (EntryRow & ReviewRow)[]

  const toCard = (row: EntryRow & ReviewRow, isNew: boolean): ReviewCard => ({
    entry: rowToEntry(row),
    state: rowToReview(row)!,
    isNew
  })

  // 到期 = 学过的卡（reps>0）到了 due_at；加上没学完的卡（reps=0 但已引入或点过「不认识」）。
  // 后者不看 due_at：开新会话立刻入队，不让用户干等或记时间。
  const dueAll = all
    .filter(
      (r) =>
        (r.reps > 0 && r.due_at <= now) ||
        (r.reps === 0 && (r.lapses > 0 || r.introduced_at != null))
    )
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
  const newPool = all.filter((r) => r.reps === 0 && !r.introduced_at)

  const introducedTodayCount = all.filter((r) => {
    if (!r.introduced_at) return false
    return isSameLocalDay(r.introduced_at, Date.now())
  }).length

  const newQuota = Math.max(0, dailyNew - introducedTodayCount)
  const newCards = newPool.slice(0, newQuota).map((r) => toCard(r, true))

  return {
    due: dueAll.map((r) => toCard(r, false)),
    newCards,
    newRemaining: newCards.length
  }
}

/** 复习（巩固）队列：全部已接触过的卡，随机顺序。不写排期 */
export function getPracticeQueue(): ReviewCard[] {
  const rows = db
    .prepare(
      `SELECT e.*, r.ease, r.interval_days, r.due_at, r.reps, r.lapses, r.introduced_at, r.last_reviewed_at
       FROM entries e JOIN review_state r ON r.entry_id = e.id
       WHERE e.is_starred = 1 AND e.suspended = 0 AND e.mastered = 0
         AND (r.reps > 0 OR r.lapses > 0 OR r.introduced_at IS NOT NULL)
       ORDER BY RANDOM()`
    )
    .all() as (EntryRow & ReviewRow)[]
  return rows.map((row) => ({ entry: rowToEntry(row), state: rowToReview(row)!, isNew: false }))
}

export function getReviewStats(): ReviewStats {
  const totalEntries = (db.prepare('SELECT COUNT(*) c FROM entries').get() as { c: number }).c
  const starred = (
    db.prepare('SELECT COUNT(*) c FROM entries WHERE is_starred = 1').get() as { c: number }
  ).c
  const reviewRows = db
    .prepare(
      `SELECT r.ease, r.interval_days, r.due_at, r.reps, r.lapses, r.introduced_at
       FROM review_state r JOIN entries e ON e.id = r.entry_id
       WHERE e.is_starred = 1 AND e.suspended = 0 AND e.mastered = 0`
    )
    .all() as ReviewRow[]

  // 已接触过的卡（巩固轮的可选范围）
  const learned = reviewRows.filter(
    (r) => r.reps > 0 || r.lapses > 0 || r.introduced_at != null
  ).length

  const newToday = reviewRows.filter(
    (r) => r.introduced_at && isSameLocalDay(r.introduced_at, Date.now())
  ).length

  const reviewedToday = (
    db
      .prepare("SELECT COUNT(DISTINCT entry_id) c FROM review_logs WHERE reviewed_at >= ?")
      .get(new Date(new Date().setHours(0, 0, 0, 0)).toISOString()) as { c: number }
  ).c

  const mastered = reviewRows.filter((r) => r.reps > 0 && r.interval_days >= 21).length

  // 掌握度分布：已掌握(≥21天) / 巩固中(1~20天) / 刚学(已引入未毕业)
  const learningCount = reviewRows.filter((r) => r.reps > 0 && r.interval_days < 21).length
  const freshCount = reviewRows.filter((r) => r.reps === 0 && r.introduced_at != null).length

  // 近一年答题记录：热力图（52 周）与近 30 天柱状图共用一份数据
  const since = new Date()
  since.setDate(since.getDate() - 364)
  since.setHours(0, 0, 0, 0)
  const logs = db
    .prepare('SELECT rating, reviewed_at FROM review_logs WHERE reviewed_at >= ?')
    .all(since.toISOString()) as { rating: number; reviewed_at: string }[]
  const byDay = new Map<string, { total: number; known: number; fuzzy: number; forgot: number }>()
  for (const l of logs) {
    const ds = localDateStr(l.reviewed_at)
    const rec = byDay.get(ds) ?? { total: 0, known: 0, fuzzy: 0, forgot: 0 }
    rec.total++
    if (l.rating === 3) rec.known++
    else if (l.rating === 2) rec.fuzzy++
    else rec.forgot++
    byDay.set(ds, rec)
  }
  const daily = [] as import('@shared/types').DailyActivity[]
  const heatmap = [] as { date: string; count: number }[]
  for (let i = 364; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = localDateStr(d)
    const rec = byDay.get(ds) ?? { total: 0, known: 0, fuzzy: 0, forgot: 0 }
    heatmap.push({ date: ds, count: rec.total })
    if (i < 30) daily.push({ date: ds, ...rec })
  }

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
      if (r.reps === 0 && r.lapses === 0 && !r.introduced_at) return false // 未学的新卡不计入
      const t = new Date(r.due_at).getTime()
      return t >= start.getTime() && t < end.getTime()
    }).length
    upcoming.push({ date: ds, count })
  }

  return {
    totalEntries,
    starred,
    reviewedToday,
    newToday,
    streakDays: streak,
    mastered,
    learned,
    daily,
    heatmap,
    buckets: { mastered, learning: learningCount, fresh: freshCount },
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

// ---------- 工具 ----------

function localDateStr(input: string | number | Date): string {
  const d = new Date(input)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function isSameLocalDay(iso: string, timeMs: number): boolean {
  return localDateStr(iso) === localDateStr(new Date(timeMs))
}
