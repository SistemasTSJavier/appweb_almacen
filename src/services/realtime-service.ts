import { supabase } from "../lib/supabase";

export function subscribeInventoryRealtime(onRefresh: () => void): () => void {
  const client = supabase;
  if (!client) return () => undefined;
  const channel = client
    .channel("inventory-updates")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inventory_items" },
      () => onRefresh(),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
