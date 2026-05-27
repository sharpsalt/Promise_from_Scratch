import { describe, it, expect } from 'vitest'
import { MyPromise } from '../src/MyPromise'

describe('constructor', () => {
  it('starts in pending state', () => {
    const p = new MyPromise(() => {})
    expect((p as any).state).toBe('pending')
  })

  it('executor runs synchronously', () => {
    let ran = false
    new MyPromise(() => { ran = true })
    expect(ran).toBe(true) // must be true RIGHT NOW, not after await
  })

  it('rejects if executor throws synchronously', async () => {
    const p = new MyPromise(() => { throw new Error('boom') })
    await expect(p).rejects.toThrow('boom')
  })
})

describe('resolve', () => {
  it('transitions state to fulfilled', () => {
    const p = new MyPromise<number>((res) => res(42))
    expect((p as any).state).toBe('fulfilled')
    expect((p as any).value).toBe(42)
  })

  it('ignores second resolve call', () => {
    const p = new MyPromise<number>((res) => {
      res(1)
      res(2) // should be ignored
    })
    expect((p as any).value).toBe(1)
  })

  it('ignores reject after resolve', () => {
    const p = new MyPromise<number>((res, rej) => {
      res(1)
      rej(new Error('too late'))
    })
    expect((p as any).state).toBe('fulfilled')
  })

  it('adopts state of a resolved thenable', async () => {
    const inner = new MyPromise<number>((res) => res(99))
    const outer = new MyPromise<number>((res) => res(inner as any))
    await expect(outer).resolves.toBe(99)
  })
})

describe('reject', () => {
  it('transitions state to rejected', () => {
    const err = new Error('fail')
    const p = new MyPromise((_, rej) => rej(err))
    expect((p as any).state).toBe('rejected')
    expect((p as any).reason).toBe(err)
  })

  it('ignores second reject call', () => {
    const err1 = new Error('first')
    const err2 = new Error('second')
    const p = new MyPromise((_, rej) => {
      rej(err1)
      rej(err2)
    })
    expect((p as any).reason).toBe(err1)
  })
})
