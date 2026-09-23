import { formatHash, parseHash } from '../src/ui/route';

const PW = 'ふるいけやかわずとびこむみずのおとばしや';

describe('hash route', () => {
  it('空の hash はメイン画面・呪文なし', () => {
    expect(parseHash('')).toEqual({ view: 'main', password: null });
    expect(parseHash('#/')).toEqual({ view: 'main', password: null });
  });

  it('#/check は Explorer', () => {
    expect(parseHash('#/check').view).toBe('explorer');
  });

  it('format → parse で往復できる（かなは符号化される）', () => {
    for (const view of ['main', 'explorer'] as const) {
      const h = formatHash({ view, password: PW });
      expect(h).not.toMatch(/[ぁ-ん]/u);
      expect(parseHash(h)).toEqual({ view, password: PW });
    }
  });

  it('ブラウザが符号化しない生のかなでも読める（手で URL を打った場合）', () => {
    expect(parseHash(`#/check?p=${PW}`)).toEqual({ view: 'explorer', password: PW });
  });

  it('未知のパスはメイン扱い', () => {
    expect(parseHash('#/foo?p=x').view).toBe('main');
  });
});
