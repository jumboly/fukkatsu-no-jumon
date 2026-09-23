# DQ1 ふっかつのじゅもん ビューア

FC版『ドラゴンクエスト』の「復活の呪文」が、ゲーム状態から

**ゲーム状態 → 論理 bit → 15byte へのパッキング → チェックコード → 20×6bit → スクランブル → 20 文字**

と生成される過程を、配線図としてインタラクティブに追跡する学習用ビューアです。

- 縦方向 = ゲーム上の意味、横方向 = 生成工程
- 項目を hover / クリックすると、その値が通る経路だけが光る（呪文の文字から逆方向にも辿れる）
- 値を編集すると全工程を再計算し、実際に値が変わった経路を赤で示す
- チェックコード計算は Explorer で 112 ステップを 1 つずつ追える
- URL に呪文と画面が入る（`#/?p=<呪文>`、Explorer は `#/check?p=<呪文>`）。そのまま共有でき、ブラウザの戻る/進むも効く
- 名前から決まる成長タイプ・能力値（呪文には保存されない導出値）も表示

## 開発

```sh
npm install
npm run dev        # 開発サーバ
npm test           # テスト（vitest）
npm run test:e2e   # UI の E2E（Playwright。初回は npx playwright install chromium）
npm run build      # dist/ に静的ファイルを出力（相対パスなので任意のサブパスに置ける）
```

main ブランチへ push すると `.github/workflows/deploy.yml` がテスト → ビルド → E2E → GitHub Pages 公開を行います
（リポジトリの Settings → Pages → Source を「GitHub Actions」にしておく）。

## 構成

| パス | 内容 |
|---|---|
| `docs/TODO.md` | 残作業（仕様の未確定点・未実装・品質） |
| `docs/research.md` | **調査結果（仕様の根拠）**。bit 配置・文字表・チェックコード・導出ステータスの根拠と、資料間の食い違い |
| `src/core/` | UI から独立した変換パイプライン（encode / decode / チェックコード / TraceGraph）。bit 配置は `layout.ts` の `FIELD_LAYOUT` だけが定義し、他はすべてそこから導く |
| `src/ui/` | React による可視化。bit 演算や依存関係の推測は持たず、core の結果と TraceGraph を表示するだけ |
| `tests/` | layout / checkcode / password（既知呪文・オラクル比較・round trip・境界値）/ trace / 名前と成長 |
| `e2e/` | ビルド済みの UI に対する Playwright テスト（経路の強調・編集・decode・Explorer 往復・レスポンシブ） |
| `scripts/gen-oracle-vectors.mjs` | 参照実装からテストベクターを生成 |

### bit 順の約束

- byte 内の bit は **bit0 = LSB**。画面では **左が bit7 (MSB)**。
- stream bit `k = 8 × byte + bit`。6bit 化は k の小さい順（実機の `ror` と同じ）。`raw6[n]` の bit j = stream bit `6n + j`。
- pattern 3bit の番号付け（p0 = byte5.bit0, p1 = byte2.bit7, p2 = byte7.bit7）はゲームに存在しない本実装の約束。

## 参考資料とライセンス上の扱い

- NESdev forum "Dragon Quest (J) passwords reverse-engineering"（実機逆アセンブル）
- [taotao54321/dq1-password](https://github.com/taotao54321/dq1-password)（GPL-3.0）… **テストオラクルとしてのみ使用**。
  `npm run oracle:vectors` は `.oracle/` に clone・ビルドした実行ファイルを外部プロセスとして呼び、入出力データだけを
  `tests/fixtures/oracle-vectors.json` に保存します。コードは本リポジトリに含みません。
- その他の解析・攻略資料は `docs/research.md` §0 を参照。

『ドラゴンクエスト』は株式会社スクウェア・エニックスの登録商標です。本ツールは非公式の学習用資料です。
