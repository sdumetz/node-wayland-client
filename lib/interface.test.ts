import { Socket } from "net";
import { Wl_display, Wl_registry } from "../protocol/wayland.js";
import { EnumReduction, EventDefinition, InterfaceDefinition, RequestDefinition } from "./definitions.js";
import Display from "./display.js";
import Wl_interface from "./interface.js";
import EventEmitter from "events";


class DisplayMock extends Display{

  public _packets:Array<string | Uint8Array> = [];

  constructor(){
    super({} as any);
  }

  override write(b: string | Uint8Array): Promise<void> {
    this._packets.push(b);
    return Promise.resolve();
  }

  override close(): void {
    return;
  }
}

describe("class Wl_interface", function(){
  it.skip("can be created with a definition", function(){

  });
  it.skip("wraps requests errors", function(){

  });

  it.skip("handles destructor requests", function(){
    //Object gets deleted from Display's interfaces registry
  })
})