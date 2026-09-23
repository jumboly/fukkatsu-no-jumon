import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { initialGameState, type GameState } from '../core/gameState';
import { decodeCodes, encode, parsePassword, type PipelineSnapshot } from '../core/pipeline';
import { nameFromString } from '../core/tables';
import { diffSnapshots, relate } from '../core/trace';
import { CheckExplorer } from './CheckExplorer';
import { CopyLinkButton } from './CopyLinkButton';
import { DerivedPanel, Inspector, Overview, PasswordPanel, PatternsPanel } from './Panels';
import { Pipeline } from './Pipeline';
import { formatHash, parseHash, sameRoute, type Route, type View } from './route';
import { TraceContext, type TraceUi } from './trace-context';

const DEFAULT_STATE: GameState = {
  ...initialGameState(),
  name: nameFromString('ゆうしゃ'),
  exp: 1200, gold: 350, weapon: 3, armor: 2, shield: 1,
  items: [1, 3, 0, 0, 0, 0, 0, 0], herbs: 3, keys: 1,
};

/** docs/research.md §8 の既知の呪文 */
const SAMPLES: { label: string; password: string }[] = [
  { label: 'ふるいけや…（Lv10）', password: 'ふるいけやかわずとびこむみずのおとばしや' },
  { label: 'くわたやま…（Lv17）', password: 'くわたやまくらしのずかなかはたはらくろま' },
  { label: 'ほりいゆうじ…', password: 'ほりいゆうじえにつくすどらごくえすとだよ' },
  { label: 'まるかつは…', password: 'まるかつはやつはりせかいいちだつたのだよ' },
  { label: 'おけすちな…（名前 0000）', password: 'おけすちなのへむゆるがごぜづびあおけすち' },
  { label: 'どくのば…（道具 ID 15 で拒否）', password: 'どくのばうぼぞそこけばがきもびはめつごび' },
];

/**
 * メイン画面から pushState で Explorer に入った履歴に付ける目印。
 * この目印がある履歴だけは「1 つ前 = 同じ呪文のメイン画面」と保証できるので、戻るボタンで history.back() してよい。
 * 直接 #/check を開いた・アドレスバーで書き換えた場合に back() すると、別の呪文やサイト外へ戻ってしまう。
 */
const FROM_MAIN = { fromMain: true } as const;
const isFromMain = (st: unknown) => typeof st === 'object' && st !== null && (st as { fromMain?: unknown }).fromMain === true;

/** URL の呪文が壊れていたら黙って既定状態で開く（共有リンクの一部欠けで真っ白にしないため） */
function snapshotFromRoute(r: Route): PipelineSnapshot | null {
  if (!r.password) return null;
  const parsed = parsePassword(r.password);
  return parsed.ok ? decodeCodes(parsed.codes) : null;
}

const initialRoute = parseHash(window.location.hash);

