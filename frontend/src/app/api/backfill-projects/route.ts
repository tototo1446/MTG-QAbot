import { supabase } from "@/lib/supabase";

const PROJECT_RULES: [string[], string][] = [
  [["youtube", "yt", "動画", "サムネ", "チャンネル"], "YouTube運用"],
  [["ミサオ", "みさお"], "ミサオch"],
  [["あおんぼ", "顧問"], "あおんぼ顧問"],
  [["バズ塾", "ショート"], "バズ塾"],
  [["定例", "全体"], "全体定例"],
];

function classifyProject(mtgTitle: string): string {
  const title = mtgTitle.toLowerCase();
  for (const [keywords, project] of PROJECT_RULES) {
    for (const kw of keywords) {
      if (title.includes(kw.toLowerCase())) {
        return project;
      }
    }
  }
  return "";
}

export async function POST() {
  try {
    // project未設定の行を取得
    const { data: rows, error } = await supabase
      .from("qa_knowledge")
      .select("id, mtg_title")
      .eq("status", "active")
      .or("project.eq.,project.is.null");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({
          message: "プロジェクト未分類の行はありません",
          updated: 0,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let updated = 0;
    for (const row of rows) {
      const project = classifyProject(row.mtg_title || "");
      if (project) {
        const { error: updateError } = await supabase
          .from("qa_knowledge")
          .update({ project })
          .eq("id", row.id);

        if (!updateError) updated++;
      }
    }

    return new Response(
      JSON.stringify({
        message: `${updated}件のプロジェクト分類を更新しました`,
        total: rows.length,
        updated,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
