import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Settings } from '../types';

/**
 * 設定を購読する。読込中は undefined、未登録(初回起動)は null を返す。
 */
export function useSettings(): Settings | null | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get('user');
    return s ?? null;
  }, []);
}
