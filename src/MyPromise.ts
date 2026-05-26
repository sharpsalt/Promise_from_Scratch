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

    
}



