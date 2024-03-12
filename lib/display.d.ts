import {Socket} from "node:net";
import {EventEmitter} from "node:events";
import Interface from "./interface.d.ts";
import { EnumReduction, InterfaceDefinition } from "./definitions.d.ts";

export default class Display extends EventEmitter{
    #interfaces: Map<string, InterfaceDefinition>

    #globals: Map<string, number>;

    #objects: Map<number, Interface>;
  
    #s :Socket;

  constructor(socket: Socket);

  /**
   * Initializes a wl_display. Loads the core protocol and binds to wl_registry to fetch the server's globals.
   */
  async init():Promise<void>;


  /**
   * 
   * @param filepath path to the XML/JSON file to load
   */
  async load(interfaces :any[]):Promise<void>;
  async load(filepath :string):Promise<void>;


  /**Binds an interface by name */
  async bind(iname:string, version?:string):Promise<Interface>;

  /**
   * Shortcut to wl_display.sync() : ensure all pending requests are handled before returning
   */
  async sync():Promise<void>;


  /**
   * Get an ID to be assigned to a new interface
   */
  nextId():number;

  getDefinition(name :string) :InterfaceDefinition;

  /**
   * Create a new interface, allocating it's ID automatically
   * @param name 
   */
  createInterface(name :string) :Interface<name>;

  /**
   * Instanciate a server-created interface.
   * Like Display.createInterface but do not allocate an ID
   * Used internally and for server-created objects
   * @param {number} id 
   * @param {string} name 
   * @returns {Interface}
   */
  registerInterface(id :number, name :string) :Interface<name>;

  deleteId(id){
    this.#objects.delete(id);
    //FIXME recalculate next ID to densely pack IDs
  }


  getEnum(name :string) :EnumReduction;
}