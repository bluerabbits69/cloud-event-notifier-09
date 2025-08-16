# cloud-event-notifier-09

Event Grid X Azure Functions (Azure Event Grid trigger)  
Entraに新しくユーザーが作成されるとSlackに通知を送るサンプル  
（100本ノックの第9弾）

---

## 🚀 機能概要

Microsoft Entra ID (旧 Azure AD) 上で 新しいユーザーが作成されたイベント を検知し、
ユーザー情報を Slack に通知する Azure Functions アプリです。
- イベント配信には Event Grid (Partner Topic: Microsoft Graph) を利用
- ユーザー情報の取得には Microsoft Graph API を利用
- 認証には Managed Identity (MI) を利用し、安全にトークンを発行

---

## 📦 ディレクトリ構成

```
cloud-event-notifier-09/
├── src/functions/
│   └── onEntraUser.ts      
├── package.json
├── tsconfig.json
├── local.settings.json       # Azure Functions ローカル設定
└── README.md
```

---

## 🔧 作成までの手順

### 1. ローカルプロジェクトを作成
```bash
func init cloud-event-notifier-09 --worker-runtime node --language typescript
```
### 2. 関数を作成
- Templateは"Azure Event Grid trigger"を指定します。
```bash
cd cloud-event-notifier-09
func new --name onEntraUser --template "Azure Event Grid trigger"
```
↓作成されるコード
```typescript
import { app, EventGridEvent, InvocationContext } from "@azure/functions";

export async function onEntraUser(event: EventGridEvent, context: InvocationContext): Promise<void> {
    context.log('Event grid function processed event:', event);
}

app.eventGrid('onEntraUser', {
    handler: onEntraUser
});
```

### 3. 使用するパッケージをインストール
```bash
npm i @azure/functions @azure/identity @microsoft/microsoft-graph-client
```

### 4. 関数コードを編集
- コードは`src/functions/onEntraUser.ts`を参考にしてください

### 5. Azure上に関数アプリを作成  
- 今回はVSCodeの拡張機能を利用して関数アプリを作成しました。
- 作成後はAzure上にデプロイする。
- 作成後はSlack Webhook用URLを環境変数に保存します。

### 6. 関数アプリにManaged IDを割り当てる。
- 関数内でDefaultAzureCredentialを使って認証するために、アプリにManaged IDを割り当てる必要があります。

### 7. Managed IDにMicrosoft Graphのアクセス権限を設定
- User.Read.All権限を付与する。

### 8. Event Gridのパートナートピックを作成する。
- Entraからのイベントを受け取る窓口となるようなものなので必ず作成する。  
  
【Azure上の説明】
>Microsoft Graph API サブスクリプションを使用すると、Microsoft Entra ID のユーザーとグループのリソースに関するイベントを受信できるため、リソースが更新または削除されたときにタスクを自動化できます。

### 9.パートナートピック上でイベントサブスクリプションを作成する
- イベント スキーマは「クラウド イベント スキーマ v1.0」を作成する。
- エンドポイントはデプロイした関数を選択する

---
## ミスったこと・注意点
- Microsoft Graph API サブスクリプションを使用した場合、Event Grid Schemaを使用したイベントサブスクリプションは作成できない（仕様らしい）
- 関数がEvent Gridから受け取るEventはCloudEventだが、
テンプレートを使用して作成した関数がEventGridEventを受け取る前提なので、CloudEvent型にキャストして処理をしないといけない。
そのため、CloudEvent型にキャストして処理する`onEntraUserCloud`関数を作成した。

```typescript
export async function onEntraUser(event: EventGridEvent, context: InvocationContext) {
  return onEntraUserCloud(event as unknown as CloudEvent<EntraUserEventData>, context);
}
```