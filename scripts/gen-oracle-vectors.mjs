#!/usr/bin/env node
// 参照実装 taotao54321/dq1-password (GPL-3.0) をテストオラクルとして実行し、入出力データだけを保存する。
// ライセンス上コードは取り込まず、.oracle/ に clone してビルドした実行ファイルを外部プロセスとして呼ぶ。
//
//   npm run oracle:vectors   （要: git, cargo, ネットワーク）

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ORACLE_DIR = join(ROOT, '.oracle', 'dq1-password');
const ORACLE_REPO = 'https://github.com/taotao54321/dq1-password.git';
// 生成結果の再現性のため、検証に使ったコミットを固定する
const ORACLE_COMMIT = 'e4d6d68e5f111883395f41be17c8109c9012b78a';
const OUT = join(ROOT, 'tests', 'fixtures', 'oracle-vectors.json');

// オラクルの名前文字（6bit コード順）。本実装の NAME_CHAR_TABLE とは表示字形が異なる（'-' と ' '）ので独立に持つ
const ORACLE_NAME_CHARS = Array.from(
  '0123456789あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんっゃゅょ゛゜- ',
);
const PASSWORD_CHARS = Array.from(
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだぢづでどばびぶべぼ',
);

function setupOracle() {
  if (!existsSync(ORACLE_DIR)) {
    execFileSync('git', ['clone', '--quiet', ORACLE_REPO, ORACLE_DIR], { stdio: 'inherit' });
  }
  execFileSync('git', ['-C', ORACLE_DIR, 'checkout', '--quiet', ORACLE_COMMIT], { stdio: 'inherit' });
  execFileSync('cargo', ['build', '--quiet', '--release', '--examples'], { cwd: ORACLE_DIR, stdio: 'inherit' });
  return {
    encodeBin: join(ORACLE_DIR, 'target', 'release', 'examples', 'encode'),
    decodeBin: join(ORACLE_DIR, 'target', 'release', 'examples', 'decode'),
  };
}

// 決定的な乱数（fixture を再生成しても同じ内容になるように）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xd01);
const ri = (n) => Math.floor(rand() * n);

function randomState() {
  return {
    name: Array.from({ length: 4 }, () => ri(64)),
    exp: ri(65536), gold: ri(65536),
    weapon: ri(8), armor: ri(8), shield: ri(4),
    items: Array.from({ length: 8 }, () => ri(15)),
    herbs: ri(7), keys: ri(7),
    dragonScale: rand() < 0.5, warriorRing: rand() < 0.5, deathNecklace: rand() < 0.5,
    golem: rand() < 0.5, dragon: rand() < 0.5,
    pattern: ri(8),
  };
}

function boundaryStates() {
  const zero = {
    name: [63, 63, 63, 63], exp: 0, gold: 0, weapon: 0, armor: 0, shield: 0, items: [0, 0, 0, 0, 0, 0, 0, 0],
    herbs: 0, keys: 0, dragonScale: false, warriorRing: false, deathNecklace: false, golem: false, dragon: false, pattern: 0,
  };
  const max = {
    name: [62, 61, 60, 59], exp: 65535, gold: 65535, weapon: 7, armor: 7, shield: 3, items: [14, 14, 14, 14, 14, 14, 14, 14],
    herbs: 6, keys: 6, dragonScale: true, warriorRing: true, deathNecklace: true, golem: true, dragon: true, pattern: 7,
  };
  const out = [zero, max];
  for (let p = 0; p < 8; p++) out.push({ ...zero, pattern: p }, { ...max, pattern: p });
  for (const k of ['dragonScale', 'warriorRing', 'deathNecklace', 'golem', 'dragon']) out.push({ ...zero, [k]: true });
  for (const v of [1, 255, 256, 0x1234, 0xff00]) out.push({ ...zero, exp: v }, { ...zero, gold: v });
  for (let i = 0; i < 8; i++) {
    const items = [...zero.items];
    items[i] = 14;
    out.push({ ...zero, items });
  }
  for (let c = 0; c < 64; c++) out.push({ ...zero, name: [c, c, c, c] });
  return out;
}

