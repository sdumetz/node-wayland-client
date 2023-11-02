'use strict';
import {EventEmitter, once} from "events";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';


import { writeUInt, readUInt, format_args, get_args } from "./args.js";

import Interface from "./interface.js";
import { parseInterface } from "./parse.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(thisDir, "../dist");

export default class Display extends EventEmitter{
  //Keep track of last assigned ID to help speed up ID generation
  #last_id = 1;
  #interfaces = new Map();
  #globals = new Map();
  #objects = new Map();
  #s;

  constructor(s){
    super();
    this.#s = s;
    this.#s.on("data", this.onData);
    this.#s.on("close", ()=>{
      console.log("Connection closed");
    });
    this.#s.on("error", this.emit.bind(this, "error"));
  }

  nextId(){
    while(this.#objects.has(++this.#last_id)){
      //FIXME handle max client ID 0xfeffffff
    }
    return this.#last_id;
  }

  get wl_display(){
    return this.#objects.get(1);
  }

  get wl_registry(){
    return this.#objects.get(2);
  }

  onData = (d)=>{
    while(d.length){
      let id = readUInt(d, 0);
      let length = (readUInt(d, 4)>>16);
      let opcode = (readUInt(d, 4) &0xFFFF);
      const msg = d.slice(8, length);
      this.onMessage(id, opcode, msg);
      d = d.slice(length);
    }
  }

  onMessage(id, evcode, msg){
    const target = this.#objects.get(id);
    if(!target) return this.emit("warning", "No interface with id "+id);
    const event = target.events[evcode];
    if(!event) return this.emit("warning", `interface ${target.name} has no event with index ${evcode}`);
    //FIXME: parse msg into arguments
    target.emit(evcode, msg);
  }

  async init(){
    await this.load("wayland");
    /**
     * Patch wl_registry.bind to match special case :
     * It's first argument is split into 3.
     */
    this.#interfaces.get("wl_registry").requests[0].args = [
      {
        "name": "id",
        "type": "uint",
        "summary": "unique numeric name of the object"
      },
      {
        "name": "interface",
        "type": "string",
        "summary": "interface name of object"
      },
      {
        "name": "version",
        "type": "uint",
        "summary": "interface version of the object"
      },
      {
        "name": "id",
        "type": "new_id",
        "summary": "bound object ID"
      }
    ];
    //*/
    //Special case for wl_display that is allocated on connection.
    const wl_display = this.registerInterface(1, "wl_display");
    
    wl_display.on("error", (srcId, errno, msg)=>{
      let src = this.#objects.get(srcId);
      let srcErrors = src?.enums["error"];
      if(srcErrors){
        let err = srcErrors[errno];
        console.warn("FATAL ERROR in %s (%s): %s", src.name,  err.name, err.summary, msg);
      }else{
        console.warn("FATAL ERROR in %s: %s (undefiend error)",src.name, errno, msg);
      }
    });

    const wl_registry = await wl_display.get_registry();
    wl_registry.on("global", (id, iName, version)=>{
      this.#globals.set(iName, id); //Globals are stored here because their definition might not be loaded yet.
    });
    /** 
     * @FIXME handle "global_remove"
     */
    const cb = await wl_display.sync();
    //await once(this.#s, "data");

    return wl_registry;
  }

  /**
   * Load a protocol definition
   */
  async load(file){
    let interfaces = await (async ()=>{
      if(/\.xml$/i.test(file)){
        const {xml2js} = await import("xml-js");
        const xml = await fs.readFile(file, {encoding: "utf-8"});
        /**@type {import("xml-js").ElementCompact}*/
        const {protocol:{interface: interfaces}} = xml2js(xml, {compact: true});
        return interfaces.map(parseInterface);
      }else{
        if(!/\.json$/i.test(file)) file = path.join(outDir, file+".json");
        return JSON.parse(await fs.readFile(file, {encoding: "utf-8"}));
      }
    })();
    
    for (let itf of interfaces){
      this.#interfaces.set(itf.name, itf);
    }
  }

  /**
   * Binds an interface. see wl_registry.bind in wayland.xml
   * @returns {Promise<Interface>}
   */
  async bind(iname, version){
    const def = this.getDefinition(iname);
    const gid = this.#globals.get(iname);
    if(!gid) throw new Error("No global named "+iname);
    if(typeof version !== "undefined" && version != def.version){
      console.warn(`Version mismatch: user requests ${iname} v${version}, but v${def.version} is defined`);
    }
    const itf = this.createInterface(iname);
    //console.log(`Bind globals#${iname}(${gid}) to id: ${itf.id}`);
    await this.wl_registry.bind(gid, def.name, def.version, itf.id);
    //FIXME : wait for wl_display.sync() while catching errors to handle protocol errors here instead of in Display.error
    // This is not very high priority because protocol errors are fatal anyways
    return  itf;
  }


  createInterface(name){
    let id = this.nextId();
    return this.registerInterface(id, name);
  }

  registerInterface(id, name){
    const def = typeof name ==="string"?this.#interfaces.get(name): name;
    let itf = new Interface(this, id, def);
    this.#objects.set(id, itf);
    return itf;
  }

  deleteId(id){
    this.#objects.delete(id);
    //FIXME recalculate next ID to densely pack IDs

  }

  /**
   * 
   * @param {string} iName 
   * @returns {Interface|undefined}
   */
  getObject(iName){
    for(let obj of this.#objects.values()){
      if(obj.name == iName) return obj;
    }
    return undefined;
  }

  /**
   * Iterate over all registered objects
   */
  *objects(){
    for(let obj of this.#objects.values()){
      yield obj;
    }
  }

  getDefinition(name){
    let iFace = this.#interfaces.get(name);
    if(!iFace) throw new Error("No interface definition for "+name);
    return iFace;
  }

  getEnum(name){
    let [iName, eName] = name.split(".");
    let def = this.getDefinition(iName);
    let e = def.enums[eName];
    return e.reduce((acc, v)=>{acc[v.name] = v.value; return acc;}, {});
  }


  async write(b){
    const flushed = this.#s.write(b);
    if(!flushed) await once(this.#s, "drain");
  }

  /**
   * 
   * @param {*} srcId 
   * @param {*} opcode 
   * @param {import("./definitions.d.ts").RequestDefinition} def 
   * @param  {...any} args 
   */
  async request(srcId, opcode, def, ...args){
    const b1 = Buffer.alloc(8);
    const b2 = format_args(args, def.args);
    console.log("Request: ", srcId, opcode, args, b2.length);
    writeUInt(b1, srcId, 0);
    //16 most significant bits are the message length. 16 next bits are the message opcode
    writeUInt(b1, (b1.length + b2.length) << 16 | opcode & 0xFFFF, 4);
    await this.write(Buffer.concat([b1, b2]));
  }

  async sync(){
    return await this.wl_display.sync();
  }


  close(){
    this.#s.close();
  }

}
