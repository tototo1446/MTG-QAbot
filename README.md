# MTG Q&A Bot

このリポジトリの Next.js アプリは [`frontend/`](/Users/p10516/Desktop/個人用/MTGデータ→Q&Abot（Dify）/frontend) 配下にあります。

## Local development

リポジトリ直下でも `frontend/` でも起動できます。

```bash
npm run dev
```

## Vercel deployment

Vercel では `frontend/` がアプリ本体です。安全なのは Project Settings で `Root Directory` を `frontend` に設定することです。

repo 直下を Root Directory にしたままでも、このリポジトリには以下のフォールバック設定があります。

- 直下の `package.json` が `frontend` の各スクリプトへ委譲する
- 直下の `vercel.json` が Next.js ビルドを有効化する

推奨設定:

- Root Directory: `frontend`
- Framework Preset: `Next.js`
- Build Command: `npm run build`
- Install Command: `npm install`
