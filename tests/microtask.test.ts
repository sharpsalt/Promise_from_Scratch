import { describe, it, expect } from 'vitest'
import { MyPromise } from '../src/MyPromise'

// These tests verify the most subtle and important property of Promises:
// WHEN exactly callbacks run relative to other code.
//
// The rules from the Promises/A+ spec:
//   - onFulfilled and onRejected are called asynchronously
//   - They go on the MICROTASK queue (not macrotask)
//   - Microtasks run AFTER the current call stack but BEFORE setTimeout/setInterval

describe('microtask ordering', () => {
  it('then() callbacks run after synchronous code', async () => {
    const order: string[] = []

    const p = new MyPromise<void>((res) => res())
    p.then(() => order.push('microtask'))
    order.push('sync')

    await p
    expect(order).toEqual(['sync', 'microtask'])
  })

  it('microtasks run before setTimeout (macrotask)', async () => {
    const order: string[] = []

    await new MyPromise<void>((res) => {
      setTimeout(() => order.push('macrotask'), 0)
      MyPromise.resolve().then(() => order.push('microtask'))
      res()
    })

    // Give setTimeout a chance to fire
    await new MyPromise<void>((res) => setTimeout(res, 10))

    expect(order).toEqual(['microtask', 'macrotask'])
  })

  it('chained .then() handlers run in order, all as microtasks', async () => {
    const order: string[] = []

    await new MyPromise<void>((res) => res())
      .then(() => order.push('first'))
      .then(() => order.push('second'))
      .then(() => order.push('third'))

    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('already-settled promise still defers .then() callback', async () => {
    const order: string[] = []
    const p = MyPromise.resolve(42)  // already settled

    // Even though p is already fulfilled, the callback must NOT run right now
    p.then(() => order.push('then'))
    order.push('after .then() call')

    await p
    expect(order).toEqual(['after .then() call', 'then'])
  })

  it('multiple .then() on same promise all get called', async () => {
    const results: number[] = []
    const p = MyPromise.resolve(7)

    p.then((v) => results.push(v * 1))
    p.then((v) => results.push(v * 2))
    p.then((v) => results.push(v * 3))

    await MyPromise.all([p, p, p])
    expect(results).toEqual([7, 14, 21])
  })

  it('rejection propagates through .then() until .catch()', async () => {
    const order: string[] = []
    const err = new Error('fail')

    await new MyPromise((_, rej) => rej(err))
      .then(() => order.push('then1'))   // skipped
      .then(() => order.push('then2'))   // skipped
      .catch(() => order.push('catch'))  // runs
      .then(() => order.push('then3'))   // runs (after recovery)

    expect(order).toEqual(['catch', 'then3'])
  })
})
