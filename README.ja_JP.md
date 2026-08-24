# deckboard-librehardwaremonitor

[English](README.md) | 日本語

LibreHardwareMonitorのセンサー情報をDeckboardのグラフブロックへ表示する、
Riva Farabi氏作成の拡張機能を基にした非公式メンテナンス版

バージョン2では、LibreHardwareMonitorのRemote Web Serverが提供する
`/data.json`を主要な取得元として使用。LibreHardwareMonitor 0.9.6で発生する
単位付き`RawValue`にも対応し、動的に変換された値を安定した基準単位へ変換

バージョン2.1では、HTTP取得に失敗した場合、LibreHardwareMonitor 0.9.4以前の
WMIプロバイダーへ自動的に切替。各ポーリングでHTTPを再試行し、Remote Web
Serverの復旧後はHTTP取得へ自動復帰

## 元の拡張機能からの主な変更点

- `root\\LibreHardwareMonitor` WMIに代わる`GET /data.json`の主要取得経路
- LibreHardwareMonitor 0.9.4以前を対象としたWMIフォールバック
- HTTP取得失敗時のみ読み込む`node-wmi`
- 既存設定との互換性を維持する`lhw-<SensorId>`キー
- 既存のLoad、TemperatureアクションIDの維持
- ファン速度、電力、クロック、電圧、スループットなどに対応する
  **Display Any Sensor**アクション
- URL、Basic認証、ポーリング間隔、タイムアウトの設定
- ハードウェア構成変更時のセンサー候補自動更新
- リクエスト重複防止と同一エラーログの抑制
- HTTP解析、ローカルHTTP接続、WMI変換に関するテスト

## 想定環境

| 項目 | 対応・想定環境 |
|---|---|
| OS | Windows。Windows以外ではポーリング処理を開始しない実装 |
| Deckboard | `deckboard-kit` 0.3系の拡張機能を利用できるバージョン |
| 現行モニター | Remote Web Serverを有効化したLibreHardwareMonitor 0.9.6以降 |
| 旧版モニター | WMIプロバイダーを利用できるLibreHardwareMonitor 0.9.4以前 |
| 拡張機能ランタイム | Deckboard内のNode.js 12互換API |
| 開発・パッケージ作成 | Node.js 18以降とnpm |

LibreHardwareMonitor 0.9.5以降では、拡張機能バージョン1が利用していた
旧WMIデータを利用不可。そのためHTTPを主要取得元として使用し、WMIは旧版環境
を継続利用するためのフォールバックとしてのみ使用

## 取得処理と実装

起動直後に1回取得し、以降は設定したポーリング間隔で次の処理を実行

1. 設定されたLibreHardwareMonitorの`/data.json`へHTTPリクエスト
2. 階層化されたJSONの解析と有限数値センサーのDeckboardへの反映
3. HTTP失敗またはセンサー0件の場合、`root\\LibreHardwareMonitor`の
   `Hardware`クラスと`Sensor`クラスをWMIで取得
4. WMI利用中も次回ポーリングでHTTPを再試行

旧版WMI環境の継続利用と、Remote Web Server復旧後のHTTP自動復帰を両立する構成

| ファイル | 役割 |
|---|---|
| `index.js` | Deckboardライフサイクル、設定、ポーリング、取得元切替、値の反映 |
| `lib/lhm-client.js` | HTTP通信、URL正規化、JSON解析、単位変換、Deckboard向け変換 |
| `lib/lhm-wmi-client.js` | `node-wmi`の遅延読込、旧WMIデータの共通センサー形式への変換 |
| `test/lhm-client.test.js` | HTTP解析、値変換、Basic認証、Deckboard向け変換のテスト |
| `test/lhm-wmi-client.test.js` | 注入したクエリクライアントによるWMI変換と空結果のテスト |

HTTPとWMIの両方で`lhw-<Identifier>`形式を維持するため、取得元が切り替わっても
既存のLoad・Temperatureブロックで保存済みセンサーキーを継続利用可能

## LibreHardwareMonitorの設定

