import {type State,type Handler,type Executor,type PromiseLike} from './types';

export class MyPromise<T>{
    //private fields
    //these three represents the full internal state of a promise
    private state:State='pending';

    //value is set when fulfilled , until then it is undefiened
    private value:T | undefined=undefined

    //reason is set when reject,until then it is undefined
    private reason:T | undefined=undefined

    //The callback Queue
    /**
     * While state is 'pending',every .then() call pushes a handler here 
     * The mement resolve() or reject() is called, we flush the entire list 
     * after flushing, new .then() calls are dispatched immediately (not queued)
     */
    private handlers:Handler<T>[]=[]

    //Constructor
    constructor(executor:Executor<T>){
        //we bind resolve and reject so they can be passed around freely 
        //without lsoing their 'this' context
        const resolve=this.resolve.bind(this)
        const reject=this.reject.bind(this)

        //Run the executor synchornously 
        /**
         * Th executor runs rght now,inline, if it calls resolve(42), by the time the constructor returns 
         * this promise is already fulfilled
         * 
         * 
         * wrap krenge ise try/catch me : if thr executor throws synchronously,
         * we treat that as a rejection
         * 
         */
        try{
            executor(resolve,reject)
        }catch(e){
            reject(e)
        }
    }

    //resolve
    //called when the async work suceeds
    //private because only the executor via th e bound function should call it 
    private resolve(value:T|PromiseLike<T>):void{
        //Guard:once settled,ignore all further calls
        //this is what makes promises "resolved at most once"
        if(this.state!=='pending')return

        /**
         * Special case: what if someone does resolve(anotherPromise)?
         * we don't immediately fulfill-we  'adopt' the other promis's fate
         * if anotherPromise resolves with the 42 later,we resolve with 42
         * if it rejects,we rejects with the same reason
         * 
         */
        if(isThenable<T>(value)){
            value.then(this.resolve.bind(this),this.reject.bind(this))
            return
        }

        //Normal case: plain value,settle now 
        this.state='fulfilled'
        this.value=value
        this.flush()
    }

    //reject
    private reject(reason?:unknown):void{
        if(this.state!=='pending')return
        this.state='rejected'
        this.reason=reason
        this.flush()
    }

    //flush
    //called once after the promise ssttles
    //runs every ahndler that was queued up while we were pending
    private flush():void{
        for(const handler of this.handler){
            this.runHandler(handler)
        }

        //clear the qeueue.we're  done with it 
        //any future .then() calls will skip the queueu and go directly 
        //to runHandler (see .then() implementation)
        this.handlers=[]
    }

    /**
     * runHandler
     * It is the heart of the Promise machinery
     * 
     * why queueMicrTask and not just call the function directly?
     * The Promise/A+ spec requires that onFulfilled and onRejected
     * are called asynchornously
     * 
     * This makes Promise behaviour predictable:
     *    promise.then(fn)
     *    console.log('sync')
     * fn always runs AFTER 'sync', guaranteed,even if promise is 
     * already fulfilled when .then() is called
     * 
     * Microtsaks run AFTER the curren cal stack empties but BEFORE
     * any macrostasks (set Timeout,i/o callbacks,etc)
     */
    private runHandler(handler: Handler<T>):void{
        queueMicrotask(()=>{
            //By the time this runs,state is definitely fulfilled or rejected
            if(this.state==='fulfilled'){
                if(typeof handler.onFulfilled!=='function'){
                    handler.resolve(this.value)
                    return
                }
                try{
                    const x=handler.onFulfilled(this.value as T)
                    this.resolveWithX(x,handler.resolve,handler.reject)
                }catch(e){
                    handler.reject(e)
                }
            }else if(this.state==='rejected'){
                if(typeof handler.onRejected!=='function'){
                    handler.reject(this.reason)
                    return
                }
                try{
                    const x=handler.onRejected(this.reason)
                    this.resolveWithX(x,handler.resolve,handler.reject)
                }catch(e){
                    handler.reject(e)
                }
            }
        })
    }

    /**
     * resolveWithX
     * 
     * The "Promise Resolutiob Procedure" from the Promises called with whatever hanlder returned (x)
     * Decides how to settle the NEXT promise in the chain.
     */
    private resolveWithX(
        x:any,
        resolve:(value:any)=>void,
        reject:(reason:unknown)=>void
    ):void{
    // Rule 1: x cannot be the same promise we're about to resolve.
    // If it were, we'd wait on ourselves forever.
    // JavaScript's native Promise throws a TypeError for this.
    // We need to pass the next promise in to check — but we don't have it here.
    // This check is done in .then() instead (see the comment there).
 
    // Rule 2: if x is a thenable, adopt its state.
    // This handles:
    //   .then(() => fetch('/api'))           ← native Promise
    //   .then(() => new MyPromise(...))      ← our own promise
    //   .then(() => ({ then: (r) => r(42) })) ← custom thenable object
    if (isThenable(x)) {
      try {
        x.then(resolve, reject)
      } catch (e) {
        // If accessing .then throws, reject.
        reject(e)
      }
      return
    }
 
    // Rule 3: plain value → just resolve with it.
    resolve(x)
  }

