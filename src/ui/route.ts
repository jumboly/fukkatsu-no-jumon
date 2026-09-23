// URL（hash）と画面状態の対応。GitHub Pages は静的配信でサーバー側のルーティングが無いので hash 方式にする。
// 形式: #/?p=<呪文20文字> がメイン、#/check?p=<呪文> がチェックコード Explorer。
// 呪文と 15byte は 1 対 1 なので、GameState ではなく呪文だけを載せれば状態を完全に再現できる。

export type View = 'main' | 'explorer';

export interface Route {
  view: View;
  /** 未検証の呪文文字列。妥当性は呼び出し側で parsePassword にかける */
  password: string | null;
}

const PATHS: Readonly<Record<View, string>> = { main: '/', explorer: '/check' };

export function parseHash(hash: string): Route {
  const body = hash.replace(/^#/, '');
  const q = body.indexOf('?');
  const path = q < 0 ? body : body.slice(0, q);
  const params = new URLSearchParams(q < 0 ? '' : body.slice(q + 1));
  return {
    view: path === PATHS.explorer ? 'explorer' : 'main',
    password: params.get('p'),
  };
}

export function formatHash(r: Route): string {
  // URLSearchParams はかなを %XX に符号化する。共有時に他のツールで壊れないよう、読みやすさより安全側を取る
  const q = r.password ? `?${new URLSearchParams({ p: r.password })}` : '';
  return `#${PATHS[r.view]}${q}`;
}

export function sameRoute(a: Route, b: Route): boolean {
  return a.view === b.view && a.password === b.password;
}
