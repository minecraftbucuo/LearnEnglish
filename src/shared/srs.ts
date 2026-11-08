// SM-2 间隔重复调度（Anki 同款简化实现）
import type { Rating } from './types'

export interface ScheduleInput {
  ease: number
  intervalDays: number
  reps: number
  lapses: number
}

export interface ScheduleResult extends ScheduleInput {
  dueInMinutes: number // < 1440 表示当天内（仅影响队列内排序，不构成等待门槛）
}

const MIN_EASE = 1.3
const DAY_MINUTES = 1440

export function schedule(prev: ScheduleInput, rating: Rating): ScheduleResult {
  let { ease, intervalDays, reps, lapses } = prev
  if (!Number.isFinite(ease) || ease < MIN_EASE) ease = 2.5

  if (rating === 1) {
    // 不认识：本轮队尾重现（中途退出则下次打开立即继续），连续答对次数清零，未来间隔变短
    reps = 0
    lapses += 1
    intervalDays = 0
    ease = Math.max(MIN_EASE, ease - 0.2)
    return { ease, intervalDays, reps, lapses, dueInMinutes: 10 }
  }

  if (rating === 2) ease = Math.max(MIN_EASE, ease - 0.15)
  reps += 1

  let interval: number
  if (reps === 1) {
    interval = rating === 2 ? 0.5 : 1
  } else if (reps === 2) {
    interval = rating === 2 ? 3 : 6
  } else {
    const mult = rating === 2 ? 1.2 : ease
    interval = Math.max(1, Math.round(intervalDays * mult))
  }

  // 上限 10 年，防溢出
  interval = Math.min(interval, 3650)
  return { ease, intervalDays: interval, reps, lapses, dueInMinutes: interval * DAY_MINUTES }
}

export function dueDateFrom(dueInMinutes: number, now = new Date()): Date {
  return new Date(now.getTime() + dueInMinutes * 60_000)
}
