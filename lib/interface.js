'use strict';
import {EventEmitter, once} from "events";

import { get_args } from "./args.js";

/**
 * @type {import("./interface.d.ts").default}
 */
export default class Interface extends EventEmitter{
  #d;
  name;
  id;
  events;
  requests;
  enums;

  constructor(d, id, {name, requests, events, enums}){
    super();
    this.#d = d;
    this.id = id;
    this.name = name;
    //FIXME: make this non enumerable to have a more compact util.inspect() output?
    this.events = events;
    this.requests = requests;
    this.enums = enums;
    for (let [opcode, op] of requests.entries()){
      const first_arg = op.args[0];
      if(first_arg?.type == "new_id" && first_arg.interface == "wl_callback"){
        //Make a special case for wl_callback
        this[op.name] = async (...args)=>{
          let wl_callback =  this.#d.createInterface(first_arg.interface);
          await this.#d.request(this.id, opcode, op, wl_callback.id, ...args);
          await once(wl_callback, "done");
          this.#d.deleteId(wl_callback.id);
        }
      }else if(first_arg?.type == "new_id"){
        //Another special case for interface creation : first argument is a new_id that should be allocated on the spot
        this[op.name] = async (...args)=>{
          //console.log("Open new interface: "+first_arg.interface);
          let itf =  this.#d.createInterface(first_arg.interface);
          try{
            await this.#d.request(this.id, opcode, op, itf.id, ...args);
          }catch(e){
            //Only throws for bad arguments, protocol errors are asynchronous.
            this.#d.deleteId(itf.id);
            throw new Error(`${this.name}.${op.name}(${op.args.map(({name})=>name).join(", ")}) failed: ${e.message}`);
          }
          return itf;
        }
      }else{
        this[op.name] = this.#d.request.bind(this.#d, this.id, opcode, op);
      }
    }
  }

  emitError(e){
    if(this.listenerCount("error") ==0){
      return this.#d.emit("error", e);
    }else{
      return this.emit("error", e);
    }
  }

  emit(evcode, b){
    const event = this.events[evcode];
    if(!event) return this.emitError(new Error(`No event with index ${evcode} in interface ${this.name}`));
    try{
      const values = get_args(b, event.args);
      if(event.args[0]?.type == "new_id"){
        //Special case for events that reports server-created objects
        if(values.length != 1){
          console.warn(`Might be missing a special case on ${this.name}#${event.name} : ${values.length} arguments received, expected 1`);
        }
        const [id] = values;
        let itf = this.#d.registerInterface(id, event.args[0].interface);
        return super.emit(event.name, itf);
      }else{
        return super.emit(event.name, ...values);
      }
    }catch(e){
      return this.emitError(e);
    }
  }

  /**
   * Get an operation's index (opcode)
   * using the request's name
   * Throws if an invalid name is provided
   */
  opcode(rName){
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
  aggregate(){
    let infos = {id: this.id};
    const cancellations = [];
    for (let {name} of this.events){
      let listener = (...args)=>{
        infos[name] ??= [];
        if(args[0] instanceof Interface){
          const end = args[0].aggregate();
          cancellations.push(()=>{
            infos[name].push(end());
          });
        }else if(args.length ==1){
          infos[name].push(args[0]);
        }else if(args.length == 0){
          infos[name].push(true);
        }else{
          infos[name].push(args);
        }
      }
      this.on(name, listener);
      cancellations.push(()=>this.off(name, listener));
    }
    return function end_drain(){
      cancellations.forEach((c)=>c());
      for(let key in infos){
        if(infos[key].length == 1) infos[key] = infos[key][0];
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