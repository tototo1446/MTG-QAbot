/**
 * MTGナレッジベース - Google Apps Script
 *
 * Difyワークフローから呼び出される2つのエンドポイント:
 *   POST (doPost) - ナレッジ蓄積: QAデータをスプレッドシートに書き込み
 *   GET  (doGet)  - ナレッジ検索: タグ+キーワードでQAを検索して返却
 *
 * スプレッドシートのカラム構成:
 *   A: id | B: mtg_title | C: mtg_date | D: topic | E: time_range
 *   F: question | G: answer | H: fixed_tags | I: free_tags
 *   J: speaker | K: created_at | L: status
 *
 * セットアップ手順:
 *   1. Google スプレッドシートを新規作成
 *   2. シート名を「QA_Knowledge」に変更
 *   3. 1行目にヘッダーを入力（setupHeaders()を実行でも可）
 *   4. 拡張機能 → Apps Script でこのコードを貼り付け
 *   5. SPREADSHEET_ID を自分のスプレッドシートIDに変更
 *   6. デプロイ → 新しいデプロイ → ウェブアプリ
 *      - 実行するユーザー: 自分
 *      - アクセスできるユーザー: 全員
 *   7. デプロイURLをDifyの環境変数 GAS_WEBAPP_URL に設定
 */

// ========================================
// 設定
// ========================================

/** スプレッドシートID（URLの /d/ と /edit の間の文字列） */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

/** シート名 */
const SHEET_NAME = 'QA_Knowledge';

/** ヘッダー定義 */
const HEADERS = [
  'id', 'mtg_title', 'mtg_date', 'topic', 'time_range',
  'question', 'answer', 'fixed_tags', 'free_tags',
  'speaker', 'created_at', 'status'
];

// ========================================
// メインエンドポイント
// ========================================

/**
 * POST: ナレッジ蓄積（Difyの蓄積ワークフローから呼び出し）
 *
 * リクエストボディ:
 * {
 *   "rows": [
 *     {
 *       "id": "abc12345",
 *       "mtg_title": "第3回プロダクト定例",
 *       "mtg_date": "2025-03-20",
 *       "topic": "サムネイルのCTR改善",
 *       "time_range": "03:00-07:30",
 *       "question": "サムネイルのCTRを改善するには？",
 *       "answer": "顔のアップと文字数を3語以内にすると効果的...",
 *       "fixed_tags": "サムネ,分析",
 *       "free_tags": "CTR改善,サムネデザイン",
 *       "speaker": "田中",
 *       "created_at": "2025-03-20 14:30:00",
 *       "status": "active"
 *     }
 *   ]
 * }
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const rows = body.rows || [];

    if (rows.length === 0) {
      return jsonResponse({ success: true, message: 'No rows to insert', count: 0 });
    }

    const sheet = getSheet();
    const newRows = rows.map(row => HEADERS.map(h => row[h] || ''));

    // 最終行の次に一括追加
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, HEADERS.length).setValues(newRows);

    return jsonResponse({
      success: true,
      message: `${newRows.length}件のQAを追加しました`,
      count: newRows.length
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

/**
 * GET: ナレッジ検索（Difyの検索・回答ワークフローから呼び出し）
 *
 * クエリパラメータ:
 *   action=search（必須）
 *   fixed_tags=企画,サムネ（カンマ区切り、OR検索）
 *   free_tags=CTR改善,冒頭離脱（カンマ区切り、OR検索）
 *   keyword=検索キーワード（question/answer/topicを部分一致検索）
 */
