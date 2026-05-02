import React, { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { createClient } from "@supabase/supabase-js"
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Download,
  Dumbbell,
  Flame,
  Home,
  LogIn,
  LogOut,
  Medal,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react"
import "./styles.css"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const TRAINING_KEY = "crossfit.trainingRecords.v1"
const PR_KEY = "crossfit.prRecords.v1"
const STORE_TABLE = "crossfit_stores"
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "")
  .trim()
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/$/, "")
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim()
const supabaseConfigError =
  supabaseUrl && !supabaseUrl.endsWith(".supabase.co")
    ? "VITE_SUPABASE_URL 需要是完整地址，例如 https://项目ID.supabase.co"
    : ""
const supabase =
  supabaseUrl && supabaseAnonKey && !supabaseConfigError
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
const getAuthRedirectUrl = () => {
  if (typeof window === "undefined") return undefined
  return new URL(".", window.location.href).toString()
}

const workoutTypes = ["WOD", "力量", "技术", "有氧", "Rest Day"]
const defaultMovements = [
  { movement: "实力推", category: "推举" },
  { movement: "借力推", category: "推举" },
  { movement: "卧推", category: "推举" },
  { movement: "硬拉", category: "下肢力量" },
  { movement: "背蹲", category: "下肢力量" },
  { movement: "前蹲", category: "下肢力量" },
  { movement: "高翻", category: "奥举" },
  { movement: "下蹲翻", category: "奥举" },
  { movement: "翻挺", category: "奥举" },
  { movement: "高抓", category: "奥举" },
  { movement: "下蹲抓", category: "奥举" },
]

const toLocalISODate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const todayISO = () => toLocalISODate(new Date())
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const nowISO = () => new Date().toISOString()
const pad = (num) => String(num).padStart(2, "0")
const formatMonth = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

function loadRecords(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]")
  } catch {
    return []
  }
}

function saveRecords(key, records) {
  localStorage.setItem(key, JSON.stringify(records))
}

function formatDisplayDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  })
}

function useLocalCollection(key) {
  const [items, setItems] = useState(() => loadRecords(key))
  const persist = (next) => {
    setItems(next)
    saveRecords(key, next)
  }
  return [items, persist]
}

function saveLocalStore(trainingRecords, prRecords) {
  saveRecords(TRAINING_KEY, trainingRecords)
  saveRecords(PR_KEY, prRecords)
}

function normalizeStore(data) {
  return {
    trainingRecords: Array.isArray(data?.training_records) ? data.training_records : [],
    prRecords: Array.isArray(data?.pr_records) ? data.pr_records : [],
    updatedAt: data?.updated_at || "",
  }
}

