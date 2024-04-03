import { Socket } from "net";
import { Wl_display, Wl_registry } from "../protocol/wayland.js";
import { CallbackRequest, DestructorRequest, EnumReduction, EventDefinition, InterfaceCreationRequest, InterfaceDefinition, RequestDefinition } from "./definitions.js";
import Display from "./display.js";
import Wl_interface from "./interface.js";
import EventEmitter from "events";
import { expect } from "chai";


class DisplayMock extends Display{

  public _packets:Array<string | Uint8Array> = [];

  constructor(){
    super(new EventEmitter() as any);
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
  let d :DisplayMock;
  beforeEach(function(){
    d = new DisplayMock();
  });
  describe("create from definitions", function(){

    it("empty definition", function(){
      const def :InterfaceDefinition = {
        name: "wl_itf",
        version: 1,
        description: "some dummy interface",
        summary: "dummy",
        requests: [],
        events: [],
        enums: {},
      }
      const itf = new Wl_interface(d, 0x03, def);
      expect(itf).to.have.property("id", 3);
      expect(itf).to.have.property("name", "wl_itf");
      expect(itf).to.have.property("version", 1);
      expect(itf.inspect()).to.be.a("string");
    });

    it("with callback", async function(){
      await d.load("wayland");

      const createInterface = d.createInterface.bind(d);
      (d.createInterface as any) = (name: string) => {
        const itf = createInterface(name);
        if(itf.name == "wl_callback"){
          setTimeout(() => {
            itf.emit("done");
          }, 0);
        }
        return itf;
      }


      const req :CallbackRequest = {
        name: "callable",
        description: "Some dummy function with a callback",
        summary: "dummy",
        args: [{
          name: "callback",
          type: "new_id",
          interface: "wl_callback",
          summary: "callback object for the function",
        }],
      }

      const def :InterfaceDefinition = {
        name: "wl_itf",
        version: 1,
        description: "some dummy interface",
        summary: "dummy",
        requests: [req],
        events: [],
        enums: {},
      }
      const itf = new Wl_interface(d, 0x03, def);
      expect((itf as any).callable).to.be.a("function");
      await (itf as any).callable();
      
      expect(d._packets).to.have.length(1);
      expect((d._packets[0] as Buffer).toString("hex")).to.deep.equal('0300000000000c0002000000');
      
    });

    it("with interface creation", async function(){
      await d.load("wayland");

      const req :InterfaceCreationRequest = {
        name: "callable",
        description: "Some dummy function that creates an interface",
        summary: "dummy",
        args: [{
          name: "registry",
          type: "new_id",
          interface: "wl_registry",
          summary: "creates a new registry object",
        }],
      }

      const def :InterfaceDefinition = {
        name: "wl_itf",
        version: 1,
        description: "some dummy interface",
        summary: "dummy",
        requests: [req],
        events: [],
        enums: {},
      }
      const itf = new Wl_interface(d, 0x03, def);
      expect((itf as any).callable).to.be.a("function");
      expect(itf.opcode("callable")).to.equal(0);
      const reg = await (itf as any).callable();
      expect(reg).to.have.property("name", "wl_registry");
      
      expect(d._packets).to.have.length(1);
      expect((d._packets[0] as Buffer).toString("hex")).to.deep.equal('0300000000000c0002000000');
    });

    it("with destructor", async function(){
      const req :DestructorRequest = {
        name: "destroy",
        type: "destructor",
        description: "Tells the server to release this interface",
        summary: "destroy the object",
        args: [],
      }

      const def :InterfaceDefinition = {
        name: "wl_itf",
        version: 1,
        description: "some dummy interface",
        summary: "dummy",
        requests: [req],
        events: [],
        enums: {},
      }
      const itf = new Wl_interface(d, 0x03, def);
      expect((itf as any).destroy).to.be.a("function");
      expect(itf.opcode("destroy")).to.equal(0);
      await (itf as any).destroy();
      expect(d._packets).to.have.length(1);
      expect((d._packets[0] as Buffer).toString("hex")).to.deep.equal("0300000000000800");
    });
  });

  it("wraps requests errors", async function(){
    d.request = ()=>Promise.reject(new Error("test"));
    const def :InterfaceDefinition = {
      name: "wl_itf",
      version: 1,
      description: "some dummy interface",
      summary: "dummy",
      requests: [{
        name: "test",
        description: "test",
        summary: "test",
        args: [],
      }],
      events: [],
      enums: {},
    }
    const itf = new Wl_interface(d, 0x03, def);
    expect((itf as any).test).to.be.a("function");
    try{
      await (itf as any).test();
      expect.fail("Wl_interface.test() should have thrown");
    }catch(e){
      expect(e).to.be.an("error");
    }
  });
  it("wraps interface creation error", async function(){
    await d.load("wayland");
    d.request = ()=>Promise.reject(new Error("test"));
    const deleteId = d.deleteId.bind(d);
    let deleteCalls = 0;
    d.deleteId = (id:number)=>{
      deleteId(id);
      deleteCalls++;
    }

    const req :InterfaceCreationRequest = {
      name: "callable",
      description: "Some dummy function that creates an interface",
      summary: "dummy",
      args: [{
        name: "registry",
        type: "new_id",
        interface: "wl_registry",
        summary: "creates a new registry object",
      }],
    }

    const def :InterfaceDefinition = {
      name: "wl_itf",
      version: 1,
      description: "some dummy interface",
      summary: "dummy",
      requests: [req],
      events: [],
      enums: {},
    }
    const itf = new Wl_interface(d, 0x03, def);
    expect((itf as any).callable).to.be.a("function");
    try{
      await (itf as any).callable();
      expect.fail("Wl_interface.callable() should have thrown")
    }catch(e){
      expect(e).to.be.an("error");
    }
    expect(deleteCalls).to.equal(1);
  });
});