import { supabase } from "../lib/supabase";

const evidenceBucket = "app-evidence";

export async function uploadEvidence(file: File, folder: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(evidenceBucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(evidenceBucket).getPublicUrl(path);
  return data.publicUrl;
}
