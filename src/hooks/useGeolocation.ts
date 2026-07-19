import { useEffect, useState } from 'react';
import type { LatLng } from '../types';

export interface GeoState {
  /** 現在地。未取得なら null。 */
  position: LatLng | null;
  /** 位置精度(メートル)。 */
  accuracyM: number | null;
  /** エラーメッセージ(権限拒否・取得不可など)。 */
  error: string | null;
  /** この端末/ブラウザが位置情報に対応しているか。 */
  supported: boolean;
}

/**
 * 現在地を継続取得するフック。enabled が true の間だけ watchPosition する。
 * 歩行中の現在地表示に使う。
 */
export function useGeolocation(enabled: boolean): GeoState {
  const supported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracyM: null,
    error: null,
    supported,
  });

  useEffect(() => {
    if (!enabled || !supported) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyM: pos.coords.accuracy,
          error: null,
          supported: true,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '位置情報の利用が許可されていません。ブラウザの設定で許可してください。'
            : '現在地を取得できませんでした。';
        setState((s) => ({ ...s, error: msg }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, supported]);

  return state;
}