    // ─── .then() ─────────────────────────────────────────────────────────────────
  // The core API method. Returns a NEW promise every time.
  // This is what makes chaining work.
  then<R = T>(
    onFulfilled?: ((value: T) => R | PromiseLike<R>) | null,
    onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null
  ): MyPromise<R> {
    // The new promise that THIS .then() call produces.
    // Its fate depends entirely on what onFulfilled/onRejected return.
    let nextResolve!: (value: any) => void
    let nextReject!: (reason: unknown) => void
 
    const nextPromise = new MyPromise<R>((res, rej) => {
      nextResolve = res
      nextReject = rej
    })
 
    // Build the handler for this .then() call.
    const handler: Handler<T> = {
      onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : undefined,
      onRejected: typeof onRejected === 'function' ? onRejected : undefined,
      resolve: nextResolve,
      reject: nextReject,
    }
 
    // TWO SCENARIOS:
    //
    // A) Promise is already settled when .then() is called.
    //    → Schedule the handler immediately via queueMicrotask.
    //    → We do NOT call it synchronously (see runHandler comments).
    //
    // B) Promise is still pending.
    //    → Store the handler in the queue.
    //    → It will be flushed when resolve() or reject() is called.
    if (this.state !== 'pending') {
      this.runHandler(handler)
    } else {
      this.handlers.push(handler)
    }
 
    // NOTE: circular check lives here conceptually.
    // If someone does: const p2 = p.then(() => p2)
    // When the handler runs, x === nextPromise.
    // resolveWithX would call p2.then(resolve, reject) which waits on p2 itself.
    // The native spec handles this by checking x === promise2 in resolveWithX.
    // To do it properly, you'd need to pass nextPromise into resolveWithX.
    // Challenge: try adding that check yourself.
 
    return nextPromise
  }
 
  // ─── .catch() ────────────────────────────────────────────────────────────────
  // Pure sugar. .catch(fn) is identical to .then(undefined, fn).
  // Nothing more, nothing less.
  catch<R = never>(
    onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null
  ): MyPromise<T | R> {
    return this.then<T | R>(undefined, onRejected)
  }
 
  // ─── .finally() ──────────────────────────────────────────────────────────────
  // Runs fn() regardless of outcome.
  // Key behaviours:
  //   1. fn() receives NO arguments (no value, no reason)
  //   2. Original value/reason passes THROUGH to the next handler
  //   3. If fn() returns a Promise, chain WAITS for it
  //   4. If fn() throws, that error replaces the original
  finally(fn: () => void | PromiseLike<void>): MyPromise<T> {
    return this.then(
      // Fulfilled branch: run fn, wait for it, then pass original value through
      (value) =>
        MyPromise.resolve(fn()).then(() => value) as MyPromise<T>,
 
      // Rejected branch: run fn, wait for it, then re-throw original reason
      (reason) =>
        MyPromise.resolve(fn()).then(() => {
          throw reason
        }) as MyPromise<T>
    ) as MyPromise<T>
  }
 
  // ─── Static: resolve ─────────────────────────────────────────────────────────
  // Creates an already-fulfilled promise.
  // If you pass in a MyPromise, returns it as-is (no wrapping).
  // If you pass in a thenable, adopts its state.
  // If you pass in a plain value, wraps it.
  static resolve<T>(value: T | PromiseLike<T>): MyPromise<T> {
    if (value instanceof MyPromise) return value
    return new MyPromise<T>((res) => res(value))
  }
 
  // ─── Static: reject ──────────────────────────────────────────────────────────
  // Creates an already-rejected promise.
  // No special cases — always wraps in a rejection.
  static reject<T = never>(reason?: unknown): MyPromise<T> {
    return new MyPromise<T>((_, rej) => rej(reason))
  }
 
