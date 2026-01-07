"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Workstream = {
  id: string;
  name: "兒少組" | "研發組" | "數位推廣組" | "行政組" | string;
  color: string | null;
  sort_order: number | null;
};

type Project = {
  id: string;
  title: string;
  status: string | null;
  created_at: string;
  workstream_id: string;
  sort_order: number | null;
};

type Task = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null; // yyyy-mm-dd
  assignee: string | null;
  done: boolean | null;
  sort_order: number | null;
  created_at: string;
};

const WS_COLORS: Record<string, string> = {
  兒少組: "#2563eb", // blue
  研發組: "#16a34a", // green
  數位推廣組: "#7c3aed", // purple
  行政組: "#ea580c", // orange
};

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, diff: number) {
  return new Date(d.getFullYear(), d.getMonth() + diff, 1);
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (p: {
    attributes: any;
    listeners: any;
    setNodeRef: (el: HTMLElement | null) => void;
    transform: any;
    transition: string | undefined;
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const s = useSortable({ id });
  return (
    <>
      {children({
        attributes: s.attributes,
        listeners: s.listeners,
        setNodeRef: s.setNodeRef,
        transform: s.transform,
        transition: s.transition,
        isDragging: s.isDragging,
      })}
    </>
  );
}

export default function Page() {
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");

  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // ✅ Project 新增：title + workstream 必填
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectWs, setNewProjectWs] = useState<string>("");

  // ✅ Task 新增：每個 project 自己一組輸入（不連動）
  const [draftTask, setDraftTask] = useState<
    Record<
      string,
      { title: string; due_date: string; assignee: string }
    >
  >({});

  // 月曆月份
  const [monthBase, setMonthBase] = useState<Date>(() => startOfMonth(new Date()));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const wsById = useMemo(() => {
    const m = new Map<string, Workstream>();
    workstreams.forEach((w) => m.set(w.id, w));
    return m;
  }, [workstreams]);

  const colorByWsId = (wsId: string) => {
    const ws = wsById.get(wsId);
    if (!ws) return "#111";
    return WS_COLORS[ws.name] ?? "#111";
  };

  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const arr = map.get(t.project_id) ?? [];
      arr.push(t);
      map.set(t.project_id, arr);
    });
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999));
      map.set(k, arr);
    }
    return map;
  }, [tasks]);

  // 月曆格：當月天數
  const monthDays = useMemo(() => {
    const d0 = startOfMonth(monthBase);
    const y = d0.getFullYear();
    const m = d0.getMonth();
    const next = new Date(y, m + 1, 1);
    const days = Math.round((next.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24));
    return Array.from({ length: days }, (_, i) => new Date(y, m, i + 1));
  }, [monthBase]);

  // 月曆點點：只顯示「未完成且有 due_date」的 tasks（用 workstream 顏色）
  const milestoneDots = useMemo(() => {
    const map = new Map<string, { color: string; count: number }[]>();
    tasks
      .filter((t) => !t.done && t.due_date)
      .forEach((t) => {
        const p = projects.find((x) => x.id === t.project_id);
        if (!p) return;
        const key = t.due_date!;
        const color = colorByWsId(p.workstream_id);
        const arr = map.get(key) ?? [];
        const hit = arr.find((x) => x.color === color);
        if (hit) hit.count += 1;
        else arr.push({ color, count: 1 });
        map.set(key, arr);
      });
    return map;
  }, [tasks, projects]);

  async function loadAll() {
    const session = await supabase.auth.getSession();
    const user = session.data.session?.user;
    setEmail(user?.email ?? "");

    // role（你之前 profiles 有）
    const prof = await supabase.from("profiles").select("*").maybeSingle();
    setRole((prof.data as any)?.role ?? "");

    const ws = await supabase
      .from("workstreams")
      .select("*")
      .order("sort_order", { ascending: true });

    if (ws.error) {
      console.error(ws.error);
    } else {
      setWorkstreams(ws.data as any);
      if (!newProjectWs && (ws.data?.[0] as any)?.id) setNewProjectWs((ws.data?.[0] as any).id);
    }

    const pr = await supabase
      .from("projects")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (pr.error) console.error(pr.error);
    else setProjects(pr.data as any);

    const tk = await supabase
      .from("tasks")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (tk.error) console.error(tk.error);
    else setTasks(tk.data as any);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = role === "admin";

  async function addProject() {
    if (!isAdmin) return alert("只有 admin 可以新增專案");
    if (!newProjectTitle.trim()) return alert("請輸入專案名稱");
    if (!newProjectWs) return alert("請選 workstream");

    const maxOrder = Math.max(-1, ...projects.map((p) => p.sort_order ?? 0));
    const ins = await supabase.from("projects").insert({
      title: newProjectTitle.trim(),
      status: "active",
      workstream_id: newProjectWs,
      sort_order: maxOrder + 1,
    });

    if (ins.error) return alert(`新增失敗：${ins.error.message}`);
    setNewProjectTitle("");
    await loadAll();
  }

  async function deleteProject(id: string) {
    if (!isAdmin) return alert("只有 admin 可以刪除專案");
    const ok = confirm("確定刪除這個 Project？（會一併刪除底下 Tasks）");
    if (!ok) return;

    // 先刪 tasks 再刪 project（避免 FK 或殘留）
    await supabase.from("tasks").delete().eq("project_id", id);
    const del = await supabase.from("projects").delete().eq("id", id);
    if (del.error) return alert(`刪除失敗：${del.error.message}`);
    await loadAll();
  }

  async function addTask(projectId: string) {
    if (!isAdmin) return alert("只有 admin 可以新增任務");
    const d = draftTask[projectId] ?? { title: "", due_date: "", assignee: "" };
    if (!d.title.trim()) return alert("請輸入任務名稱");
    if (!d.due_date.trim()) return alert("請選截止日");
    if (!d.assignee.trim()) return alert("請輸入負責人");

    const arr = tasksByProject.get(projectId) ?? [];
    const maxOrder = Math.max(-1, ...arr.map((t) => t.sort_order ?? 0));

    const ins = await supabase.from("tasks").insert({
      project_id: projectId,
      title: d.title.trim(),
      due_date: d.due_date,
      assignee: d.assignee.trim(),
      done: false,
      sort_order: maxOrder + 1,
    });

    if (ins.error) return alert(`新增失敗：${ins.error.message}`);

    // ✅ 清掉「該 project」的輸入，不影響其他 project
    setDraftTask((prev) => ({
      ...prev,
      [projectId]: { title: "", due_date: "", assignee: "" },
    }));

    await loadAll();
  }

  async function deleteTask(taskId: string) {
    if (!isAdmin) return alert("只有 admin 可以刪除任務");
    const del = await supabase.from("tasks").delete().eq("id", taskId);
    if (del.error) return alert(`刪除失敗：${del.error.message}`);
    await loadAll();
  }

  async function toggleDone(task: Task) {
    const upd = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    if (upd.error) return alert(`更新失敗：${upd.error.message}`);
    await loadAll();
  }

  // ✅ 真拖曳：Projects
  async function onDragEndProjects(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(projects, oldIndex, newIndex).map((p, idx) => ({
      ...p,
      sort_order: idx,
    }));
    setProjects(next);

    // 寫回 DB
    await Promise.all(
      next.map((p) =>
        supabase.from("projects").update({ sort_order: p.sort_order }).eq("id", p.id)
      )
    );
  }

  // ✅ 真拖曳：Tasks（每個 project 各自拖）
  async function onDragEndTasks(projectId: string, e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const arr = tasksByProject.get(projectId) ?? [];
    const oldIndex = arr.findIndex((t) => t.id === active.id);
    const newIndex = arr.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextArr = arrayMove(arr, oldIndex, newIndex).map((t, idx) => ({
      ...t,
      sort_order: idx,
    }));

    // 更新本地 tasks（保持其他 tasks 不動）
    setTasks((prev) => {
      const others = prev.filter((t) => t.project_id !== projectId);
      return [...others, ...nextArr];
    });

    await Promise.all(
      nextArr.map((t) =>
        supabase.from("tasks").update({ sort_order: t.sort_order }).eq("id", t.id)
      )
    );
  }

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/login";
  }

  const card: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 18,
    background: "white",
  };

  const pill: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: "8px 12px",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  };

  return (
    <div style={{ background: "#f6f7f9", minHeight: "100vh", padding: 22, fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 44, fontWeight: 900 }}>2026__媒觀執行追蹤</div>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              目前登入：<b>{email || "—"}</b>　｜　角色：<b>{role || "—"}</b>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ ...pill, cursor: "default" }}>✅ 本週時間軸只顯示：!done && due_date</span>
              <span style={{ ...pill, cursor: "default" }}>✅ 月曆只在截止日顯示點點</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...pill }} onClick={loadAll}>重新載入</button>
            <button style={{ ...pill }} onClick={logout}>登出</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, marginTop: 16 }}>
          {/* LEFT */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>甘特圖</div>
                <div style={{ opacity: 0.6, fontSize: 13, marginTop: 2 }}>大分類（Workstream）</div>
              </div>
              <div style={{ opacity: 0.6, fontSize: 12 }}>（固定，可編輯版可加）</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {workstreams
                .slice()
                .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
                .map((w) => {
                  const c = WS_COLORS[w.name] ?? "#111";
                  return (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: c, display: "inline-block" }} />
                      <span style={{ fontWeight: 800 }}>{w.name}</span>
                    </div>
                  );
                })}
            </div>

            <div style={{ marginTop: 18, opacity: 0.6, fontSize: 13 }}>里程碑月曆（截止日點點）</div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
              <button style={pill} onClick={() => setMonthBase((d) => addMonths(d, -1))}>← 上個月</button>
              <div style={{ fontWeight: 900, alignSelf: "center" }}>
                {monthBase.getFullYear()}/{String(monthBase.getMonth() + 1).padStart(2, "0")}
              </div>
              <button style={pill} onClick={() => setMonthBase((d) => addMonths(d, 1))}>下個月 →</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginTop: 12 }}>
              {monthDays.map((d) => {
                const key = formatYMD(d);
                const dots = milestoneDots.get(key) ?? [];
                return (
                  <div
                    key={key}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 14,
                      minHeight: 54,
                      padding: 8,
                      background: "white",
                    }}
                    title={key}
                  >
                    <div style={{ fontWeight: 900, fontSize: 13 }}>{d.getDate()}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {dots.slice(0, 6).map((x, i) => (
                        <span
                          key={`${key}-${x.color}-${i}`}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: x.color,
                            display: "inline-block",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ ...card, minHeight: 640 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>工作項目</div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
              <input
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="新增專案（Project）名稱"
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #e5e7eb",
                }}
              />
              <select
                value={newProjectWs}
                onChange={(e) => setNewProjectWs(e.target.value)}
                style={{
                  width: 160,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #e5e7eb",
                  background: "white",
                }}
              >
                <option value="">選 Workstream（必填）</option>
                {workstreams.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                onClick={addProject}
                style={{
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid #111",
                  background: "#111",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                新增專案
              </button>
            </div>

            <div style={{ opacity: 0.65, fontSize: 13, marginTop: 8 }}>
              Project 可拖曳排序；Task 也可在各 Project 內拖曳排序（會寫回資料庫）。
            </div>

            <div style={{ marginTop: 16 }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndProjects}>
                <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {projects.map((p) => (
                      <SortableRow key={p.id} id={p.id}>
                        {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                          <div
                            ref={setNodeRef}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 18,
                              padding: 14,
                              background: "white",
                              boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,0.12)" : "none",
                              transform: CSS.Transform.toString(transform),
                              transition,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {/* 拖曳把手 */}
                                <button
                                  {...attributes}
                                  {...listeners}
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 999,
                                    border: "none",
                                    background: colorByWsId(p.workstream_id),
                                    cursor: "grab",
                                  }}
                                  title="拖我排序"
                                />
                                <div>
                                  <div style={{ fontWeight: 900, fontSize: 16 }}>{p.title} <span style={{ opacity: 0.5, fontWeight: 700 }}>(Project)</span></div>
                                  <div style={{ opacity: 0.6, fontSize: 13 }}>任務會收在這個專案底下</div>
                                </div>
                              </div>
                              <button
                                onClick={() => deleteProject(p.id)}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 12,
                                  padding: "8px 10px",
                                  background: "white",
                                  cursor: "pointer",
                                }}
                                title="刪除 Project（會提示）"
                              >
                                🗑️
                              </button>
                            </div>

                            {/* ✅ 每個 Project 獨立 Task 輸入（不連動） */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 140px", gap: 10, marginTop: 12 }}>
                              <input
                                value={(draftTask[p.id]?.title ?? "")}
                                onChange={(e) =>
                                  setDraftTask((prev) => ({
                                    ...prev,
                                    [p.id]: {
                                      title: e.target.value,
                                      due_date: prev[p.id]?.due_date ?? "",
                                      assignee: prev[p.id]?.assignee ?? "",
                                    },
                                  }))
                                }
                                placeholder="新增任務（Task）"
                                style={{ padding: 12, borderRadius: 14, border: "1px solid #e5e7eb" }}
                              />
                              <input
                                type="date"
                                value={(draftTask[p.id]?.due_date ?? "")}
                                onChange={(e) =>
                                  setDraftTask((prev) => ({
                                    ...prev,
                                    [p.id]: {
                                      title: prev[p.id]?.title ?? "",
                                      due_date: e.target.value,
                                      assignee: prev[p.id]?.assignee ?? "",
                                    },
                                  }))
                                }
                                style={{ padding: 12, borderRadius: 14, border: "1px solid #e5e7eb" }}
                              />
                              <input
                                value={(draftTask[p.id]?.assignee ?? "")}
                                onChange={(e) =>
                                  setDraftTask((prev) => ({
                                    ...prev,
                                    [p.id]: {
                                      title: prev[p.id]?.title ?? "",
                                      due_date: prev[p.id]?.due_date ?? "",
                                      assignee: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="負責人（必填）"
                                style={{ padding: 12, borderRadius: 14, border: "1px solid #e5e7eb" }}
                              />
                              <button
                                onClick={() => addTask(p.id)}
                                style={{
                                  padding: "12px 14px",
                                  borderRadius: 14,
                                  border: "1px solid #111",
                                  background: "white",
                                  cursor: "pointer",
                                  fontWeight: 900,
                                }}
                              >
                                新增任務
                              </button>
                            </div>

                            {/* Tasks list with true drag */}
                            <div style={{ marginTop: 12 }}>
                              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEndTasks(p.id, e)}>
                                <SortableContext
                                  items={(tasksByProject.get(p.id) ?? []).map((t) => t.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {(tasksByProject.get(p.id) ?? []).map((t) => (
                                      <SortableRow key={t.id} id={t.id}>
                                        {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                                          <div
                                            ref={setNodeRef}
                                            style={{
                                              border: "1px solid #eef0f3",
                                              borderRadius: 16,
                                              padding: 12,
                                              background: "white",
                                              transform: CSS.Transform.toString(transform),
                                              transition,
                                              boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,0.10)" : "none",
                                            }}
                                          >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <button
                                                  {...attributes}
                                                  {...listeners}
                                                  style={{
                                                    width: 12,
                                                    height: 12,
                                                    borderRadius: 999,
                                                    border: "none",
                                                    background: colorByWsId(p.workstream_id),
                                                    cursor: "grab",
                                                  }}
                                                  title="拖我排序"
                                                />
                                                <input
                                                  type="checkbox"
                                                  checked={!!t.done}
                                                  onChange={() => toggleDone(t)}
                                                  style={{ width: 18, height: 18 }}
                                                />
                                                <div>
                                                  <div style={{ fontWeight: 900 }}>
                                                    {t.title} <span style={{ opacity: 0.5 }}>(Task)</span>
                                                  </div>
                                                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                                                    截止：{t.due_date ?? "—"}　｜　負責：{t.assignee ?? "—"}
                                                  </div>
                                                </div>
                                              </div>
                                              <button
                                                onClick={() => deleteTask(t.id)}
                                                style={{
                                                  border: "1px solid #e5e7eb",
                                                  borderRadius: 12,
                                                  padding: "8px 10px",
                                                  background: "white",
                                                  cursor: "pointer",
                                                }}
                                                title="刪除 Task"
                                              >
                                                🗑️
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </SortableRow>
                                    ))}
                                    {(tasksByProject.get(p.id) ?? []).length === 0 && (
                                      <div style={{ opacity: 0.6, fontSize: 13, padding: 10 }}>
                                        還沒有任務，先加一個「經費表 / 贊助方案」之類的 ✅
                                      </div>
                                    )}
                                  </div>
                                </SortableContext>
                              </DndContext>
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    ))}
                    {projects.length === 0 && (
                      <div style={{ opacity: 0.65, padding: 10 }}>
                        目前沒有專案。admin 可以先新增一個測試 ✅
                      </div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
