//State type,Hanlder interface, all shared types

/**
 * State: 
 * A Promise can be only in one of tese 3 states
 * Transitions 
 * Pending -> fulfilled or Pending -> rejected
 * Assume like 3 node, and the parent node(Pending) has two directed egdes 
 * 
 * one to fulfilled and one to rejected, that means once it has performed the transitions then there is no going back
 */


export type State='pending'|'fulfilled'|'rejected'

/**
 * Handler: assume it as a fn that gets executed when the Promise is resolved,rejected,or completed
 * 
 * Handler is of 3 types:
 * 1) Then: Fulfillment handler
 * 2) Catch: Rejected handler
 * 3) Finally: Finally handler(mtlb ye humesha chalega hi chalega)
 * Every .then() creates one Handler and store it
 * when the promise settles, it flushes all stored handler
 * 
 * 
 * onFulfilled: the first argument you pass to .then(), mtlb promise resolve hone ke baad ye chalega(eg, promise.then(()=>{})
 * onRejected: the second argument you pass to .catch(), mtlb promise reject hone ke baad ye chalega(eg, promise.catch(()=>{})
 * resolve      → resolve function of the NEW promise .then() returned
 * reject       → reject function of the NEW promise .then() returned
 * 
 * ye resolve/reject promise is present during creating of promise and those onFulfilled handler, and onRejected handler is assumed to be consumer
 * 
 * 
 * assume during the creation of Promise as Producer side, and the other as a consumer side
 * 
 */

export interface Handler<T>{
    onFulfilled?:(value:T)=>any
    onRejected?:(reason:unknown)=>any
    resolve:(value:any)=>void
    reject:(reason:unknown)=>void
}

export type Executor<T>=(
    resolve:(value:T | PromiseLike<T>)=>void,
    reject:(reason?:unknown)=>void
)=>void

export interface PromiseLike<T>{
    then<R>( //then is a method inside interface 
        onFulfilled?:(value:T)=>R|PromiseLike<R>,
        onRejected?:(reason:unknown)=>R|PromiseLike<R>
    ):PromiseLike<R>//ye bataraha hai ki jab then function apna kaam krlega to wo return kya krega 
}
/**
 * when we do export interface {} ,then ye wala bracker directly use krlete hai 
 * but when we are exporting any type = then ye wala and iske baad as per your need use krte hai 
 */


/**
 * Promse.allSettled() resolve with an array of these
 * Every entry is Either fulfilled or rejected
 */
export type SettledResult<T>=
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }

