export function App() {
  const [snap, setSnap] = useState<PipelineSnapshot>(() => snapshotFromRoute(initialRoute) ?? encode(DEFAULT_STATE));
  const [prev, setPrev] = useState<PipelineSnapshot | null>(null);
  const [diffVersion, setDiffVersion] = useState(0);
  const [showDiff, setShowDiff] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialRoute.view);
  const scrollY = useRef(0);
  const password = snap.chars.join('');

  /**
   * edit: 値を 1 つ変えた。変化した経路を見せるために直前の状態を残す。
   * load: サンプル・貼り付け・初期化・URL で状態を丸ごと差し替えた。ほぼ全ノードが「変更」になって意味が無いので差分を捨てる。
   */
  const commit = useCallback((next: PipelineSnapshot, kind: 'edit' | 'load' = 'edit') => {
    setPrev(kind === 'edit' ? snap : null);
    setSnap(next);
    setDiffVersion((v) => v + 1);
  }, [snap]);

  const onStateChange = useCallback((s: GameState) => commit(encode(s)), [commit]);
  const onChar = useCallback((n: number, code: number) => {
    const enc = [...snap.enc6];
    enc[n] = code;
    commit(decodeCodes(enc));
  }, [snap, commit]);
  const onText = useCallback((text: string) => {
    const r = parsePassword(text);
    if (!r.ok) return r.error;
    commit(decodeCodes(r.codes), 'load');
    return null;
  }, [commit]);

  const focus = hover ?? selected;
  const relation = useMemo(() => (focus ? relate(focus) : null), [focus]);
  const diff = useMemo(() => diffSnapshots(prev, snap), [prev, snap]);

  const trace: TraceUi = useMemo(() => ({
    focus, selected, relation, diff, showDiff, diffVersion,
    setHover,
    toggleSelect: (id: string) => setSelected((s) => (s === id ? null : id)),
  }), [focus, selected, relation, diff, showDiff, diffVersion]);

  // 呪文の編集は履歴を増やさず URL だけ追従させる（1 文字ごとに「戻る」が必要になるのを避ける）
  useEffect(() => {
    const want: Route = { view, password };
    // 目印（history.state）を消さないよう、今の state を引き継いで URL だけ差し替える
    if (!sameRoute(parseHash(window.location.hash), want)) window.history.replaceState(window.history.state, '', formatHash(want));
  }, [view, password]);

  // ブラウザの戻る/進む・アドレスバーでの hash 書き換えに追従する
  const latest = useRef({ password, commit, view });
  latest.current = { password, commit, view };
  useEffect(() => {
    const onPop = () => {
      const r = parseHash(window.location.hash);
      const cur = latest.current;
      if (cur.view === 'main' && r.view === 'explorer') scrollY.current = window.scrollY;
      setView(r.view);
      if (r.password && r.password !== cur.password) {
        const next = snapshotFromRoute(r);
        if (next) cur.commit(next, 'load');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openExplorer = useCallback(() => {
    scrollY.current = window.scrollY;
    window.history.pushState(FROM_MAIN, '', formatHash({ view: 'explorer', password }));
    setView('explorer');
  }, [password]);
  const closeExplorer = useCallback(() => {
    if (isFromMain(window.history.state)) {
      // pushState した履歴を消費して戻る。こうしないと「戻る」で Explorer に再入してしまう
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', formatHash({ view: 'main', password }));
    setView('main');
  }, [password]);

  // Explorer から戻ったときに元のスクロール位置へ戻す（選択状態や GameState は App が保持しているので残る）
  useLayoutEffect(() => {
    if (view === 'main') window.scrollTo(0, scrollY.current);
    else window.scrollTo(0, 0);
  }, [view]);

  if (view === 'explorer') {
    return (
      <TraceContext.Provider value={trace}>
        <CheckExplorer snapshot={snap} onBack={closeExplorer} />
      </TraceContext.Provider>
    );
  }

  const changedCount = [...diff.nodes].filter((n) => n.startsWith('char:')).length;

  return (
    <TraceContext.Provider value={trace}>
      <div className="app">
        <header className="app-head">
          <h1 className="app-title">DQ1 ふっかつのじゅもん ビューア</h1>
          <p className="app-lead">
            ゲーム状態 → bit → 15byte へのパッキング → チェックコード → 6bit 化 → スクランブル → 20 文字。
            縦がゲーム上の意味、横が生成工程。項目を指すと経路が光り、クリックで固定。
          </p>
        </header>

        <div className="top-grid">
          <PasswordPanel snapshot={snap} onChar={onChar} onText={onText} />
          <DerivedPanel snapshot={snap} />
          <section className="panel controls" aria-label="操作">
            <label className="control">
              サンプル
              <select
                className="select"
                value=""
                onChange={(e) => { if (e.target.value) onText(e.target.value); }}
              >
                <option value="">既知の呪文を読み込む…</option>
                {SAMPLES.map((s) => <option key={s.password} value={s.password}>{s.label}</option>)}
              </select>
            </label>
            <button type="button" className="button" onClick={() => commit(encode(DEFAULT_STATE), 'load')}>初期状態に戻す</button>
            <label className="control checkbox">
              <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
              直前の編集で変わった経路を表示
            </label>
            <div className="muted small">
              {prev ? `直前の編集で呪文 ${changedCount} / 20 文字が変化` : '編集すると変化した経路が強調されます'}
            </div>
            <button type="button" className="button" onClick={openExplorer}>
              チェックコード計算を 1 step ずつ見る
            </button>
            <CopyLinkButton label="この呪文の URL をコピー" />
            <PatternsPanel snapshot={snap} onPattern={(p) => onStateChange({ ...snap.state, pattern: p })} />
          </section>
        </div>

        <Overview snapshot={snap} />

        <Pipeline
          snapshot={snap}
          onStateChange={onStateChange}
          onOpenExplorer={openExplorer}
        />

        <footer className="app-foot muted small">
          仕様の根拠と資料間の差異は docs/research.md を参照。参照実装 taotao54321/dq1-password（GPL-3.0）はテストオラクルとしてのみ使用し、コードは含みません。
          『ドラゴンクエスト』は株式会社スクウェア・エニックスの登録商標です。本ツールは非公式の学習用資料です。
        </footer>
        <Inspector snapshot={snap} />
      </div>
    </TraceContext.Provider>
  );
}
