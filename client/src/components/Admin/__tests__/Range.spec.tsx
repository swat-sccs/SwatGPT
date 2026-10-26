import { act, renderHook } from '@testing-library/react';
import { useRange } from '../Range';

const T0 = Date.parse('2026-10-05T12:00:20.000Z');

describe('useRange', () => {
  it('refetches in place when retried within the same minute', () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    const refetch = jest.fn();
    const { result } = renderHook(() => useRange('24h'));
    const before = result.current.range;

    act(() => result.current.retry(refetch));

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current.range).toBe(before);
  });

  it('moves the range end forward instead of refetching a stale window', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(T0);
    const refetch = jest.fn();
    const { result } = renderHook(() => useRange('24h'));
    expect(result.current.range.to).toBe('2026-10-05T12:00:00.000Z');

    now.mockReturnValue(T0 + 90 * 60 * 1000);
    act(() => result.current.retry(refetch));

    expect(refetch).not.toHaveBeenCalled();
    expect(result.current.range.to).toBe('2026-10-05T13:30:00.000Z');
  });

  it('rolls the window forward when the active preset is chosen again', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(T0);
    const { result } = renderHook(() => useRange('7d'));

    now.mockReturnValue(T0 + 5 * 60 * 1000);
    act(() => result.current.setPreset('7d'));

    expect(result.current.range).toEqual({
      from: '2026-09-28T00:00:00.000Z',
      to: '2026-10-05T12:05:00.000Z',
    });
    expect(result.current.bucket).toBe('day');
  });
});
