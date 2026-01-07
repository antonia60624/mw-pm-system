import { supabase } from "./supabase";

export async function deleteWorkstream(id: string) {
  return supabase.from("workstreams").delete().eq("id", id);
}

export async function deleteProject(id: string) {
  return supabase.from("projects").delete().eq("id", id);
}

export async function deleteTask(id: string) {
  return supabase.from("tasks").delete().eq("id", id);
}

export async function swapProjectOrder(aId: string, aOrder: number, bId: string, bOrder: number) {
  const { error: e1 } = await supabase.from("projects").update({ sort_order: bOrder }).eq("id", aId);
  if (e1) return { error: e1 };
  const { error: e2 } = await supabase.from("projects").update({ sort_order: aOrder }).eq("id", bId);
  if (e2) return { error: e2 };
  return { error: null };
}

export async function swapTaskOrder(aId: string, aOrder: number, bId: string, bOrder: number) {
  const { error: e1 } = await supabase.from("tasks").update({ sort_order: bOrder }).eq("id", aId);
  if (e1) return { error: e1 };
  const { error: e2 } = await supabase.from("tasks").update({ sort_order: aOrder }).eq("id", bId);
  if (e2) return { error: e2 };
  return { error: null };
}