function useSyncedStore() {
  const [trainingRecords, setTrainingState] = useState(() => loadRecords(TRAINING_KEY))
  const [prRecords, setPrState] = useState(() => loadRecords(PR_KEY))
  const [session, setSession] = useState(null)
  const [syncStatus, setSyncStatus] = useState(supabase ? "checking" : "local")
  const [syncError, setSyncError] = useState("")
  const trainingRef = React.useRef(trainingRecords)
  const prRef = React.useRef(prRecords)
  const sessionRef = React.useRef(null)
  const syncStatusRef = React.useRef(syncStatus)

  const updateSyncStatus = React.useCallback((next) => {
    syncStatusRef.current = next
    setSyncStatus(next)
  }, [])

  const updateSession = React.useCallback((nextSession) => {
    sessionRef.current = nextSession
    setSession(nextSession)
  }, [])

  const writeLocal = React.useCallback((nextTraining, nextPr) => {
    const sameTraining = JSON.stringify(trainingRef.current) === JSON.stringify(nextTraining)
    const samePr = JSON.stringify(prRef.current) === JSON.stringify(nextPr)
    if (sameTraining && samePr) return

    trainingRef.current = nextTraining
    prRef.current = nextPr
    setTrainingState(nextTraining)
    setPrState(nextPr)
    saveLocalStore(nextTraining, nextPr)
  }, [])

  const pushRemote = React.useCallback(
    async (nextTraining, nextPr, activeSession = sessionRef.current) => {
      if (!supabase || !activeSession?.user) return
      updateSyncStatus("syncing")
      setSyncError("")
      const { error } = await supabase.from(STORE_TABLE).upsert(
        {
          user_id: activeSession.user.id,
          training_records: nextTraining,
          pr_records: nextPr,
          updated_at: nowISO(),
        },
        { onConflict: "user_id" },
      )
      if (error) {
        updateSyncStatus("error")
        setSyncError(error.message)
        return
      }
      updateSyncStatus("synced")
    },
    [updateSyncStatus],
  )

  const pullRemote = React.useCallback(
    async (activeSession = sessionRef.current, options = {}) => {
      if (!supabase || !activeSession?.user) return
      if (!options.silent) updateSyncStatus("syncing")
      setSyncError("")
      const { data, error } = await supabase
        .from(STORE_TABLE)
        .select("training_records, pr_records, updated_at")
        .eq("user_id", activeSession.user.id)
        .maybeSingle()

      if (error) {
        updateSyncStatus("error")
        setSyncError(error.message)
        return
      }

      if (!data) {
        await pushRemote(trainingRef.current, prRef.current, activeSession)
        return
      }

      const next = normalizeStore(data)
      writeLocal(next.trainingRecords, next.prRecords)
      updateSyncStatus("synced")
    },
    [pushRemote, updateSyncStatus, writeLocal],
  )

  React.useEffect(() => {
    if (!supabase) return

    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      updateSession(data.session)
      updateSyncStatus(data.session ? "syncing" : "signedOut")
      if (data.session) void pullRemote(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      updateSession(nextSession)
      updateSyncStatus(nextSession ? "syncing" : "signedOut")
      if (nextSession) void pullRemote(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [pullRemote, updateSession, updateSyncStatus])

  React.useEffect(() => {
    if (!supabase || !session?.user) return undefined
    const timer = window.setInterval(() => {
      void pullRemote(session, { silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [pullRemote, session])

  const setTrainingRecords = React.useCallback(
    (next) => {
      const nextTraining = typeof next === "function" ? next(trainingRef.current) : next
      writeLocal(nextTraining, prRef.current)
      void pushRemote(nextTraining, prRef.current)
    },
    [pushRemote, writeLocal],
  )

  const setPrRecords = React.useCallback(
    (next) => {
      const nextPr = typeof next === "function" ? next(prRef.current) : next
      writeLocal(trainingRef.current, nextPr)
      void pushRemote(trainingRef.current, nextPr)
    },
    [pushRemote, writeLocal],
  )

  const replaceStore = React.useCallback(
    (nextTraining, nextPr) => {
      writeLocal(nextTraining, nextPr)
      void pushRemote(nextTraining, nextPr)
    },
    [pushRemote, writeLocal],
  )

  const signIn = async (email) => {
    if (!supabase) return { error: new Error("Supabase is not configured") }
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    })
  }

  const signInWithPassword = async (email, password) => {
    if (!supabase) return { error: new Error("Supabase is not configured") }
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signUpWithPassword = async (email, password) => {
    if (!supabase) return { error: new Error("Supabase is not configured") }
    return supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: getAuthRedirectUrl() },
    })
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setSyncStatus("signedOut")
  }

  return {
    trainingRecords,
    setTrainingRecords,
    prRecords,
    setPrRecords,
    replaceStore,
    pullRemote,
    signIn,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    session,
    syncStatus,
    syncError,
    configError: supabaseConfigError,
    cloudEnabled: Boolean(supabase),
  }
}

function upsertById(records, record) {
  const exists = records.some((item) => item.id === record.id)
  if (exists) {
    return records.map((item) => (item.id === record.id ? record : item))
  }
  return [record, ...records]
}

function upsertWorkout(records, record) {
  const duplicateDate = records.find((item) => item.date === record.date && item.id !== record.id)
  if (duplicateDate) {
    return records.map((item) => (item.id === duplicateDate.id ? { ...record, id: duplicateDate.id } : item))
  }
  return upsertById(records, record)
}

function App() {
  const [page, setPage] = useState("today")
  const sync = useSyncedStore()
  const { trainingRecords, setTrainingRecords, prRecords, setPrRecords } = sync

  const stats = useMemo(() => {
    const completed = trainingRecords.filter((item) => item.type !== "Rest Day").length
    const rest = trainingRecords.filter((item) => item.type === "Rest Day").length
    const prCount = prRecords.length
    return { completed, rest, prCount }
  }, [trainingRecords, prRecords])

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppShell page={page} onPageChange={setPage} stats={stats} sync={sync}>
        {page === "today" && (
          <TodayPage records={trainingRecords} setRecords={setTrainingRecords} />
        )}
        {page === "calendar" && (
          <CalendarPage records={trainingRecords} setRecords={setTrainingRecords} />
        )}
        {page === "pr" && <PrPage records={prRecords} setRecords={setPrRecords} />}
        {page === "data" && (
          <DataPage
            trainingRecords={trainingRecords}
            setTrainingRecords={setTrainingRecords}
            prRecords={prRecords}
            setPrRecords={setPrRecords}
            sync={sync}
          />
        )}
      </AppShell>
    </div>
  )
}

function AppShell({ children, page, onPageChange, stats, sync }) {
  const nav = [
    { key: "today", label: "首页", icon: Home },
    { key: "calendar", label: "日历", icon: CalendarDays },
    { key: "pr", label: "PR", icon: Medal },
    { key: "data", label: "数据", icon: Database },
  ]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 md:pb-8 md:pt-5">
      <header className="mb-4 flex flex-col gap-3 md:mb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary sm:text-xs sm:tracking-[0.32em]">
            <Flame className="h-4 w-4" />
            CrossFit Log
          </div>
          <h1 className="mt-2 font-display text-[2.65rem] font-semibold leading-[0.9] tracking-wide text-foreground sm:text-6xl">
            TRAINING BOARD
          </h1>
        </div>
        <div className="grid gap-2 md:w-[430px]">
          <button
            onClick={() => onPageChange("data")}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/12 bg-card px-3 py-2 text-left text-sm font-semibold text-foreground ring-1 ring-white/5 transition hover:border-secondary"
          >
            <span className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-secondary" />
              {sync.session ? "已登录云同步" : "登录同步"}
            </span>
            <span className="text-xs text-muted-foreground">
              {sync.session?.user?.email || "手机/桌面共用"}
            </span>
          </button>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="训练" value={stats.completed} />
            <Metric label="休息" value={stats.rest} />
            <Metric label="PR" value={stats.prCount} />
          </div>
        </div>
      </header>

      <nav className="mb-5 hidden rounded-lg border border-white/12 bg-card p-1 shadow-sm ring-1 ring-white/5 md:flex">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => onPageChange(item.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-muted-foreground transition",
                page === item.key && "bg-primary text-primary-foreground shadow-sm shadow-primary/20",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <main className="flex-1">{children}</main>

      <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-md grid-cols-4 rounded-lg border border-white/12 bg-card/95 p-1 shadow-lift ring-1 ring-white/5 backdrop-blur md:hidden">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => onPageChange(item.key)}
              className={cn(
                "flex min-h-14 touch-manipulation flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-semibold text-muted-foreground",
                page === item.key && "bg-primary text-primary-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-white/12 bg-card px-3 py-2 ring-1 ring-white/5">
      <div className="font-display text-[1.65rem] font-semibold leading-none text-secondary sm:text-3xl">{value}</div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  )
}

function TodayPage({ records, setRecords }) {
  const [editing, setEditing] = useState(null)
  const date = todayISO()
  const todayRecord = records.find((item) => item.date === date)

  const handleSave = (form) => {
    const timestamp = nowISO()
    const record = {
      ...form,
      id: form.id || uid(),
      createdAt: form.createdAt || timestamp,
      updatedAt: timestamp,
    }
    setRecords(upsertWorkout(records, record))
    setEditing(null)
  }

  const handleDelete = (id) => {
    setRecords(records.filter((item) => item.id !== id))
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted text-foreground">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-normal text-muted-foreground">今日训练</p>
              <CardTitle className="mt-1 font-display text-4xl font-semibold tracking-wide sm:text-5xl">
                {formatDisplayDate(date)}
              </CardTitle>
            </div>
            <Activity className="h-10 w-10 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {todayRecord ? (
            <WorkoutDetail
              record={todayRecord}
              onEdit={() => setEditing(todayRecord)}
              onDelete={() => handleDelete(todayRecord.id)}
            />
          ) : (
            <EmptyState
              title="今天还没有训练记录"
              text="记录计划、成绩和备注，下一次回看时不再靠记忆。"
              actionLabel="添加今日训练"
              onAction={() => setEditing(blankWorkout(date))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近训练</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-5 sm:pt-0">
          <RecordList
            records={records.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)}
            onEdit={setEditing}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      <WorkoutDialog
        open={Boolean(editing)}
        record={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
      />
    </section>
  )
}

function CalendarPage({ records, setRecords }) {
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [editing, setEditing] = useState(null)
  const selectedRecord = records.find((item) => item.date === selectedDate)
  const recordByDate = useMemo(() => {
    return records.reduce((map, record) => {
      map[record.date] = record
      return map
    }, {})
  }, [records])

  const days = useMemo(() => buildMonthDays(month), [month])

  const handleSave = (form) => {
    const timestamp = nowISO()
    const record = {
      ...form,
      id: form.id || uid(),
      createdAt: form.createdAt || timestamp,
      updatedAt: timestamp,
    }
    setRecords(upsertWorkout(records, record))
    setSelectedDate(record.date)
    setEditing(null)
  }

  const handleDelete = (id) => {
    setRecords(records.filter((item) => item.id !== id))
  }

  const moveMonth = (delta) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{formatMonth(month)}</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => moveMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => moveMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground sm:gap-2">
            {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map((day) => {
              const record = recordByDate[day.iso]
              return (
                <button
                  key={day.iso}
                  onClick={() => setSelectedDate(day.iso)}
                  className={cn(
                    "relative aspect-square min-h-0 touch-manipulation rounded-md border border-white/12 bg-card p-1.5 text-left ring-1 ring-white/5 transition hover:border-primary sm:aspect-auto sm:min-h-24 sm:p-2",
                    !day.inMonth && "opacity-35",
                    day.iso === todayISO() && "border-2 border-secondary",
                    selectedDate === day.iso && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  <span className="text-sm font-semibold">{day.date.getDate()}</span>
                  {record && (
                    <span
                      className={cn(
                        "absolute inset-x-1 bottom-1 truncate rounded-sm px-1 py-1 text-[9px] font-semibold leading-none sm:text-[10px]",
                        selectedDate === day.iso
                          ? "bg-background/30 text-primary-foreground"
                          : "bg-primary/15 text-primary",
                      )}
                    >
                      {record.type}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{formatDisplayDate(selectedDate)}</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedRecord ? (
            <WorkoutDetail
              record={selectedRecord}
              onEdit={() => setEditing(selectedRecord)}
              onDelete={() => handleDelete(selectedRecord.id)}
            />
          ) : (
            <EmptyState
              title="这天还没有记录"
              text="可以补录历史训练，日历会立即高亮。"
              actionLabel="新增该日训练"
              onAction={() => setEditing(blankWorkout(selectedDate))}
            />
          )}
        </CardContent>
      </Card>

      <WorkoutDialog
        open={Boolean(editing)}
        record={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
      />
    </section>
  )
}

function PrPage({ records, setRecords }) {
  const [editing, setEditing] = useState(null)
  const bestByMovement = useMemo(() => {
    return defaultMovements.reduce((map, movement) => {
      const candidates = records.filter((item) => item.movement === movement.movement)
      map[movement.movement] = candidates.sort((a, b) => Number(b.weight) - Number(a.weight))[0]
      return map
    }, {})
  }, [records])

  const grouped = defaultMovements.reduce((map, item) => {
    map[item.category] = map[item.category] || []
    map[item.category].push(item)
    return map
  }, {})

  const handleSave = (form) => {
    const timestamp = nowISO()
    const meta = defaultMovements.find((item) => item.movement === form.movement)
    const record = {
      ...form,
      category: meta?.category || form.category || "其他",
      id: form.id || uid(),
      weight: Number(form.weight || 0),
      createdAt: form.createdAt || timestamp,
      updatedAt: timestamp,
    }
    setRecords(upsertById(records, record))
    setEditing(null)
  }

  const handleDelete = (id) => {
    setRecords(records.filter((item) => item.id !== id))
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4">
        {Object.entries(grouped).map(([category, movements]) => (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{category}</CardTitle>
                <Button onClick={() => setEditing(blankPr(movements[0]))}>
                  <Plus className="mr-2 h-4 w-4" />
                  新增 PR
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {movements.map((item) => (
                <PrCard
                  key={item.movement}
                  movement={item}
                  record={bestByMovement[item.movement]}
                  onAdd={() => setEditing(blankPr(item))}
                  onEdit={(record) => setEditing(record)}
                  onDelete={handleDelete}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>全部 PR 记录</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length ? (
            <div className="grid gap-2">
              {records
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((record) => (
                  <div key={record.id} className="rounded-md border border-white/12 bg-muted/30 p-3 ring-1 ring-white/5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{record.movement}</div>
                        <div className="text-sm text-muted-foreground">
                          {record.weight} kg · {record.reps} · {record.date}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(record)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(record.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              title="还没有 PR"
              text="从任意动作开始记录你的最高重量。"
              actionLabel="新增第一条 PR"
              onAction={() => setEditing(blankPr(defaultMovements[0]))}
            />
          )}
        </CardContent>
      </Card>

      <PrDialog
        open={Boolean(editing)}
        record={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
      />
    </section>
  )
}

function DataPage({ trainingRecords, setTrainingRecords, prRecords, setPrRecords, sync }) {
  const inputRef = React.useRef(null)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [importing, setImporting] = useState(false)
  const [authBusy, setAuthBusy] = useState("")
  const localUrl = typeof window === "undefined" ? "" : window.location.href
  const publicUrl =
    typeof window === "undefined" ? "" : window.location.hostname.includes("localhost") ? "部署后的公网 HTTPS 地址" : localUrl
  const syncLabel = {
    checking: "检查登录状态",
    local: "本地缓存模式",
    signedOut: "未登录云同步",
    syncing: "同步中",
    synced: "已云端同步",
    error: "同步异常",
  }[sync.syncStatus]

  const exportData = () => {
    const payload = {
      app: "crossfit-training-record",
      version: 1,
      exportedAt: nowISO(),
      trainingRecords,
      prRecords,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `crossfit-records-${todayISO()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage("已导出 JSON 备份文件。")
  }

  const importData = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImporting(true)
    setMessage("")
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      if (!Array.isArray(payload.trainingRecords) || !Array.isArray(payload.prRecords)) {
        throw new Error("备份文件格式不正确")
      }
      if (sync.replaceStore) {
        sync.replaceStore(payload.trainingRecords, payload.prRecords)
      } else {
        setTrainingRecords(payload.trainingRecords)
        setPrRecords(payload.prRecords)
      }
      setMessage(`已恢复 ${payload.trainingRecords.length} 条训练记录和 ${payload.prRecords.length} 条 PR。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败，请检查 JSON 文件。")
    } finally {
      setImporting(false)
      event.target.value = ""
    }
  }

  const clearAll = () => {
    const confirmed = window.confirm("确定清空本机所有训练和 PR 记录？建议先导出备份。")
    if (!confirmed) return
    if (sync.replaceStore) {
      sync.replaceStore([], [])
    } else {
      setTrainingRecords([])
      setPrRecords([])
    }
    setMessage("已清空本机数据。")
  }

  const handleSignIn = async () => {
    if (!email.trim()) {
      setMessage("请输入邮箱。")
      return
    }
    setAuthBusy("magic")
    setMessage("正在发送登录链接...")
    try {
      const { error } = await sync.signIn(email.trim())
      setMessage(error ? `发送失败：${error.message}` : "登录链接已发送，请在邮箱中打开。")
    } catch (error) {
      setMessage(error instanceof Error ? `发送失败：${error.message}` : "发送失败，请检查网络。")
    } finally {
      setAuthBusy("")
    }
  }

  const handlePasswordSignIn = async () => {
    if (!email.trim() || password.length < 6) {
      setMessage("请输入邮箱和至少 6 位密码。")
      return
    }
    setAuthBusy("passwordSignIn")
    setMessage("正在登录...")
    try {
      const { error } = await sync.signInWithPassword(email.trim(), password)
      setMessage(error ? `登录失败：${error.message}` : "已使用密码登录。")
    } catch (error) {
      setMessage(error instanceof Error ? `登录失败：${error.message}` : "登录失败，请检查网络。")
    } finally {
      setAuthBusy("")
    }
  }

  const handlePasswordSignUp = async () => {
    if (!email.trim() || password.length < 6) {
      setMessage("请输入邮箱和至少 6 位密码。")
      return
    }
    setAuthBusy("passwordSignUp")
    setMessage("正在注册账号...")
    try {
      const { error } = await sync.signUpWithPassword(email.trim(), password)
      setMessage(error ? `注册失败：${error.message}` : "账号已创建。若已关闭 Confirm email，可以直接点密码登录。")
    } catch (error) {
      setMessage(error instanceof Error ? `注册失败：${error.message}` : "注册失败，请检查网络。")
    } finally {
      setAuthBusy("")
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>数据存储方案</CardTitle>
            <Cloud className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <StorageStep
            title="推荐方案：Supabase 云端同步"
            text="训练和 PR 存在 Supabase Postgres 的个人 JSONB 文档里。桌面端和移动端用同一个邮箱登录后，读写同一份云端数据。"
          />
          <StorageStep
            title="本地缓存：离线兜底"
            text="每次同步后仍会写入浏览器 localStorage。临时断网时可以继续查看最近数据，恢复网络后重新同步。"
          />
          <StorageStep
            title="数据备份：JSON 文件"
            text="导出和导入仍保留，作为换服务、迁移或手动备份的保险。云同步不是唯一副本。"
          />
          <div className="rounded-md border border-white/12 bg-muted/30 p-4 ring-1 ring-white/5">
            <div className="font-semibold">Supabase 建表 SQL</div>
            <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 text-xs leading-5 text-muted-foreground">
{`create table public.crossfit_stores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training_records jsonb not null default '[]'::jsonb,
  pr_records jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.crossfit_stores enable row level security;

create policy "Users manage their own store"
on public.crossfit_stores
for all
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);`}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>公网同步</CardTitle>
            <Smartphone className="h-5 w-5 text-secondary" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-md border border-white/12 bg-muted/35 p-4 ring-1 ring-white/5">
            <div className="text-xs font-semibold text-muted-foreground">公网访问地址</div>
            <div className="mt-2 break-all font-mono text-sm text-foreground">{publicUrl}</div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              部署到 Vercel、Netlify 或任意静态托管后，手机和桌面打开同一个 HTTPS 地址，并用同一个邮箱登录。
            </p>
          </div>

          <div className="rounded-md border border-white/12 bg-muted/35 p-4 ring-1 ring-white/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-muted-foreground">同步状态</div>
                <div className="mt-1 font-semibold">{syncLabel}</div>
                {sync.session?.user?.email && (
                  <div className="mt-1 text-sm text-muted-foreground">{sync.session.user.email}</div>
                )}
              </div>
              <RefreshCw className={cn("h-5 w-5 text-secondary", sync.syncStatus === "syncing" && "animate-spin")} />
            </div>
            {sync.syncError && <p className="mt-3 text-sm text-primary">{sync.syncError}</p>}
            {sync.configError && <p className="mt-3 text-sm text-primary">{sync.configError}</p>}
            {!sync.cloudEnabled && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                当前还没有配置 Supabase 环境变量，所以仍是本地缓存模式。
              </p>
            )}
          </div>

          <div className="rounded-md border border-white/12 bg-muted/35 p-4 ring-1 ring-white/5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">云同步登录</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  手机和桌面使用同一个邮箱登录后会自动同步。
                </div>
              </div>
              <LogIn className="h-5 w-5 text-primary" />
            </div>

            {sync.session ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => sync.pullRemote()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  立即同步
                </Button>
                <Button variant="ghost" onClick={sync.signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  disabled={!sync.cloudEnabled || Boolean(authBusy)}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <Input
                  type="password"
                  placeholder="密码，至少 6 位"
                  value={password}
                  disabled={!sync.cloudEnabled || Boolean(authBusy)}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button onClick={handlePasswordSignIn} disabled={!sync.cloudEnabled || Boolean(authBusy)}>
                    <LogIn className="mr-2 h-4 w-4" />
                    {authBusy === "passwordSignIn" ? "登录中" : "密码登录"}
                  </Button>
                  <Button variant="outline" onClick={handlePasswordSignUp} disabled={!sync.cloudEnabled || Boolean(authBusy)}>
                    {authBusy === "passwordSignUp" ? "注册中" : "注册账号"}
                  </Button>
                  <Button variant="ghost" onClick={handleSignIn} disabled={!sync.cloudEnabled || Boolean(authBusy)}>
                    {authBusy === "magic" ? "发送中" : "发送登录链接"}
                  </Button>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  如果 QQ 邮箱收不到登录链接，建议在 Supabase 关闭 Confirm email 后使用密码注册/登录。
                </p>
              </div>
            )}

            {!sync.cloudEnabled && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                登录入口已就位。填好 `.env` 里的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 并重启服务后，这里会变成可操作状态。
              </p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button onClick={exportData}>
              <Download className="mr-2 h-4 w-4" />
              导出备份
            </Button>
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importing}>
              <Upload className="mr-2 h-4 w-4" />
              导入备份
            </Button>
            <Button variant="destructive" onClick={clearAll}>
              <Trash2 className="mr-2 h-4 w-4" />
              清空本机
            </Button>
          </div>

          <input ref={inputRef} className="hidden" type="file" accept="application/json,.json" onChange={importData} />

          <div className="grid grid-cols-2 gap-2">
            <Metric label="训练记录" value={trainingRecords.length} />
            <Metric label="PR 记录" value={prRecords.length} />
          </div>

          {message && (
            <div className="rounded-md border border-white/12 bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-white/5">
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function StorageStep({ title, text }) {
  return (
    <div className="rounded-md border border-white/12 bg-muted/30 p-4 ring-1 ring-white/5">
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  )
}

function WorkoutDetail({ record, onEdit, onDelete }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-sm bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
            {record.type}
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-none tracking-wide sm:text-4xl">{record.date}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <InfoBlock title="训练计划" value={record.plan} />
      <InfoBlock title="训练成绩" value={record.result} />
      <InfoBlock title="备注" value={record.notes} />
    </div>
  )
}

function InfoBlock({ title, value }) {
  return (
    <div className="rounded-md border border-white/12 bg-muted/35 p-3 ring-1 ring-white/5">
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="whitespace-pre-wrap text-sm leading-6">{value || "未填写"}</div>
    </div>
  )
}

function RecordList({ records, onEdit, onDelete }) {
  if (!records.length) {
    return <p className="text-sm text-muted-foreground">暂无历史记录。</p>
  }
  return (
    <div className="grid gap-2">
      {records.map((record) => (
        <div key={record.id} className="rounded-md border border-white/12 bg-card p-3 ring-1 ring-white/5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-primary">{record.type}</div>
              <div className="font-semibold">{record.date}</div>
              <div className="line-clamp-2 text-sm text-muted-foreground">{record.result || record.plan}</div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(record)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(record.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PrCard({ movement, record, onAdd, onEdit, onDelete }) {
  return (
    <div className="rounded-md border border-white/12 bg-muted/25 p-4 ring-1 ring-white/5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{movement.movement}</div>
          <div className="text-xs text-muted-foreground">{movement.category}</div>
        </div>
        <Dumbbell className="h-5 w-5 text-primary" />
      </div>
      {record ? (
        <>
          <div className="mt-5 font-display text-5xl font-semibold leading-none tracking-wide text-secondary">
            {record.weight}
            <span className="ml-1 text-xl">kg</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-muted-foreground">
            {record.reps} · {record.date}
          </div>
          {record.notes && <p className="mt-3 text-sm text-muted-foreground">{record.notes}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => onEdit(record)}>
              编辑
            </Button>
            <Button variant="ghost" onClick={() => onDelete(record.id)}>
              删除
            </Button>
          </div>
        </>
      ) : (
        <Button className="mt-5 w-full" variant="outline" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          记录
        </Button>
      )}
    </div>
  )
}

function EmptyState({ title, text, actionLabel, onAction }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-white/18 bg-muted/30 p-6 text-center ring-1 ring-white/5">
      <div className="mb-4 rounded-lg bg-primary/10 p-3 text-primary">
        <Plus className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>
      <Button className="mt-5" onClick={onAction}>
        <Plus className="mr-2 h-4 w-4" />
        {actionLabel}
      </Button>
    </div>
  )
}

function WorkoutDialog({ open, record, onOpenChange, onSave }) {
  const [form, setForm] = useState(record || blankWorkout(todayISO()))

  React.useEffect(() => {
    if (record) setForm(record)
  }, [record])

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? "编辑训练记录" : "新增训练记录"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="日期">
            <Input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} />
          </Field>
          <Field label="训练类型">
            <select
              className="h-11 rounded-md border border-input bg-muted px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:text-sm"
              value={form.type}
              onChange={(event) => update("type", event.target.value)}
            >
              {workoutTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="训练计划">
            <Textarea value={form.plan} onChange={(event) => update("plan", event.target.value)} rows={4} />
          </Field>
          <Field label="训练成绩">
            <Textarea value={form.result} onChange={(event) => update("result", event.target.value)} rows={3} />
          </Field>
          <Field label="备注">
            <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => onSave(form)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PrDialog({ open, record, onOpenChange, onSave }) {
  const [form, setForm] = useState(record || blankPr(defaultMovements[0]))

  React.useEffect(() => {
    if (record) setForm(record)
  }, [record])

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? "编辑 PR" : "新增 PR"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="动作">
            <select
              className="h-11 rounded-md border border-input bg-muted px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:text-sm"
              value={form.movement}
              onChange={(event) => update("movement", event.target.value)}
            >
              {defaultMovements.map((item) => (
                <option key={item.movement} value={item.movement}>
                  {item.movement}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="重量 kg">
              <Input
                min="0"
                step="0.5"
                type="number"
                value={form.weight}
                onChange={(event) => update("weight", event.target.value)}
              />
            </Field>
            <Field label="次数">
              <Input value={form.reps} onChange={(event) => update("reps", event.target.value)} />
            </Field>
          </div>
          <Field label="日期">
            <Input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} />
          </Field>
          <Field label="备注">
            <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => onSave(form)}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function blankWorkout(date) {
  return {
    id: "",
    date,
    type: "WOD",
    plan: "",
    result: "",
    notes: "",
    createdAt: "",
    updatedAt: "",
  }
}

function blankPr(movement) {
  return {
    id: "",
    movement: movement.movement,
    category: movement.category,
    weight: "",
    reps: "1RM",
    date: todayISO(),
    notes: "",
    createdAt: "",
    updatedAt: "",
  }
}

function buildMonthDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const startOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - startOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      iso: toLocalISODate(date),
      inMonth: date.getMonth() === month.getMonth(),
    }
  })
}

createRoot(document.getElementById("root")).render(<App />)