function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';

    if (action === 'search') {
      return handleSearch(params);
    }

    // actionなしの場合はヘルスチェック
    return jsonResponse({ status: 'ok', message: 'MTG Knowledge Base GAS API' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ========================================
// 検索ロジック
// ========================================

/**
 * タグ + キーワードでQAを検索
 */
function handleSearch(params) {
  const fixedTagsInput = (params.fixed_tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const freeTagsInput = (params.free_tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const keyword = (params.keyword || '').trim();

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  // データがない場合
  if (lastRow <= 1) {
    return jsonResponse({ results: [], count: 0 });
  }

  // 全データ取得（ヘッダー除く）
  const data = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  // カラムインデックス
  const COL = {};
  HEADERS.forEach((h, i) => COL[h] = i);

  // スコアリング検索
  const scored = [];

  for (const row of data) {
    // statusがactiveでない行はスキップ
    if (row[COL.status] && row[COL.status] !== 'active') continue;

    let score = 0;
    const rowFixedTags = (row[COL.fixed_tags] || '').toString().toLowerCase();
    const rowFreeTags = (row[COL.free_tags] || '').toString().toLowerCase();
    const rowQuestion = (row[COL.question] || '').toString().toLowerCase();
    const rowAnswer = (row[COL.answer] || '').toString().toLowerCase();
    const rowTopic = (row[COL.topic] || '').toString().toLowerCase();

    // 固定タグマッチ（各タグ +3点）
    for (const tag of fixedTagsInput) {
      if (rowFixedTags.includes(tag.toLowerCase())) {
        score += 3;
      }
    }

    // 自由タグマッチ（各タグ +2点）
    for (const tag of freeTagsInput) {
      const tagLower = tag.toLowerCase();
      if (rowFreeTags.includes(tagLower)) {
        score += 2;
      }
      // questionやanswerにも自由タグが含まれていればボーナス
      if (rowQuestion.includes(tagLower) || rowAnswer.includes(tagLower)) {
        score += 1;
      }
    }

    // キーワード検索（question +3, answer +2, topic +1）
    if (keyword) {
      const kw = keyword.toLowerCase();
      // キーワードをスペースで分割して個別検索
      const keywords = kw.split(/\s+/).filter(Boolean);
      for (const k of keywords) {
        if (rowQuestion.includes(k)) score += 3;
        if (rowAnswer.includes(k)) score += 2;
        if (rowTopic.includes(k)) score += 1;
        if (rowFreeTags.includes(k)) score += 1;
      }
    }

    if (score > 0) {
      scored.push({
        score,
        data: {
          id: row[COL.id],
          mtg_title: row[COL.mtg_title],
          mtg_date: row[COL.mtg_date],
          topic: row[COL.topic],
          time_range: row[COL.time_range],
          question: row[COL.question],
          answer: row[COL.answer],
          fixed_tags: row[COL.fixed_tags],
          free_tags: row[COL.free_tags],
          speaker: row[COL.speaker]
        }
      });
    }
  }

  // スコア降順でソート、上位20件に制限
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, 20).map(s => s.data);

  return jsonResponse({ results, count: results.length });
}

// ========================================
// ユーティリティ
// ========================================

/**
 * シートオブジェクトを取得
 */
function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // ヘッダーを自動設定
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * JSONレスポンスを返す
 */
function jsonResponse(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================================
// セットアップ用（手動実行）
// ========================================

/**
 * 初期セットアップ: ヘッダー行を設定し、列幅を調整
 * Apps Scriptエディタから手動で1回実行してください
 */
function setupHeaders() {
  const sheet = getSheet();

  // ヘッダーが未設定の場合のみ
  const firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell === 'id') {
    Logger.log('ヘッダーは既に設定済みです');
    return;
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#4338CA');
  sheet.getRange(1, 1, 1, HEADERS.length).setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  // 列幅調整
  const widths = {
    1: 80,    // id
    2: 200,   // mtg_title
    3: 110,   // mtg_date
    4: 200,   // topic
    5: 110,   // time_range
    6: 350,   // question
    7: 500,   // answer
    8: 150,   // fixed_tags
    9: 200,   // free_tags
    10: 100,  // speaker
    11: 160,  // created_at
    12: 80    // status
  };

  for (const [col, width] of Object.entries(widths)) {
    sheet.setColumnWidth(Number(col), width);
  }

  Logger.log('ヘッダーのセットアップが完了しました');
}

/**
 * テスト用: ダミーデータを1件追加
 */
function testInsert() {
  const testEvent = {
    postData: {
      contents: JSON.stringify({
        rows: [{
          id: 'test001',
          mtg_title: 'テストMTG',
          mtg_date: '2025-03-20',
          topic: 'テスト話題',
          time_range: '00:00-01:00',
          question: 'これはテストのQAですか？',
          answer: 'はい、これはGASの動作確認用テストデータです。',
          fixed_tags: '運用全般',
          free_tags: 'テスト,動作確認',
          speaker: 'テスト太郎',
          created_at: new Date().toISOString(),
          status: 'active'
        }]
      })
    }
  };

  const result = doPost(testEvent);
  Logger.log(result.getContent());
}

/**
 * テスト用: 検索テスト
 */
function testSearch() {
  const testEvent = {
    parameter: {
      action: 'search',
      fixed_tags: '運用全般',
      free_tags: 'テスト',
      keyword: 'テスト'
    }
  };

  const result = doGet(testEvent);
  Logger.log(result.getContent());
}
