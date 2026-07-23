/**
 * 永続ストレージを要求する。
 * これにより、ブラウザ(特に iOS Safari)が保存データ(履歴・場所)を
 * 自動削除しにくくなる。対応していない環境では単に無視される。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      !navigator.storage.persist
    ) {
      return false;
    }
    // すでに永続化済みなら再要求しない。
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
