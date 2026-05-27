import { describe, it, expect, vi } from 'vitest'
import { MyPromise } from '../src/MyPromise'

describe('.then()', () => {
  it('receives fulfilled value', async () => {
    const result = await new MyPromise<number>((res) => res(42))
      .then((v) => v * 2)
    expect(result).toBe(84)
  })

  it('runs AFTER current call stack (async)', async () => {
    const order: string[] = []
    const p = new MyPromise<number>((res) => res(1))
    p.then(() => order.push('then'))
    order.push('sync')
    await p
    expect(order).toEqual(['sync', 'then'])
  })

  it('chains multiple .then() calls', async () => {
    const result = await new MyPromise<number>((res) => res(1))
      .then((v) => v + 1)   // 2
      .then((v) => v * 10)  // 20
      .then((v) => v - 5)   // 15
    expect(result).toBe(15)
  })

  it('passes value through when no onFulfilled given', async () => {
    const result = await new MyPromise<number>((res) => res(42))
      .then(null)
      .then((v) => v)
    expect(result).toBe(42)
  })

  it('passes reason through when no onRejected given', async () => {
    const err = new Error('fail')
    await expect(
      new MyPromise((_, rej) => rej(err))
        .then((v) => v) // no onRejected — should pass error through
    ).rejects.toBe(err)
  })

  it('flattens returned promise (thenable resolution)', async () => {
    const result = await new MyPromise<number>((res) => res(1))
      .then(() => new MyPromise<string>((res) => res('hello')))
    // Should be 'hello', not MyPromise<'hello'>
    expect(result).toBe('hello')
  })

  it('rejects next promise if handler throws', async () => {
    await expect(
      new MyPromise<number>((res) => res(1))
        .then(() => { throw new Error('handler blew up') })
    ).rejects.toThrow('handler blew up')
  })

  it('.then() on already-settled promise still runs async', async () => {
    const order: string[] = []
    const p = new MyPromise<number>((res) => res(42))
    // p is already fulfilled here
    p.then(() => order.push('then'))
    order.push('sync')
    await p
    expect(order).toEqual(['sync', 'then'])
  })
})

describe('.catch()', () => {
  it('catches rejections', async () => {
    const result = await new MyPromise((_, rej) => rej(new Error('oops')))
      .catch((e) => (e as Error).message)
    expect(result).toBe('oops')
  })

  it('recovers — next .then() gets the recovered value', async () => {
    const result = await new MyPromise((_, rej) => rej('bad'))
      .catch(() => 'recovered')
      .then((v) => v + '!')
    expect(result).toBe('recovered!')
  })

  it('skips .then() handlers when rejected', async () => {
    const fn = vi.fn()
    await new MyPromise((_, rej) => rej('err'))
      .then(fn)   // should NOT run
      .catch(() => 'caught')
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('.finally()', () => {
  it('runs on fulfillment', async () => {
    const fn = vi.fn()
    await new MyPromise<number>((res) => res(42)).finally(fn)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('runs on rejection', async () => {
    const fn = vi.fn()
    await new MyPromise((_, rej) => rej('err')).finally(fn).catch(() => {})
    expect(fn).toHaveBeenCalledOnce()
  })

  it('passes fulfilled value through', async () => {
    const result = await new MyPromise<number>((res) => res(42))
      .finally(() => {})
    expect(result).toBe(42)
  })

  it('passes rejection reason through', async () => {
    const err = new Error('reason')
    await expect(
      new MyPromise((_, rej) => rej(err)).finally(() => {})
    ).rejects.toBe(err)
  })

  it('waits for a returned promise before continuing', async () => {
    const order: string[] = []
    await new MyPromise<number>((res) => res(1))
      .finally(() =>
        new MyPromise<void>((res) =>
          setTimeout(() => { order.push('finally done'); res() }, 10)
        )
      )
      .then(() => order.push('then'))
    expect(order).toEqual(['finally done', 'then'])
  })

  it('replaces value with thrown error', async () => {
    await expect(
      new MyPromise<number>((res) => res(42))
        .finally(() => { throw new Error('finally threw') })
    ).rejects.toThrow('finally threw')
  })
})
