// 配合(繁殖)。親馬の能力・血統を仔に引き継ぐ。
//
// 進行(暦)や DB アクセスはここでは扱わない。純粋な生成ロジックのみ。

import type { Coat, Horse, HorseParams, HorseSex } from '../types';
import { COAT_LABELS } from '../types';
import { createHorse, GROWTH_TYPES, pick, RUNNING_STYLES, TEMPERAMENTS } from './horse';

const ALL_COATS = Object.keys(COAT_LABELS) as Coat[];

function inheritEnum<T>(sireVal: T, damVal: T, pool: readonly T[]): T {
  const r = Math.random();
  if (r < 0.4) return sireVal;
  if (r < 0.8) return damVal;
  return pick(pool);
}

// 芦毛(グレー)は片親由来でも出やすい実際の遺伝則に寄せる。
function inheritCoat(sireCoat: Coat, damCoat: Coat): Coat {
  if ((sireCoat === 'ashi' || damCoat === 'ashi') && Math.random() < 0.5) {
    return 'ashi';
  }
  return inheritEnum(sireCoat, damCoat, ALL_COATS);
}

// 親の能力の一部を「血統の伸びしろ」として仔に引き継ぐ。
// 親の到達値をそのまま渡すと配合するほど際限なく強くなるため、割合は控えめにしてある。
const BLOODLINE_FRACTION = 0.18;

function foalParams(sire: Horse, dam: Horse, inbredMult: number): HorseParams {
  const keys = ['speed', 'stamina', 'power', 'guts', 'wisdom'] as const;
  const result = {} as HorseParams;
  for (const k of keys) {
    const inherited =
      ((sire.params[k] + dam.params[k]) / 2) * BLOODLINE_FRACTION * inbredMult;
    result[k] = 8 + inherited * (0.85 + Math.random() * 0.3);
  }
  return result;
}

/**
 * 2頭を配合して仔馬を作る。inbred は3世代以内に共通の祖先を持つかどうかで、
 * 呼び出し元(db層)が血統をたどって判定する。
 */
export function createFoal(
  name: string,
  sex: HorseSex,
  sire: Horse,
  dam: Horse,
  inbred: boolean,
): Horse {
  const inbredMult = inbred ? 1.15 : 1.0;
  let temperament = inheritEnum(sire.temperament, dam.temperament, TEMPERAMENTS);
  // 近親配合は能力の伸びしろが出る代わり、気性が難しくなりやすい。
  if (inbred && Math.random() < 0.35) {
    temperament = Math.random() < 0.5 ? 'difficult' : 'fierce';
  }

  return {
    ...createHorse(name, sex),
    coat: inheritCoat(sire.coat, dam.coat),
    temperament,
    runningStyle: inheritEnum(sire.runningStyle, dam.runningStyle, RUNNING_STYLES),
    growthType: inheritEnum(sire.growthType, dam.growthType, GROWTH_TYPES),
    params: foalParams(sire, dam, inbredMult),
    origin: 'bred',
    sireId: sire.id,
    damId: dam.id,
    inbredAtBirth: inbred,
  };
}

const INTRO_NAMES = [
  'トオリマチ',
  'ホソミチノヒカリ',
  'ユウグレザカ',
  'ミズウミノウタ',
  'アカツキノカゼ',
  'シラカバナミキ',
  'カワベノシズク',
  'ミドリノコウエン',
  'アサギリロード',
  'ハツヒノオオドオリ',
  'シズカナコミチ',
  'ヨアケノサカミチ',
  'カゼノトオリミチ',
  'ツキカゲノミチ',
  'ハルサキノオカ',
  'フユゾラノホシ',
];

/**
 * 血統表の穴埋め用に、すでに引退した状態の祖先を自動生成する。
 * キャリアは持たず、配合相手としては選べない(血統表示にのみ使う)。
 */
export function createIntroAncestor(sex: HorseSex): Horse {
  return {
    ...createHorse(pick(INTRO_NAMES), sex),
    status: 'retired',
    growthRevealed: true,
    origin: 'intro',
  };
}
