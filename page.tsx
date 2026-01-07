"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getMyProfile, type Profile } from "../../lib/profile";

type Workstream = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

type Project = {
  id: string;
  workstream_id: string | null;
  name: string;
  status: string | null;
  sort_order: number;
  created_at: string;
};

type Task = {
  id: string;
  project_id: string | null;
  title: string;
  assignee: string | null;
  due_date: string | null; // date -> string
  done: boolean;
  sort_order: number;
  created_at: string;
};

const card: React.CSSProperties = {
  border: "1px solid #e8e8e8",
  borderRadius: 18,
  padding: 16,
  background: "white",
};

const btn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #111",
  cursor: "pointer",
  fontWeight: 900,
  background: "white",
};

const smallBtn: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid #111",
  cursor: "pointer",
  fontWeight: 900,
  background: "white",
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekdayShort(d: Date) {
  const map = ["日", "一", "二", "三", "四", "五", "六"];
  return map[d.getDay()];
}

export default function ProjectsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);

  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [wsName, setWsName] = useState("兒少組");
  const [newProjectByWs, setNewProjectByWs] = useState<Record<string, string>>(
    {}
  );

  const [newTaskTitleByProject, setNewTaskTitleByProject] = useState<
    Record<string, string>
  >({});
  const [newTaskDueByProject, setNewTaskDueByProject] = useState<
    Record<string, string>
  >({});
  const [newTaskAssigneeByProject, setNewTaskAssigneeByProject] = useState<
    Record<string, string>
  >({});

  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const isAdmin = me?.role === "admin";

  const wsById = useMemo(() => {
    const m = new Map<string, Workstream>();
    for (const w of workstreams) m.set(w.id, w);
    return m;
  }, [workstreams]);

  const projectById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const getWsColorByProjectId = (projectId: string | null) => {
    if (!projectId) return "#111111";
    const p = projectById.get(projectId);
    const ws = p?.workstream_id ? wsById.get(p.workstream_id) : undefined;
    return ws?.color || "#111111";
  };

  const loadAll = async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      router.replace("/login");
      return;
    }

    const profile = await getMyProfile();
    setMe(profile);

    const ws = await supabase
      .from("workstreams")
      .select("id,name,color,sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const pj = await supabase
      .from("projects")
      .select("id,workstream_id,name,status,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const tk = await supabase
      .from("tasks")
      .select("id,project_id,title,assignee,due_date,done,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    setWorkstreams((ws.data || []) as Workstream[]);
    setProjects((pj.data || []) as Project[]);
    setTasks((tk.data || []) as Task[]);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // ✅ 1) 不用拖曳：改成「真排序」(↑↓)，不會跳到奇怪畫面
  const moveProject = async (projectId: string, dir: -1 | 1) => {
    if (!isAdmin) return alert("只有 admin 可以排序/編輯");
    const p = projects.find((x) => x.id === projectId);
    if (!p) return;

    const siblings = projects
      .filter((x) => x.workstream_id === p.workstream_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const idx = siblings.findIndex((x) => x.id === projectId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= siblings.length) return;

    const a = siblings[idx];
    const b = siblings[j];

    const { error: e1 } = await supabase
      .from("projects")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);

    if (e1) return alert(e1.message);

    const { error: e2 } = await supabase
      .from("projects")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);

    if (e2) return alert(e2.message);

    await loadAll();
  };

  const moveTask = async (taskId: string, dir: -1 | 1) => {
    if (!isAdmin) return alert("只有 admin 可以排序/編輯");
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;

    const siblings = tasks
      .filter((x) => x.project_id === t.project_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const idx = siblings.findIndex((x) => x.id === taskId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= siblings.length) return;

    const a = siblings[idx];
    const b = siblings[j];

    const { error: e1 } = await supabase
      .from("tasks")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id);

    if (e1) return alert(e1.message);

    const { error: e2 } = await supabase
      .from("tasks")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id);

    if (e2) return alert(e2.message);

    await loadAll();
  };

  // ✅ 2) 垃圾桶/刪除都是真的（而且有 confirm）
  const createWorkstream = async () => {
    if (!isAdmin) return alert("只有 admin 可以新增");
    const name = wsName.trim();
    if (!name) return alert("請輸入組別名稱");

    const { error } = await supabase.from("workstreams").insert({
      name,
      // color/sort_order 用 DB default + 我們 SQL 內的 upsert 做維護
    });

    if (error) return alert(error.message);
    setWsName("");
    await loadAll();
  };

  const deleteWorkstream = async (id: string) => {
    if (!isAdmin) return alert("只有 admin 可以刪除");
    const ok = confirm("確定要刪除這個 Workstream？底下專案/任務可能也會受影響。");
    if (!ok) return;

    const { error } = await supabase.from("workstreams").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadAll();
  };

  const createProject = async (wsId: string) => {
    if (!isAdmin) return alert("只有 admin 可以新增");
    const name = (newProjectByWs[wsId] || "").trim();
    if (!name) return alert("請輸入 Project 名稱");

    // 找該 workstream 下一個 sort_order
    const siblings = projects.filter((p) => p.workstream_id === wsId);
    const maxOrder = siblings.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);

    const { error } = await supabase.from("projects").insert({
      workstream_id: wsId,
      name,
      status: "active",
      sort_order: maxOrder + 1,
    });

    if (error) return alert(error.message);
    setNewProjectByWs((p) => ({ ...p, [wsId]: "" }));
    await loadAll();
  };

  const deleteProject = async (projectId: string) => {
    if (!isAdmin) return alert("只有 admin 可以刪除");
    const ok = confirm("確定要刪除這個 Project？（會連同底下 Tasks 一起刪）");
    if (!ok) return;

    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) return alert(error.message);
    await loadAll();
  };

  const createTask = async (projectId: string) => {
    if (!isAdmin) return alert("只有 admin 可以新增/編輯（由 RLS 控制）");

    const title = (newTaskTitleByProject[projectId] || "").trim();
    const due = (newTaskDueByProject[projectId] || "").trim();
    const assignee = (newTaskAssigneeByProject[projectId] || "").trim();

    if (!title) return alert("請填任務名稱");
    if (!assignee) return alert("負責人必填");

    const siblings = tasks.filter((t) => t.project_id === projectId);
    const maxOrder = siblings.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);

    const payload: any = {
      project_id: projectId,
      title,
      assignee,
      done: false,
      sort_order: maxOrder + 1,
    };
    if (due) payload.due_date = due;

    const { error } = await supabase.from("tasks").insert(payload);
    if (error) return alert(error.message);

    setNewTaskTitleByProject((p) => ({ ...p, [projectId]: "" }));
    setNewTaskDueByProject((p) => ({ ...p, [projectId]: "" }));
    setNewTaskAssigneeByProject((p) => ({ ...p, [projectId]: "" }));
    await loadAll();
  };

  const deleteTask = async (taskId: string) => {
    if (!isAdmin) return alert("只有 admin 可以刪除");
    const ok = confirm("確定要刪除這個 Task？");
    if (!ok) return;

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) return alert(error.message);
    await loadAll();
  };

  const toggleDone = async (task: Task) => {
    if (!isAdmin) return;
    const { error } = await supabase
      .from("tasks")
      .update({ done: !task.done })
      .eq("id", task.id);
    if (error) return alert(error.message);
    await loadAll();
  };

  // ✅ 5) 本週里程碑：顯示「日期 + 星期」+ 逾期
  const weekly = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0 Sun
    const diffToMon = (day + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - diffToMon);
    mon.setHours(0, 0, 0, 0);
    const nextMon = new Date(mon);
    nextMon.setDate(mon.getDate() + 7);

    const isOverdue = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      return dt < mon;
    };

    const inWeek = (d: string) => {
      const dt = new Date(d + "T00:00:00");
      return dt >= mon && dt < nextMon;
    };

    return tasks
      .filter((t) => !t.done && !!t.due_date)
      .filter((t) => inWeek(t.due_date!) || isOverdue(t.due_date!))
      .map((t) => {
        const p = t.project_id ? projectById.get(t.project_id) : undefined;
        const wsName =
          p?.workstream_id ? wsById.get(p.workstream_id)?.name : undefined;

        const wsColor = getWsColorByProjectId(t.project_id);

        const dd = new Date((t.due_date || ymd(new Date())) + "T00:00:00");
        return {
          ...t,
          projectName: p?.name || "（未分類 Project）",
          workstreamName: wsName || "（未分類）",
          isOverdue: t.due_date ? isOverdue(t.due_date) : false,
          dayLabel: `${t.due_date}（${weekdayShort(dd)}）`,
          wsColor,
        };
      })
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  }, [tasks, projectById, wsById]);

  // ✅ 4) 月曆：未完成 + due_date（顏色依 workstream）
  const monthGrid = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
    const firstDow = (first.getDay() + 6) % 7; // Mon=0 ... Sun=6
    const daysInMonth = last.getDate();

    const cells: Array<{ key: string; date: string | null }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ key: `b-${i}`, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d);
      cells.push({ key: `d-${d}`, date: ymd(dt) });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `t-${cells.length}`, date: null });

    const byDate = new Map<string, Array<{ id: string; title: string; color: string }>>();
    for (const t of tasks) {
      if (t.done) continue;
      if (!t.due_date) continue;
      const color = getWsColorByProjectId(t.project_id);
      if (!byDate.has(t.due_date)) byDate.set(t.due_date, []);
      byDate.get(t.due_date)!.push({ id: t.id, title: t.title, color });
    }

    // 每天最多顯示 8 個點點
    for (const [k, arr] of byDate.entries()) byDate.set(k, arr.slice(0, 8));

    return { cells, byDate, daysInMonth };
  }, [monthCursor, tasks, projects, workstreams, projectById, wsById]);

  return (
    <div style={{ fontFamily: "system-ui", background: "#fafafa", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 1000, letterSpacing: -0.5 }}>MWKIDS Tracker</div>
            <div style={{ marginTop: 6, opacity: 0.75 }}>
              目前登入：<b>{me?.email || "..."}</b> ｜ 角色：<b>{me?.role || "..."}</b>
              <span style={{ marginLeft: 10, fontSize: 12 }}>
                （reviewer：只能看｜admin：可新增/編輯）
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={btn} onClick={loadAll}>重新載入</button>
            <button style={btn} onClick={logout}>登出</button>
          </div>
        </div>

        {/* ✅ 4) 里程碑月曆（可切上/下個月，點點顏色跟組別一致） */}
        <div style={{ marginTop: 18, ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 1000, fontSize: 18 }}>
              里程碑月曆（截止日點點｜未完成）
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                style={smallBtn}
                onClick={() =>
                  setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                }
              >
                上一個月
              </button>
              <div style={{ fontWeight: 900 }}>
                {monthCursor.getFullYear()} / {String(monthCursor.getMonth() + 1).padStart(2, "0")}
              </div>
              <button
                style={smallBtn}
                onClick={() =>
                  setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                }
              >
                下一個月
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <div key={d} style={{ fontSize: 12, opacity: 0.7, fontWeight: 900, textAlign: "center" }}>
                {d}
              </div>
            ))}
            {monthGrid.cells.map((c) => {
              const dots = c.date ? monthGrid.byDate.get(c.date) || [] : [];
              return (
                <div
                  key={c.key}
                  style={{
                    minHeight: 62,
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 8,
                    background: c.date ? "#fff" : "transparent",
                    opacity: c.date ? 1 : 0.35,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                    {c.date ? Number(c.date.slice(-2)) : ""}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {dots.map((d) => (
                      <span
                        key={d.id}
                        title={d.title}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          display: "inline-block",
                          background: d.color,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            點點顏色 = Workstream 顏色；滑過點點可看到 Task 標題。
          </div>
        </div>

        {/* ✅ 5) 本週里程碑（未完成＋本週/逾期）：含日期/星期 */}
        <div style={{ marginTop: 18, ...card }}>
          <div style={{ fontWeight: 1000, fontSize: 18, marginBottom: 10 }}>本週里程碑（未完成＋本週/逾期）</div>
          {weekly.length === 0 ? (
            <div style={{ opacity: 0.7 }}>目前沒有本週/逾期的未完成任務 ✅</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {weekly.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid #eee",
                    borderLeft: `6px solid ${t.wsColor || "#111"}`,
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 950 }}>
                        {t.title}{" "}
                        {t.isOverdue && (
                          <span style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px", border: "1px solid #111", borderRadius: 999 }}>
                            逾期
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
                        due：{t.dayLabel || "-"} ｜ 負責人：{t.assignee || "-"} ｜ {t.workstreamName} / {t.projectName}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 工作區 */}
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          {/* 新增 Workstream */}
          <div style={card}>
            <div style={{ fontWeight: 1000, fontSize: 18, marginBottom: 10 }}>大分類（Workstream）</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="例如：兒少組"
                style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", minWidth: 240, flex: 1 }}
              />
              <button style={{ ...btn, opacity: isAdmin ? 1 : 0.4 }} onClick={createWorkstream}>
                新增 Workstream
              </button>
            </div>
          </div>

          {/* Workstreams 列表（依 sort_order） */}
          {workstreams
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((ws) => {
              const wsProjects = projects
                .filter((p) => p.workstream_id === ws.id)
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

              return (
                <div key={ws.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: ws.color || "#111", display: "inline-block" }} />
                      <div style={{ fontWeight: 1000, fontSize: 20 }}>{ws.name}</div>
                    </div>
                    <button
                      style={{ ...btn, opacity: isAdmin ? 1 : 0.3 }}
                      onClick={() => deleteWorkstream(ws.id)}
                    >
                      刪除 Workstream
                    </button>
                  </div>

                  {/* 新增 Project */}
                  <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={newProjectByWs[ws.id] || ""}
                      onChange={(e) => setNewProjectByWs((p) => ({ ...p, [ws.id]: e.target.value }))}
                      placeholder="新增 Project 名稱（例如：企劃書）"
                      style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd", minWidth: 280, flex: 1 }}
                    />
                    <button style={{ ...btn, opacity: isAdmin ? 1 : 0.3 }} onClick={() => createProject(ws.id)}>
                      新增 Project
                    </button>
                  </div>

                  {/* Projects */}
                  <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                    {wsProjects.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>這個 Workstream 目前沒有 Project。</div>
                    ) : (
                      wsProjects.map((p) => {
                        const pTasks = tasks
                          .filter((t) => t.project_id === p.id)
                          .slice()
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

                        return (
                          <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 16, padding: 14, background: "#fff" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <span style={{ width: 10, height: 10, borderRadius: 999, background: ws.color || "#111", display: "inline-block" }} />
                                <div>
                                  <div style={{ fontWeight: 1000, fontSize: 16 }}>{p.name}</div>
                                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                                    status：{p.status || "-"}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button style={{ ...smallBtn, opacity: isAdmin ? 1 : 0.3 }} onClick={() => moveProject(p.id, -1)}>↑</button>
                                <button style={{ ...smallBtn, opacity: isAdmin ? 1 : 0.3 }} onClick={() => moveProject(p.id, 1)}>↓</button>
                                <button style={{ ...btn, opacity: isAdmin ? 1 : 0.3 }} onClick={() => deleteProject(p.id)}>
                                  刪除 Project
                                </button>
                              </div>
                            </div>

                            {/* 新增 Task（單一 project 獨立輸入 ✅ 你已修好，我保留） */}
                            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 160px 160px 120px", gap: 10 }}>
                              <input
                                value={newTaskTitleByProject[p.id] || ""}
                                onChange={(e) => setNewTaskTitleByProject((s) => ({ ...s, [p.id]: e.target.value }))}
                                placeholder="新增 Task（例如：經費表）"
                                style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                              />
                              <input
                                value={newTaskDueByProject[p.id] || ""}
                                onChange={(e) => setNewTaskDueByProject((s) => ({ ...s, [p.id]: e.target.value }))}
                                placeholder="due_date"
                                type="date"
                                style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                              />
                              <input
                                value={newTaskAssigneeByProject[p.id] || ""}
                                onChange={(e) => setNewTaskAssigneeByProject((s) => ({ ...s, [p.id]: e.target.value }))}
                                placeholder="負責人（必填）"
                                style={{ padding: 10, borderRadius: 12, border: "1px solid #ddd" }}
                              />
                              <button style={{ ...btn, opacity: isAdmin ? 1 : 0.3 }} onClick={() => createTask(p.id)}>
                                新增 Task
                              </button>
                            </div>

                            {/* Task 列表 */}
                            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                              {pTasks.length === 0 ? (
                                <div style={{ opacity: 0.7 }}>尚無 Tasks</div>
                              ) : (
                                pTasks.map((t) => {
                                  const dd = t.due_date ? new Date(t.due_date + "T00:00:00") : null;
                                  const dueLabel = t.due_date ? `${t.due_date}（${weekdayShort(dd!)}）` : "-";
                                  return (
                                    <div
                                      key={t.id}
                                      style={{
                                        border: "1px solid #f0f0f0",
                                        borderLeft: `6px solid ${ws.color || "#111"}`,
                                        borderRadius: 14,
                                        padding: 10,
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 10,
                                        alignItems: "center",
                                      }}
                                    >
                                      <label style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
                                        <input
                                          type="checkbox"
                                          checked={!!t.done}
                                          onChange={() => toggleDone(t)}
                                          disabled={!isAdmin}
                                        />
                                        <div>
                                          <div style={{ fontWeight: 900, textDecoration: t.done ? "line-through" : "none" }}>
                                            {t.title}
                                          </div>
                                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                                            due：{dueLabel} ｜ 負責人：{t.assignee || "-"}
                                          </div>
                                        </div>
                                      </label>

                                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <button style={{ ...smallBtn, opacity: isAdmin ? 1 : 0.2 }} onClick={() => moveTask(t.id, -1)}>↑</button>
                                        <button style={{ ...smallBtn, opacity: isAdmin ? 1 : 0.2 }} onClick={() => moveTask(t.id, 1)}>↓</button>
                                        <button
                                          style={{ ...btn, padding: "8px 10px", opacity: isAdmin ? 1 : 0.2 }}
                                          onClick={() => deleteTask(t.id)}
                                        >
                                          刪除
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <div style={{ marginTop: 18, opacity: 0.7, fontSize: 12 }}>
          小提示：reviewer 的「只能看」要以 Supabase RLS 為準；前端這裡只是先做基本 UI 限制。
        </div>
      </div>
    </div>
  );
}
