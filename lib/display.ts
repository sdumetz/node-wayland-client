'use strict';
import {Socket} from "node:net";
import {EventEmitter, once} from "node:events";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';


import { Wl_display, Wl_registry } from "../protocol/wayland.js";

import { writeUInt, readUInt, format_args } from "./args.js";

import Interface from "./interface.js";
import { parseInterface } from "./parse.js";
import { EnumReduction, InterfaceDefinition, RequestDefinition, wl_object } from "./definitions.js";
import { ElementCompact } from "xml-js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(thisDir, "../protocol");


export default class Display extends EventEmitter{
  //Keep track of last assigned ID to help speed up ID generation
  #last_id = 1;
  #interfaces = new Map<string, InterfaceDefinition>();
  #globals = new Map<string, number>();
  #objects = new Map<wl_object, Interface>();
  #s :Socket;

  constructor(s :Socket){
    super();
    this.#s = s;
    this.#s.on("data", this.onData);
    this.#s.on("close", ()=>{
      console.log("Connection closed");
    });
    this.#s.on("error", this.emit.bind(this, "error"));
  }


  /**
   * Initializes a wl_display. Loads the core protocol and binds to wl_registry to fetch the server's globals.
   */
  async init() :Promise<Wl_registry>{
    await this.load("wayland");
    /**
     * Patch wl_registry.bind to match special case :
     * It's first argument is split into 3.
     */
    (this.#interfaces.get("wl_registry") as any as Interface).requests[0].args = [
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
    const wl_display = this.registerInterface<Wl_display> (1, "wl_display");
    
    wl_display.on("error", (srcId, errno, msg)=>{
      let src = this.#objects.get(srcId);
      if(!src){
        console.warn("FATAL ERROR in unknown interface: %s", errno, msg);
        return;
      }
      let srcErrors = src.enums["error"];
      if(srcErrors){
        let err = srcErrors[errno];
        console.warn("FATAL ERROR in %s (%s): %s", src.name,  err.name, err.summary, msg);
      }else{
        console.warn("FATAL ERROR in %s: %s (undefiend error)",src.name, errno, msg);
      }
    });

    // @ts-ignore
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
   * Return the first found available ID
   * @fixme wayland protocol specifies IDs should be compacted, we do not do this.
   * @returns {number} an available ID
   */
  nextId() :number{
    while(this.#objects.has(++this.#last_id)){
      //FIXME handle max client ID 0xfeffffff
    }
    return this.#last_id;
  }

  get wl_display(){
    return this.#objects.get(1) as Wl_display;
  }

  get wl_registry(){
    return this.#objects.get(2) as Wl_registry;
  }

  onData = (d :Buffer)=>{
    while(d.length){
      let id = readUInt(d, 0);
      let length = (readUInt(d, 4)>>16);
      let opcode = (readUInt(d, 4) &0xFFFF);
      const msg = d.slice(8, length);
      this.onMessage(id, opcode, msg);
      d = d.slice(length);
    }
  }

  onMessage(id :number, evcode :number, msg :Buffer){
    const target = this.#objects.get(id);
    if(!target) return this.emit("warning", "No interface with id "+id);
    const event = target.events[evcode];
    if(!event) return this.emit("warning", `interface ${target.name} has no event with index ${evcode}`);
    //FIXME: parse msg into arguments
    target.push(evcode, msg);
  }


  
  /**
   * Load a protocol definition from a XML or JSON file
   * @param filepath path to the XML/JSON file to load
   */
  async load(interfaces :any[]):Promise<void>;
  async load(filepath :string):Promise<void>;
  async load(file :string | any[]){
    let interfaces = ((typeof file === "string")? await (async ()=>{
      if(/\.xml$/i.test(file)){
        const {xml2js} = await import("xml-js");
        const xml = await fs.readFile(file, {encoding: "utf-8"});
        const {protocol:{interface: interfaces}} = xml2js(xml, {compact: true}) as ElementCompact;
        return interfaces.map(parseInterface);
      }else{
        if(!/\.json$/i.test(file)) file = path.join(outDir, file+".json");
        return JSON.parse(await fs.readFile(file, {encoding: "utf-8"}));
      }
    })() : file);
    
    for (let itf of interfaces){
      this.#interfaces.set(itf.name, itf);
    }
  }

  /**
   * Binds an interface. see wl_registry.bind in wayland.xml
   * @returns {Promise<Interface>}
   */
  async bind(iname :string, version?:number) :Promise<Interface>{
    const def = this.getDefinition(iname);
    const gid = this.#globals.get(iname);
    if(!gid) throw new Error(` No global named ${iname}. Available globals : ${[...this.#globals.keys()].join(", ")}`);
    if(typeof version !== "undefined" && version != def.version){
      console.warn(`Version mismatch: user requests ${iname} v${version}, but v${def.version} is defined`);
    }
    const itf = this.createInterface(iname);
    //console.log(`Bind globals#${iname}(${gid}) to id: ${itf.id}`);
    // @ts-ignore : bind is (intentionally) ill-defined in the protocol file
    await this.wl_registry.bind(gid, def.name, def.version, itf.id);
    //FIXME : wait for wl_display.sync() while catching errors to handle protocol errors here instead of in Display.error
    // This is not very high priority because protocol errors are fatal anyways
    return  itf;
  }


  /**
   * Create a new interface, allocating it's ID automatically
   * @param name 
   */
  createInterface<T extends Interface = Interface>(name :string) :T{
    let id = this.nextId();
    return this.registerInterface(id, name);
  }


/**
 * Instanciate a server-created interface.
 * Like Display.createInterface but do not allocate an ID
 * Used internally and for server-created objects
 */
  registerInterface<T extends Interface = Interface>(id :number, name :string) :T{
    const def = typeof name ==="string"?this.#interfaces.get(name): name;
    /* @ts-ignore */
    let itf = new Interface(this, id, def);
    this.#objects.set(id, itf);
    return itf as T;
  }

  deleteId(id :number){
    this.#objects.delete(id);
    //FIXME recalculate next ID to densely pack IDs
  }

  /**
   * 
   */
  getObject(iName :string) :Interface|undefined{
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

  getDefinition(name :string) :InterfaceDefinition{
    let iFace = this.#interfaces.get(name);
    if(!iFace) throw new Error("No interface definition for "+name);
    return iFace;
  }

  getEnum(name :string)  :EnumReduction{
    let [iName, eName] = name.split(".");
    let def = this.getDefinition(iName);
    let e = def.enums[eName];
    return e.reduce((acc, v)=>{acc[v.name] = v.value; return acc;}, {} as EnumReduction);
  }


  async write(b :Parameters<Socket["write"]>[0]){
    const flushed = this.#s.write(b);
    if(!flushed) await once(this.#s, "drain");
  }

  /**
   * 
   */
  public async request(srcId :number, opcode :number, def :RequestDefinition, ...args :any[]){
    const b1 = Buffer.alloc(8);
    const b2 = format_args(args, def.args);
    //console.log("Request: ", srcId, opcode, args, b2.length);
    writeUInt(b1, srcId, 0);
    //16 most significant bits are the message length. 16 next bits are the message opcode
    writeUInt(b1, (b1.length + b2.length) << 16 | opcode & 0xFFFF, 4);
    await this.write(Buffer.concat([b1, b2]));
  }

  async sync(){
    /* @ts-ignore */
    return await this.wl_display.sync();
  }


  close(){
    this.#s.end();
  }

}
