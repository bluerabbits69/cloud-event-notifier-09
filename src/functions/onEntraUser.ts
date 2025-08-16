import { app, InvocationContext, EventGridEvent } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

const SLACK = process.env.SLACK_WEBHOOK_URL ?? "";
// 3分間
const NEW_WINDOW_MS = 3 * 60 * 1000;

// --- CloudEventsの最小型 ---
// CloudEventの基本構造を定義
interface CloudEvent<T = unknown> {
  id: string;
  source: string;
  type: string;
  subject?: string;
  time?: string;
  data?: T;
}
// CloudEventのデータ型は EntraUserEventData として定義
interface EntraUserEventData {
  resourceData?: { id?: string; eventTime?: string };
  changeType?: string;
}

//  --- Slack通知のためのヘルパー関数 ---
async function notifySlack(text: string) {
  if (!SLACK) return;
  // SlackのWebhook URLが設定されていない場合は何もしない
  // Slackに通知を送信
  await fetch(SLACK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
}

// --- ユーザーIDを抽出するヘルパー関数 ---
function extractUserIdFromSubject(subject?: string) {
  const m = subject ? /Users\/([^/\s]+)$/.exec(subject) : null;
  return m?.[1];
}

// --- 本体（CloudEventsを前提に実装） ---
async function onEntraUserCloud(event: CloudEvent<EntraUserEventData>, context: InvocationContext) {
  context.log("Event received:", event.type, event.subject);

  // ユーザーIDの取得
  const userId = event.data?.resourceData?.id ?? extractUserIdFromSubject(event.subject);
  if (!userId) {
    context.warn("No user id in subject/data");
    return;
  }

  // イベントが発生した時間を取得し、ユーザー作成時間と比較して新規かどうかを判断
  const eventTimeMs = new Date(event.time ?? event.data?.resourceData?.eventTime ?? new Date().toISOString()).getTime();

  // Microsoft Graph APIを使ってユーザー情報を取得
  // 認証のためのクライアントを初期化
  context.log("Fetching user info from Microsoft Graph for userId:", userId);
  const credential = new DefaultAzureCredential();
  // Graph SDK で使える形にトークンを変換
  const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes: ["https://graph.microsoft.com/.default"] });
  // Microsoft Graph クライアントを初期化
  const graph = Client.initWithMiddleware({ authProvider });

  const user = await graph.api(`/users/${userId}`).select("id,displayName,userPrincipalName,mail,createdDateTime").get();

  const createdMs = new Date(user.createdDateTime).getTime();
  // 新規ユーザーかどうかを判定
  const isNew = Math.abs(eventTimeMs - createdMs) <= NEW_WINDOW_MS;

  if (isNew) {
    const text =
      `:tada: 新しいユーザーが作成されました\n` +
      `• 名前: ${user.displayName}\n` +
      `• UPN: ${user.userPrincipalName}\n` +
      `• メール: ${user.mail ?? "(なし)"}\n` +
      `• 作成: ${user.createdDateTime}`;
      // Slackに通知
    await notifySlack(text);
    context.log("Slack notified:", user.userPrincipalName);
  } else {
    context.log("UserUpdated だが新規ではないためスキップ:", user.userPrincipalName);
  }
}

// --- ラッパー：型を EventGridEvent にして中で CloudEvent にキャスト ---
// EntraUserEventData として処理
export async function onEntraUser(event: EventGridEvent, context: InvocationContext) {
  return onEntraUserCloud(event as unknown as CloudEvent<EntraUserEventData>, context);
}

// CloudEventsで受ける（schema指定）
app.eventGrid("onEntraUser", { handler: onEntraUser });