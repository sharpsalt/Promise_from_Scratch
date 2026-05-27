import { describe, it, expect } from 'vitest'
import { MyPromise } from '../src/MyPromise'

// ─── Helper ───────────────────────────────────────────────────────────────────
// Creates a promise that resolves after `ms` milliseconds.
// Used to test ordering and timing behaviour.
const delay = <T>(ms: number, value: T) =>
  new MyPromise<T>((res) => setTimeout(() => res(value), ms))

const delayReject = (ms: number, reason: any) =>
  new MyPromise((_, rej) => setTimeout(() => rej(reason), ms))

// ─── Promise.resolve ──────────────────────────────────────────────────────────
describe('MyPromise.resolve', () => {
  it('wraps a plain value', async () => {
    await expect(MyPromise.resolve(42)).resolves.toBe(42)
  })

  it('returns the same instance if already a MyPromise', () => {
    const p = new MyPromise<number>((res) => res(1))
    expect(MyPromise.resolve(p)).toBe(p)
  })

  it('adopts state of a thenable', async () => {
    const thenable = { then: (res: any) => res(99) }
    await expect(MyPromise.resolve(thenable)).resolves.toBe(99)
  })
})

// ─── Promise.reject ───────────────────────────────────────────────────────────
describe('MyPromise.reject', () => {
  it('creates a rejected promise', async () => {
    const err = new Error('nope')
    await expect(MyPromise.reject(err)).rejects.toBe(err)
  })

  it('does not unwrap thenables — always rejects', async () => {
    const thenable = { then: (res: any) => res(42) }
    await expect(MyPromise.reject(thenable)).rejects.toBe(thenable)
  })
})

// ─── Promise.withResolvers ────────────────────────────────────────────────────
describe('MyPromise.withResolvers', () => {
  it('exposes resolve outside the executor', async () => {
    const { promise, resolve } = MyPromise.withResolvers<number>()
    setTimeout(() => resolve(7), 10)
    await expect(promise).resolves.toBe(7)
  })

  it('exposes reject outside the executor', async () => {
    const { promise, reject } = MyPromise.withResolvers<number>()
    setTimeout(() => reject(new Error('external')), 10)
    await expect(promise).rejects.toThrow('external')
  })
})

// ─── Promise.all ─────────────────────────────────────────────────────────────
describe('MyPromise.all', () => {
  it('resolves when all resolve', async () => {
    const result = await MyPromise.all([
      MyPromise.resolve(1),
      MyPromise.resolve(2),
      MyPromise.resolve(3),
    ])
    expect(result).toEqual([1, 2, 3])
  })

  it('preserves INPUT order, not arrival order', async () => {
    // p1 takes longer but should still be at index 0
    const result = await MyPromise.all([
      delay(30, 'slow'),
      delay(10, 'fast'),
    ])
    expect(result).toEqual(['slow', 'fast'])
  })

  it('rejects immediately on first rejection', async () => {
    const err = new Error('one failed')
    await expect(
      MyPromise.all([
        MyPromise.resolve(1),
        MyPromise.reject(err),
        MyPromise.resolve(3),
      ])
    ).rejects.toBe(err)
  })

  it('resolves with [] for empty array', async () => {
    await expect(MyPromise.all([])).resolves.toEqual([])
  })

  it('handles plain values mixed with promises', async () => {
    const result = await MyPromise.all([1, MyPromise.resolve(2), 3])
    expect(result).toEqual([1, 2, 3])
  })
})

// ─── Promise.allSettled ───────────────────────────────────────────────────────
describe('MyPromise.allSettled', () => {
  it('resolves with status objects for all', async () => {
    const err = new Error('oops')
    const result = await MyPromise.allSettled([
      MyPromise.resolve(1),
      MyPromise.reject(err),
      MyPromise.resolve(3),
    ])
    expect(result).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: err },
      { status: 'fulfilled', value: 3 },
    ])
  })

  it('never rejects itself, even if all fail', async () => {
    // Should resolve (not reject) with an array of rejected results
    await expect(
      MyPromise.allSettled([
        MyPromise.reject('a'),
        MyPromise.reject('b'),
      ])
    ).resolves.toEqual([
      { status: 'rejected', reason: 'a' },
      { status: 'rejected', reason: 'b' },
    ])
  })

  it('resolves with [] for empty array', async () => {
    await expect(MyPromise.allSettled([])).resolves.toEqual([])
  })
})

// ─── Promise.race ─────────────────────────────────────────────────────────────
describe('MyPromise.race', () => {
  it('resolves with the first fulfilled value', async () => {
    const result = await MyPromise.race([
      delay(30, 'slow'),
      delay(10, 'fast'),
    ])
    expect(result).toBe('fast')
  })

  it('rejects if the first to settle is a rejection', async () => {
    await expect(
      MyPromise.race([
        delayReject(10, new Error('fast fail')),
        delay(30, 'slow success'),
      ])
    ).rejects.toThrow('fast fail')
  })

  it('stays pending forever for empty array', async () => {
    // We can't await this — it never settles.
    // Just verify it doesn't throw synchronously.
    const p = MyPromise.race([])
    expect((p as any).state).toBe('pending')
  })
})

// ─── Promise.any ─────────────────────────────────────────────────────────────
describe('MyPromise.any', () => {
  it('resolves with the first fulfilled value', async () => {
    const result = await MyPromise.any([
      delayReject(10, 'fast fail'),
      delay(20, 'slow success'),
    ])
    expect(result).toBe('slow success')
  })

  it('ignores rejections as long as one succeeds', async () => {
    const result = await MyPromise.any([
      MyPromise.reject('a'),
      MyPromise.reject('b'),
      MyPromise.resolve('winner'),
    ])
    expect(result).toBe('winner')
  })

  it('rejects with AggregateError when ALL reject', async () => {
    const err = await MyPromise.any([
      MyPromise.reject('x'),
      MyPromise.reject('y'),
    ]).catch((e) => e)

    expect(err).toBeInstanceOf(AggregateError)
    expect(err.errors).toEqual(['x', 'y'])
  })

  it('rejects immediately with AggregateError for empty array', async () => {
    const err = await MyPromise.any([]).catch((e) => e)
    expect(err).toBeInstanceOf(AggregateError)
    expect(err.errors).toEqual([])
  })
})
