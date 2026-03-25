import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("qa_knowledge")
      .select("project")
      .eq("status", "active")
      .neq("project", "")
      .not("project", "is", null);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 重複除去してソート
    const projects = [...new Set(data?.map((r) => r.project).filter(Boolean))].sort();

    return new Response(JSON.stringify({ projects }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
