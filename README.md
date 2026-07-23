# 散歩道決定アプリ Sanpo 🚶

バイト先⇔自宅間などで、**直近10回のルートと重複しすぎず**・**選んだ気分に合い**・**設定時間内で歩き切れる**散歩ルートを提案する、完全クライアントサイドの Web PWA です。

- **個人利用ツール**(マルチユーザー非対応)
- **バックエンドなし**(静的ホスティングで完結)
- **オフライン非対応**(利用時は常時ネット接続が前提。Service Worker はアプリシェルのキャッシュのみに使用)

## 主な機能

- スタート/ゴールを地図タップで毎回自由指定
- 気分フィルターを複数選択(明るい道 / 大通り / 暗い道 / 住宅街 / 人の少ない道)
- 所要時間の上限を指定 → 登録した歩行ペースで距離に換算
- 被り率 n%(デフォルト30%、10〜50%で調整可)以下の候補を **最大3件** 生成・比較
- **場所登録**(自宅・バイト先など)→ ホームからワンタップでスタート/ゴール指定・入れ替え
- 歩行中の**現在地(GPS)表示**・「現在地へ」ボタン・**現在地をスタートに設定**
- **曲がり角の道順**(ルート形状から自動生成)と**横断歩道**(OSM)の地図表示
- 「このルートを歩いた」で記録 → 直近10件を FIFO 保存
- 履歴一覧 / 設定(歩行ペース・被り率デフォルト)画面
- 永続ストレージ要求(`navigator.storage.persist()`)＋**バックアップ書き出し/読み込み**
  (履歴・場所・設定を JSON でエクスポート/復元)でデータ消失に備える

## 技術構成

| 用途 | 採用 |
|---|---|
| フレームワーク | React + TypeScript + Vite |
| 地図表示 | Leaflet.js + OpenStreetMap タイル(react-leaflet) |
| 道路属性データ | Overpass API(取得結果は IndexedDB に24hキャッシュ) |
| 補助ルート探索 | OpenRouteService API(`foot-walking`。API キーは任意) |
| グラフ探索(本体) | `ngraph.graph` + `ngraph.path`(気分・被り率を反映した重み付き A*) |
| ローカル DB | Dexie.js(IndexedDB) |
| PWA 化 | vite-plugin-pwa |

## コアアルゴリズム

### ルート候補生成(反復ペナルティ法)

`src/core/routing.ts` を参照。

1. 気分フィルターに合致するエッジの重みを軽減(`×0.55`)、履歴で使用済みの way に弱いペナルティ(`×2.0`)を掛けた重み付きグラフで A* 探索 → 候補1
2. 候補1が使った way の重みを大きく増加(`×3`)させて再探索 → 候補2
3. 同様に候補3まで生成
4. 各候補を「所要時間 ≤ 上限」「被り率 ≤ 閾値」でフィルタ
5. 条件を満たす候補が無ければ被り率の閾値を **+10 ポイントずつ緩和**し、緩和した旨を UI に明示

> A* のヒューリスティックは、気分割引で重みが素の距離を下回りうるため、下限係数(`×0.55`)を掛けて許容的(admissible)に保っています。

### 被り率(重複率)

`src/core/overlap.ts` を参照。

```
被り率(%) = (候補が通る way 長のうち、直近10ルートの使用済み way 集合と重複する長さの合計)
          ÷ 候補の総距離 × 100
```

### 気分フィルター判定(OSM タグ)

`src/core/mood.ts` を参照。

| 気分 | 判定条件 |
|---|---|
| 明るい道 | `lit=yes`、**または近くに街灯(`highway=street_lamp`)がある** |
| 暗い道 | `lit=no`、または(`lit` 未指定 **かつ 近くに街灯が無い**) |
| 大通り | `highway` ∈ {primary, secondary, trunk} |
| 住宅街 | `landuse=residential` 内 かつ `highway` ∈ {residential, living_street} |
| 人の少ない道 | `highway` ∈ {footway, path, pedestrian} |
| 緑の多い道 | 公園・緑地・並木(`leisure`/`landuse`/`natural`)のそば |
| 水辺の道 | 河川・水域(`waterway`/`natural=water`)のそば |
| 舗装路 | `surface` が舗装系、または未指定でも舗装が多い `highway` 種別 |
| 歩道あり | `sidewalk=yes/both/…`、または歩行者専用路 / `foot=designated` |
| 細い道 | `service=alley`、`living_street`/`service`/`track`/`steps`、幅員 ≤ 3.5m など |

**精度改善:** 「明るい/暗い」は `lit` タグが未整備の地域が多いため、街灯ノード
(`highway=street_lamp`)の位置を併用して判定します。これにより `lit` が無くても街灯が
地図にあれば「明るい」と判定でき、「暗い道」の過検出も抑えられます。

`landuse=residential` や公園などの内外判定はレイキャスティング(点in多角形)、
街灯・水辺などの「近さ」判定はグリッド索引(`src/core/spatial.ts`)で高速化しています。

### 歩行ナビ(現在地・道順・横断歩道)

- **現在地表示**: `useGeolocation`(`navigator.geolocation.watchPosition`)でルート詳細画面に
  現在地の青い点と精度円を表示。「現在地へ」ボタンで地図を自分の位置へ戻せる。
  ホーム画面では「現在地をスタートにする」で出発点を現在地に設定できる。
- **道順(曲がり角)**: `src/core/navigation.ts` で、ルートのジオメトリの方位角変化から
  曲がり角(左折/右折/斜め/鋭角)を検出し、「◯m進んで右折」の手順リストと地図マーカーを生成。
- **横断歩道**: Overpass で `highway=crossing` / `crossing=*` ノードを取得し、
  ルートが通過する横断歩道を地図に 🚸 で表示・件数を集計。

> GPS はブラウザの位置情報許可が必要です。位置情報・道路データはいずれもオンライン取得です。

## セットアップ

```bash
npm install
npm run dev        # 開発サーバ
npm run build      # 本番ビルド(tsc -b && vite build)
npm run preview    # ビルド結果のプレビュー
npm run typecheck  # 型チェックのみ
```

初回起動時は歩行ペース(分/km)の登録が必須です。

### OpenRouteService(任意)

補助的な代替ルート取得を使う場合のみ、`.env.example` を参考に `.env` を作成し API キーを設定します。未設定でもアプリは自前グラフ探索で動作します。

### GitHub Pages などサブパス配信

サブパス配信する場合はベースパスを指定してビルドします。

```bash
BASE_PATH=/Sanpo/ npm run build
```

## ディレクトリ構成

```
src/
├─ api/            Overpass / OpenRouteService クライアント
├─ core/           ジオ計算・グラフ構築・気分判定・被り率・ルート探索
├─ components/     地図コンポーネント(Leaflet)
├─ db/             Dexie(IndexedDB)スキーマと操作
├─ hooks/          設定購読フック
├─ screens/        ホーム / 候補 / 詳細 / 履歴 / 場所 / 設定
├─ types/          共有型定義
├─ App.tsx         画面遷移とナビゲーション
└─ main.tsx        エントリポイント
```

## プライバシー

自宅・バイト先などの座標はすべてローカル(IndexedDB)に保存され、外部送信は Overpass / ORS への検索クエリ(座標)のみに限定しています。
