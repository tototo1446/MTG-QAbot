# MTG Knowledge SaaS Frontend - 実装タスク

## Phase 1: プロジェクト初期化
- [x] Next.js プロジェクト作成（App Router / TypeScript / Tailwind）
- [x] 追加パッケージインストール（lucide-react, next-themes, clsx, tailwind-merge, react-markdown）
- [x] 環境変数設定（.env.local にDify API情報）
- [x] Tailwindカスタム設定（カラー、フォント）

## Phase 2: レイアウトシェル
- [x] UIコンポーネント（Button, Card, Input, Badge, Spinner）
- [x] Sidebar コンポーネント
- [x] Header コンポーネント（ThemeToggle含む）
- [x] Root Layout（sidebar + theme provider）
- [x] globals.css（CSS変数、ダークモード、アニメーション）

## Phase 3: API Routes + Difyクライアント
- [x] lib/dify.ts（Dify APIクライアント）
- [x] /api/knowledge/route.ts（ナレッジ蓄積プロキシ）
- [x] /api/chat/route.ts（Q&Aチャットプロキシ、SSE対応）
- [x] types/index.ts

## Phase 4: ダッシュボード
- [x] ダッシュボードページ（ヒーロー + CTAカード）

## Phase 5: ナレッジ蓄積ページ
- [x] FileUpload コンポーネント（ドラッグ&ドロップ）
- [x] MetadataForm コンポーネント
- [x] ProgressTracker コンポーネント
- [x] hooks/useKnowledgeUpload.ts
- [x] knowledge/page.tsx

## Phase 6: Q&Aチャットページ
- [x] ChatContainer コンポーネント
- [x] MessageBubble コンポーネント（Markdown対応）
- [x] ChatInput コンポーネント
- [x] hooks/useChat.ts（SSEストリーミング）
- [x] chat/page.tsx（サジェスト質問チップ付き）

## Phase 7: ポリッシュ
- [x] アニメーション（フェードイン、スライドイン、ストリーミングドット）
- [x] レスポンシブ対応（モバイルサイドバー）
- [x] ビルド確認（npm run build 成功）

## 注意事項
- Turbopackは日本語パスでクラッシュするため、`--webpack`フラグを使用
- devとbuildのscriptsに`--webpack`を追加済み
