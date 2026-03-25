-- ============================================================
-- MTGナレッジQ&Abot: Supabase マイグレーション
-- Supabase Dashboard > SQL Editor にこの内容を貼り付けて実行してください
-- ============================================================

-- ============================================================
-- 1. pgvector有効化 + カラム追加 + インデックス
-- ============================================================

-- pgvector拡張機能を有効化（ベクトル検索に必要）
CREATE EXTENSION IF NOT EXISTS vector;

-- projectカラム追加（プロジェクト自動分類用）
ALTER TABLE qa_knowledge
  ADD COLUMN IF NOT EXISTS project text DEFAULT '';

-- embeddingカラム追加（ベクトル検索用、1536次元）
ALTER TABLE qa_knowledge
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- インデックス作成（検索高速化）
CREATE INDEX IF NOT EXISTS idx_qa_knowledge_status ON qa_knowledge(status);
CREATE INDEX IF NOT EXISTS idx_qa_knowledge_project ON qa_knowledge(project);
CREATE INDEX IF NOT EXISTS idx_qa_knowledge_embedding
  ON qa_knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);


-- ============================================================
-- 2. search_knowledge RPC関数（キーワード検索）
-- ============================================================

CREATE OR REPLACE FUNCTION search_knowledge(
  p_keywords text[] DEFAULT '{}',
  p_fixed_tags text[] DEFAULT '{}',
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id text,
  mtg_title text,
  mtg_date text,
  topic text,
  time_range text,
  question text,
  answer text,
  fixed_tags text,
  free_tags text,
  speaker text,
  project text,
  score float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.mtg_title,
    k.mtg_date,
    k.topic,
    k.time_range,
    k.question,
    k.answer,
    k.fixed_tags,
    k.free_tags,
    k.speaker,
    k.project,
    (
      (SELECT COALESCE(SUM(CASE WHEN lower(k.fixed_tags) LIKE '%' || lower(t) || '%' THEN 3 ELSE 0 END), 0)
       FROM unnest(p_fixed_tags) AS t)
      +
      (SELECT COALESCE(SUM(
        CASE WHEN lower(k.question) LIKE '%' || lower(kw) || '%' THEN 3 ELSE 0 END +
        CASE WHEN lower(k.answer) LIKE '%' || lower(kw) || '%' THEN 2 ELSE 0 END +
        CASE WHEN lower(k.topic) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END +
        CASE WHEN lower(k.free_tags) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END
      ), 0) FROM unnest(p_keywords) AS kw)
    )::float AS score
  FROM qa_knowledge k
  WHERE k.status = 'active'
  HAVING (
    (SELECT COALESCE(SUM(CASE WHEN lower(k.fixed_tags) LIKE '%' || lower(t) || '%' THEN 3 ELSE 0 END), 0)
     FROM unnest(p_fixed_tags) AS t)
    +
    (SELECT COALESCE(SUM(
      CASE WHEN lower(k.question) LIKE '%' || lower(kw) || '%' THEN 3 ELSE 0 END +
      CASE WHEN lower(k.answer) LIKE '%' || lower(kw) || '%' THEN 2 ELSE 0 END +
      CASE WHEN lower(k.topic) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END +
      CASE WHEN lower(k.free_tags) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END
    ), 0) FROM unnest(p_keywords) AS kw)
  ) > 0
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;


-- ============================================================
-- 3. hybrid_search RPC関数（ベクトル + キーワード ハイブリッド検索）
-- ============================================================

CREATE OR REPLACE FUNCTION hybrid_search(
  p_embedding vector(1536) DEFAULT NULL,
  p_keywords text[] DEFAULT '{}',
  p_fixed_tags text[] DEFAULT '{}',
  p_vector_weight float DEFAULT 0.6,
  p_keyword_weight float DEFAULT 0.4,
  p_project text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id text,
  mtg_title text,
  mtg_date text,
  topic text,
  time_range text,
  question text,
  answer text,
  fixed_tags text,
  free_tags text,
  speaker text,
  project text,
  score float
)
LANGUAGE plpgsql AS $$
DECLARE
  max_keyword_score float;
BEGIN
  -- キーワードスコアの最大値を事前計算（正規化用）
  SELECT COALESCE(MAX(ks), 1) INTO max_keyword_score
  FROM (
    SELECT (
      (SELECT COALESCE(SUM(CASE WHEN lower(k.fixed_tags) LIKE '%' || lower(t) || '%' THEN 3 ELSE 0 END), 0) FROM unnest(p_fixed_tags) AS t) +
      (SELECT COALESCE(SUM(
        CASE WHEN lower(k.question) LIKE '%' || lower(kw) || '%' THEN 3 ELSE 0 END +
        CASE WHEN lower(k.answer) LIKE '%' || lower(kw) || '%' THEN 2 ELSE 0 END +
        CASE WHEN lower(k.topic) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END +
        CASE WHEN lower(k.free_tags) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END
      ), 0) FROM unnest(p_keywords) AS kw)
    ) AS ks
    FROM qa_knowledge k WHERE k.status = 'active'
  ) sub WHERE ks > 0;

  RETURN QUERY
  SELECT
    k.id,
    k.mtg_title,
    k.mtg_date,
    k.topic,
    k.time_range,
    k.question,
    k.answer,
    k.fixed_tags,
    k.free_tags,
    k.speaker,
    k.project,
    (
      -- ベクトルスコア（0〜1、embeddingがある行のみ）
      CASE
        WHEN p_embedding IS NOT NULL AND k.embedding IS NOT NULL
        THEN (1 - (k.embedding <=> p_embedding)) * p_vector_weight
        ELSE 0
      END
      +
      -- キーワードスコア（正規化して0〜1）
      CASE
        WHEN max_keyword_score > 0 THEN
          ((
            (SELECT COALESCE(SUM(CASE WHEN lower(k.fixed_tags) LIKE '%' || lower(t) || '%' THEN 3 ELSE 0 END), 0) FROM unnest(p_fixed_tags) AS t) +
            (SELECT COALESCE(SUM(
              CASE WHEN lower(k.question) LIKE '%' || lower(kw) || '%' THEN 3 ELSE 0 END +
              CASE WHEN lower(k.answer) LIKE '%' || lower(kw) || '%' THEN 2 ELSE 0 END +
              CASE WHEN lower(k.topic) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END +
              CASE WHEN lower(k.free_tags) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END
            ), 0) FROM unnest(p_keywords) AS kw)
          ) / max_keyword_score) * p_keyword_weight
        ELSE 0
      END
    )::float AS score
  FROM qa_knowledge k
  WHERE k.status = 'active'
    AND (p_project IS NULL OR k.project = p_project)
  HAVING (
    CASE
      WHEN p_embedding IS NOT NULL AND k.embedding IS NOT NULL
      THEN (1 - (k.embedding <=> p_embedding))
      ELSE 0
    END
    +
    (SELECT COALESCE(SUM(CASE WHEN lower(k.fixed_tags) LIKE '%' || lower(t) || '%' THEN 3 ELSE 0 END), 0) FROM unnest(p_fixed_tags) AS t) +
    (SELECT COALESCE(SUM(
      CASE WHEN lower(k.question) LIKE '%' || lower(kw) || '%' THEN 3 ELSE 0 END +
      CASE WHEN lower(k.answer) LIKE '%' || lower(kw) || '%' THEN 2 ELSE 0 END +
      CASE WHEN lower(k.topic) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END +
      CASE WHEN lower(k.free_tags) LIKE '%' || lower(kw) || '%' THEN 1 ELSE 0 END
    ), 0) FROM unnest(p_keywords) AS kw)
  ) > 0
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;
