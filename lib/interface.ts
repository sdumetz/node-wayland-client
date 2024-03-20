'use strict';
import {EventEmitter, once} from "node:events";

import { get_args } from "./args.js";
import Display from "./display.js";
import { EventDefinition, RequestDefinition, EnumDefinition, InterfaceDefinition, isInterfaceArgument, isCallbackArgument as isCallbackArgument } from "./definitions.js";



interface AggregateResult{
  [e :string]: number|string|boolean|AggregateResult|number[]|string[]|AggregateResult[];
}

interface InterfaceAdapter{
  [r:string]:(...args :any[])=>Promise<Interface>;
}

declare function isAdapter(itf:unknown): asserts itf is InterfaceAdapter;


export default class Interface extends EventEmitter{
  #d: Display;
  /** Interface name */
  name: string;
  /** Interface version number */
  version: number;
  id: number;
  public readonly events: EventDefinition[];
  public readonly requests: RequestDefinition[];
  public readonly enums: Record<string, EnumDefinition>;



  constructor(d:Display, id :number, {name, version, requests, events, enums}  :InterfaceDefinition){
    super();
    this.#d = d;
    this.id = id;
    this.name = name;
    this.version = version
    //FIXME: make this non enumerable to have a more compact util.inspect() output?
    this.events = events;
    this.requests = requests;
    this.enums = enums;
    isAdapter(this);
    for (let [opcode, op] of requests.entries()){
      const first_arg = op.args[0];
      if(isCallbackArgument(first_arg)){
        //Make a special case for wl_callback
        (this as any)[op.name] = async (...args :any[])=>{
          let wl_callback =  this.#d.createInterface(first_arg.interface);
          await this.#d.request(this.id, opcode, op, wl_callback.id, ...args);
          await once(wl_callback, "done");
          this.#d.deleteId(wl_callback.id);
        }
      }else if(isInterfaceArgument(first_arg)){
        //Another special case for interface creation : first argument is a new_id that should be allocated on the spot
        (this as any)[op.name] = async (...args :any[])=>{
          //console.log("Open new interface: "+first_arg.interface);
          let itf =  this.#d.createInterface(first_arg.interface);
          try{
            await this.#d.request(this.id, opcode, op, itf.id, ...args);
          }catch(e:any){
            //Only throws for bad arguments, protocol errors are asynchronous.
            this.#d.deleteId(itf.id);
            throw new Error(`${this.name}.${op.name}(${op.args.map(({name})=>name).join(", ")}) failed: ${e.message}`);
          }
          return itf;
        }
      }else{
        (this as any)[op.name] = this.#d.request.bind(this.#d, this.id, opcode, op);
      }
    }
  }

  emitError(e:Error|any){
    if(this.listenerCount("error") ==0){
      return this.#d.emit("error", e);
    }else{
      return this.emit("error", e);
    }
  }

  /**
   * Parse an event's message before emitting it
   * @param evcode event index
   * @param b message body
   */
  public push(evcode :number, b :Buffer) :boolean {
    const event = this.events[evcode];
    if(!event) return this.emitError(new Error(`No event with index ${evcode} in interface ${this.name}`));
    try{
      const values = get_args(b, event.args);
      if(isInterfaceArgument(event.args[0])){
        if(values.length != 1){
          // We might be missing a case where a new interface is returned with additional arguments.
          // No example of such a thing was found in the base protocol files
          console.warn("Found an interface creation event that had more than one argument. This is unexpected.")
        }
        const [id] = values;
        let itf = this.#d.registerInterface(id, event.args[0].interface);
        return this.emit(event.name, itf);
      }else{
        return this.emit(event.name, ...values);
      }
    }catch(e:any){
      return this.emitError(e);
    }
  }

  /**
   * Get an operation's index (opcode)
   * using the request's name
   * Throws if an invalid name is provided
   */
  opcode(rName :RequestDefinition["name"]){
    const opcode = this.requests.findIndex(r=>r.name == rName);
    if(opcode == -1) throw new Error(`no operation named ${rName} in interface ${this.name}`);
    return opcode
  }

  toString(){
    return `${this.name}(${this.events.map(e=>e.name).join(", ")})`;
  }

  inspect(){
    return this.toString()+(this.requests.length? "\n" :"")
      +this.requests.map(r=>`  ${r.name}(${r.args.map(a=>`${a.name} :${a.type}`).join(", ")})`).join("\n");
  }

  /**
   * @FIXME might be more efficient to listen only once instead of attaching a listener for each event.
   *        However performance should be tested before assuming anything.
   */
  aggregate() :()=>AggregateResult{
    let infos :AggregateResult = {id: this.id};
    const cancellations:(()=>void)[] = [];
    for (let {name} of this.events){
      let listener = (...args: any[])=>{
        const res = (infos[name] ??= []) as any[];
        if(args[0] instanceof Interface){
          const end = args[0].aggregate();
          cancellations.push(()=>{
            res.push(end());
          });
        }else if(args.length ==1){
          res.push(args[0]);
        }else if(args.length == 0){
          res.push(true);
        }else{
          res.push(args);
        }
      }
      this.on(name, listener);
      cancellations.push(()=>this.off(name, listener));
    }
    return function end_drain(){
      cancellations.forEach((c)=>c());
      for(let key in infos){
        if((infos[key] as any).length == 1) infos[key] = (infos[key] as any)[0];
      }
      return infos;
    };
  }

  async drain(){
    const end_drain = this.aggregate();
    await this.#d.sync();
    return end_drain();
  };
}