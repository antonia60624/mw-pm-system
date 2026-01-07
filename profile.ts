import { supabase } from "./supabase";

export type Profile = {
  id: string;
  email: string;
  role: "admin" | "reviewer";
};

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", uid)
    .maybeSingle();

  if (error) return null;
  return (data as Profile) || null;
}