  // ─── Static: withResolvers ───────────────────────────────────────────────────
  // Exposes resolve and reject OUTSIDE the executor.
  // Useful when you can't wrap your logic in the constructor —
  // e.g. you want to resolve from a button click handler.
  //
  // Usage:
  //   const { promise, resolve, reject } = MyPromise.withResolvers<string>()
  //   button.onclick = () => resolve('clicked')
  //   await promise
  static withResolvers<T>(): {
    promise: MyPromise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: unknown) => void
  } {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
 
    const promise = new MyPromise<T>((res, rej) => {
      // Capture res and rej before the executor returns.
      // By the time withResolvers() returns, these are set.
      resolve = res
      reject = rej
    })
 
    return { promise, resolve, reject }
  }
 
  // ─── Static: all ─────────────────────────────────────────────────────────────
  // Waits for ALL promises to fulfill.
  // If ANY rejects, immediately rejects (short-circuits).
  // Results array preserves INPUT ORDER, not arrival order.
  static all<T>(promises: (T | PromiseLike<T>)[]): MyPromise<T[]> {
    return new MyPromise<T[]>((resolve, reject) => {
      // Edge case: empty array resolves immediately with [].
      if (promises.length === 0) {
        resolve([])
        return
      }
 
      const results: T[] = new Array(promises.length)
      let fulfilledCount = 0
 
      promises.forEach((p, i) => {
        // Wrap every item with MyPromise.resolve() so plain values work too.
        // Promise.all([1, 2, fetch(url)]) should work, not just all-promises.
        MyPromise.resolve(p).then((value) => {
          // Store at INDEX i, not push.
          // push() would give arrival order. We want input order.
          results[i] = value
          fulfilledCount++
 
          if (fulfilledCount === promises.length) {
            resolve(results)
          }
        }, reject) // ← first rejection short-circuits everything
      })
    })
  }
 
  // ─── Static: allSettled ──────────────────────────────────────────────────────
  // Waits for ALL promises to settle (fulfill OR reject).
  // NEVER rejects itself — always resolves with an array of result objects.
  // Each object has { status: 'fulfilled', value } or { status: 'rejected', reason }.
  static allSettled<T>(
    promises: (T | PromiseLike<T>)[]
  ): MyPromise<({ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown })[]> {
    return new MyPromise((resolve) => {
      if (promises.length === 0) {
        resolve([])
        return
      }
 
      const results: ({ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown })[] =
        new Array(promises.length)
      let settledCount = 0
 
      promises.forEach((p, i) => {
        MyPromise.resolve(p).then(
          (value) => {
            results[i] = { status: 'fulfilled', value }
            settledCount++
            if (settledCount === promises.length) resolve(results)
          },
          (reason) => {
            results[i] = { status: 'rejected', reason }
            settledCount++
            if (settledCount === promises.length) resolve(results)
          }
        )
      })
    })
  }
 
  // ─── Static: race ────────────────────────────────────────────────────────────
  // First to SETTLE (fulfill OR reject) wins.
  // The state guard in resolve/reject ignores all subsequent settlements.
  //
  // Edge case: empty array → stays PENDING FOREVER.
  // This matches native Promise.race([]) behaviour. Don't change it.
  static race<T>(promises: (T | PromiseLike<T>)[]): MyPromise<T> {
    return new MyPromise<T>((resolve, reject) => {
      // No empty-array check here — empty means pending forever.
      promises.forEach((p) => {
        MyPromise.resolve(p).then(resolve, reject)
        // Because of the state guard in resolve/reject,
        // only the first call to resolve or reject does anything.
        // All subsequent ones are silently ignored.
      })
    })
  }
 
  // ─── Static: any ─────────────────────────────────────────────────────────────
  // First to SUCCEED (fulfill) wins.
  // Ignores rejections unless ALL promises reject.
  // If all reject → rejects with AggregateError containing all reasons.
  //
  // This is the inverse of Promise.all:
  //   .all → needs ALL to succeed, fails on first rejection
  //   .any → needs ONE to succeed, fails only if ALL reject
  static any<T>(promises: (T | PromiseLike<T>)[]): MyPromise<T> {
    return new MyPromise<T>((resolve, reject) => {
      // Edge case: empty array → reject immediately with empty AggregateError.
      if (promises.length === 0) {
        reject(new AggregateError([], 'All promises were rejected'))
        return
      }
 
      const errors: unknown[] = new Array(promises.length)
      let rejectedCount = 0
 
      promises.forEach((p, i) => {
        MyPromise.resolve(p).then(
          // First fulfillment wins — the state guard handles the rest.
          resolve,
          (reason) => {
            // Store at index to preserve order in the AggregateError.
            errors[i] = reason
            rejectedCount++
 
            if (rejectedCount === promises.length) {
              // Every single promise rejected.
              // AggregateError is a built-in that holds multiple errors.
              reject(new AggregateError(errors, 'All promises were rejected'))
            }
          }
        )
      })
    })
  }
}




function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as any).then === 'function')}