function toOracleJson(s) {
  return {
    hero_name: s.name.map((c) => ORACLE_NAME_CHARS[c]).join(''),
    hero_xp: s.exp, purse: s.gold,
    hero_weapon: s.weapon, hero_armor: s.armor, hero_shield: s.shield,
    herb_count: s.herbs, key_count: s.keys, inventory: s.items,
    flag_equip_dragon_scale: s.dragonScale, flag_equip_warrior_ring: s.warriorRing,
    flag_got_death_necklace: s.deathNecklace, flag_beated_golem: s.golem, flag_beated_dragon: s.dragon,
    salt: s.pattern,
  };
}

function fromOracleJson(j) {
  const name = Array.from(j.hero_name).map((c) => {
    const i = ORACLE_NAME_CHARS.indexOf(c);
    if (i < 0) throw new Error(`unknown oracle name char ${c}`);
    return i;
  });
  return {
    name, exp: j.hero_xp, gold: j.purse, weapon: j.hero_weapon, armor: j.hero_armor, shield: j.hero_shield,
    items: j.inventory, herbs: j.herb_count, keys: j.key_count,
    dragonScale: j.flag_equip_dragon_scale, warriorRing: j.flag_equip_warrior_ring,
    deathNecklace: j.flag_got_death_necklace, golem: j.flag_beated_golem, dragon: j.flag_beated_dragon,
    pattern: j.salt,
  };
}

function main() {
  const { encodeBin, decodeBin } = setupOracle();
  const tmp = mkdtempSync(join(tmpdir(), 'dq1-oracle-'));
  try {
    const states = [...boundaryStates(), ...Array.from({ length: 400 }, randomState)];
    const encodeVectors = states.map((state, i) => {
      const path = join(tmp, `s${i}.json`);
      writeFileSync(path, JSON.stringify(toOracleJson(state)));
      const password = execFileSync(encodeBin, [path], { encoding: 'utf8' }).trim();
      return { state, password };
    });

    // decode: ランダム呪文（大半は check 不一致）＋有効な呪文を 1 文字だけ変えたもの
    const passwords = [
      // docs/research.md §8 の既知呪文と、check は正しいが道具 ID 15 を含む呪文
      'ふるいけやかわずとびこむみずのおとばしや', 'くわたやまくらしのずかなかはたはらくろま',
      'おけすちなのへむゆるがごぜづびあおけすち', 'してらぐじださのへへわげずぢばぼえみれぎ',
      'ほりいゆうじえにつくすどらごくえすとだよ', 'まるかつはやつはりせかいいちだつたのだよ',
      'どくのばうぼぞそこけばがきもびはめつごび',
    ];
    passwords.push(...Array.from({ length: 300 }, () => Array.from({ length: 20 }, () => PASSWORD_CHARS[ri(64)]).join('')));
    for (const { password } of encodeVectors.slice(0, 200)) {
      const cs = Array.from(password);
      cs[ri(20)] = PASSWORD_CHARS[ri(64)];
      passwords.push(cs.join(''));
    }
    const decodeVectors = passwords.map((password) => {
      const r = spawnSync(decodeBin, [password], { encoding: 'utf8' });
      if (r.status === 0) return { password, result: 'ok', state: fromOracleJson(JSON.parse(r.stdout)) };
      if (r.stderr.includes('CRC')) return { password, result: 'crc-mismatch' };
      if (r.stderr.includes('ゲーム状態が無効')) return { password, result: 'invalid-state' };
      throw new Error(`unexpected oracle output for ${password}: ${r.stderr}`);
    });

    writeFileSync(OUT, JSON.stringify({
      _comment: `Generated by scripts/gen-oracle-vectors.mjs from ${ORACLE_REPO}@${ORACLE_COMMIT}. Data only.`,
      encode: encodeVectors,
      decode: decodeVectors,
    }, null, 1) + '\n');
    const count = (r) => decodeVectors.filter((v) => v.result === r).length;
    console.log(`encode: ${encodeVectors.length}, decode: ${decodeVectors.length} (ok ${count('ok')}, crc ${count('crc-mismatch')}, state ${count('invalid-state')})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