1. LibreHardwareMonitorを起動。取得可能なセンサーを増やす場合は管理者として起動
2. **Options > Remote Web Server > Run**を有効化
3. ブラウザーで次のURLを確認

   ```text
   http://127.0.0.1:8085/data.json
   ```

`Version`と`Children`を含むJSONが表示されればHTTP取得を利用可能

現行版ではWMI設定不要。Remote Web Serverへ接続できない場合のみ
`root\\LibreHardwareMonitor`を確認し、WMI対応旧版からの取得を試行

## ソースからのインストール

```powershell
npm install
npm run validate
npm run build
```

生成物:

```text
dist/libre-hardware-monitor.asar
```

Windowsでの配置先:

```text
%USERPROFILE%\deckboard\extensions\
```

ビルドと配置を同時に行う場合:

```powershell
npm run install:deckboard
```

配置後にDeckboardを再起動

## Deckboard設定

| 設定 | 初期値 | 用途 |
|---|---|---|
| Data URL | `http://127.0.0.1:8085/data.json` | LibreHardwareMonitorのJSONエンドポイント |
| Username | 空 | HTTP Basic認証のユーザー名 |
| Password | 空 | HTTP Basic認証のパスワード |
| Polling interval | `5`秒 | センサー更新間隔。1～300秒 |
| Request timeout | `3000`ミリ秒 | HTTPタイムアウト。500～30000ミリ秒 |

`127.0.0.1:8085`のような値も指定可能。自動的に
`http://127.0.0.1:8085/data.json`へ補完

Deckboardが拡張機能設定のパスワードを平文で保存する可能性あり。ローカル環境のみ
で利用する場合、LibreHardwareMonitor側の認証を無効にした構成が簡易。8085番
ポートのインターネット公開は非推奨

## センサーブロックの追加

Deckboard接続後、ボタンへ次のいずれかを設定

- **Display Load Stats**
- **Display Temperature Stats**
- **Display Any Sensor**

最初のHTTPまたはWMI取得成功後にセンサー候補を表示

## バージョン1からの移行

拡張機能パッケージ名`libre-hardware-monitor`、Load・TemperatureアクションID、
`lhw-<Identifier>`形式のセンサーキーを維持

既存`.asar`の置換後も既存ボタン設定を利用可能。Deckboardに古いハードウェアIDが
キャッシュされている場合のみセンサーを再選択

## トラブルシューティング

### センサー候補が空

- LibreHardwareMonitorの起動確認
- **Remote Web Server > Run**の有効化確認
- `http://127.0.0.1:8085/data.json`の表示確認
- 1回以上のポーリング間隔待機後、Deckboardのボタン編集画面を再表示
- 拡張機能ファイル変更後のLibreHardwareMonitorとDeckboardの再起動

### HTTP 401

LibreHardwareMonitorの認証無効化、または拡張機能設定への同一ユーザー名・
パスワード設定

### 接続拒否またはタイムアウト

設定したIPアドレスとポートの確認。LibreHardwareMonitorが特定のネットワーク
インターフェースへバインドされている場合は`127.0.0.1`ではなく対象アドレスを指定

### HTTPとWMIの両方で取得失敗

- 現行版: Remote Web Serverの有効化と`data.json`への接続確認
- 旧版: `root\\LibreHardwareMonitor` WMI名前空間の存在確認
- Deckboardログに出力されるHTTPエラーとWMIエラーの確認

### センサーに現在値がない

一時的に利用できないセンサーの`null`または`NaN`は、有限数値になるまで反映対象外

## ライセンス

MIT。元の著作権・ライセンス表記とメンテナンス版の著作権表記を維持

LibreHardwareMonitorはMPL-2.0。LibreHardwareMonitorのソースコードやバイナリは
本拡張機能へ同梱せず、HTTPまたはWMIの出力のみを利用。詳細は
`THIRD_PARTY_NOTICES.txt`を参照

本プロジェクトとDeckboard・LibreHardwareMonitor各メンテナーとの公式な提携・承認なし
