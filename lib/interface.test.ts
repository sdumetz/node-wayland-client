import { Socket } from "net";
import { Wl_display, Wl_registry } from "../protocol/wayland.js";
import { CallbackRequest, DestructorRequest, EnumReduction, EventDefinition, InterfaceCreationRequest, InterfaceDefinition, RequestDefinition } from "./definitions.js";
import Display from "./display.js";
import Wl_interface from "./interface.js";
import EventEmitter from "events";
import { expect } from "chai";
import { format_args } from "./args.js";


class DisplayMock extends Display{

  public _packets:Array<string | Uint8Array> = [];

  constructor(){
    super(new EventEmitter() as any);
  }

  override write(b: string | Uint8Array): Promise<void> {
    this._packets.push(b);
    return Promise.resolve();
  }

  override async close(): Promise<void> {
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

const emptyDef: InterfaceDefinition = {
  name: "wl_itf", version: 1, description: "", summary: "",
  requests: [], events: [], enums: {},
};

describe("Wl_interface: version-gated requests", function(){
  let d: DisplayMock;
  beforeEach(function(){ d = new DisplayMock(); });

  it("opcode() throws for a version-filtered request", function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      version: 1,
      requests: [
        {name: "v1_req", description: "", summary: "", args: []},
        {name: "v2_req", since: 2, description: "", summary: "", args: []},
      ],
    };
    const itf = new Wl_interface(d, 3, def);
    expect(() => itf.opcode("v2_req")).to.throw();
  });

  it("opcode() resolves correctly for a request before the filtered slot", function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      version: 1,
      requests: [
        {name: "v1_req", description: "", summary: "", args: []},
        {name: "v2_req", since: 2, description: "", summary: "", args: []},
      ],
    };
    const itf = new Wl_interface(d, 3, def);
    expect(itf.opcode("v1_req")).to.equal(0);
  });

  it("destructor with since > version is not attached", function(){
    const req: DestructorRequest = {
      name: "release", type: "destructor", since: 3,
      description: "", summary: "", args: [],
    };
    const def: InterfaceDefinition = { ...emptyDef, version: 2, requests: [req] };
    const itf = new Wl_interface(d, 3, def);
    expect((itf as any).release).to.be.undefined;
  });

  it("destructor with since <= version is attached and acts as destructor", async function(){
    const req: DestructorRequest = {
      name: "release", type: "destructor", since: 3,
      description: "", summary: "", args: [],
    };
    const def: InterfaceDefinition = { ...emptyDef, version: 3, requests: [req] };
    const itf = new Wl_interface(d, 3, def);
    expect((itf as any).release).to.be.a("function");
    await (itf as any).release();
    expect(d._packets).to.have.length(1);
  });
});

describe("Wl_interface.emitError()", function(){
  let d: DisplayMock;
  beforeEach(function(){ d = new DisplayMock(); });

  it("delegates to display when interface has no error listeners", function(){
    const itf = new Wl_interface(d, 3, emptyDef);
    let received: Error|undefined;
    d.on("error", (e: Error) => { received = e; });
    const err = new Error("test");
    itf.emitError(err);
    expect(received).to.equal(err);
  });

  it("emits on self when interface has error listeners", function(){
    const itf = new Wl_interface(d, 3, emptyDef);
    let selfReceived: Error|undefined;
    let displayReceived: Error|undefined;
    itf.on("error", (e: Error) => { selfReceived = e; });
    d.on("error", (e: Error) => { displayReceived = e; });
    const err = new Error("test");
    itf.emitError(err);
    expect(selfReceived).to.equal(err);
    expect(displayReceived).to.be.undefined;
  });
});

describe("Wl_interface.push()", function(){
  let d: DisplayMock;
  beforeEach(function(){ d = new DisplayMock(); });

  it("emits error on display when get_args fails on malformed buffer", function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      events: [{ name: "ping", description: "", summary: "", args: [{ name: "id", type: "uint", summary: "" }] }],
    };
    const itf = new Wl_interface(d, 3, def);
    let received: Error|undefined;
    d.on("error", (e: Error) => { received = e; });
    itf.push(0, Buffer.alloc(0)); // too short for a uint32
    expect(received).to.be.an.instanceof(Error);
  });

  it("handles interface creation event with extra args (console.warn path)", async function(){
    await d.load("wayland");
    const eventDef: EventDefinition = {
      name: "created", description: "", summary: "",
      args: [
        { name: "id", type: "new_id", interface: "wl_registry", summary: "" },
        { name: "version", type: "uint", summary: "" },
      ],
    };
    const def: InterfaceDefinition = {
      ...emptyDef, events: [eventDef],
    };
    const itf = new Wl_interface(d, 3, def);
    let emitted: Wl_interface|undefined;
    itf.on("created", (i: Wl_interface) => { emitted = i; });
    const buf = format_args([2, 1], eventDef.args);
    itf.push(0, buf);
    expect(emitted).to.be.instanceof(Wl_interface);
    expect(emitted!.name).to.equal("wl_registry");
  });
});

describe("Wl_interface.aggregate()", function(){
  let d: DisplayMock;
  beforeEach(function(){ d = new DisplayMock(); });

  it("records true for no-arg events", function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      events: [{ name: "done", description: "", summary: "", args: [] }],
    };
    const itf = new Wl_interface(d, 3, def);
    const end = itf.aggregate();
    itf.emit("done");
    const result = end();
    expect(result.done).to.equal(true);
  });

  it("records the value for single-arg events", function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      events: [{ name: "size", description: "", summary: "", args: [
        { name: "n", type: "uint", summary: "" },
      ]}],
    };
    const itf = new Wl_interface(d, 3, def);
    const end = itf.aggregate();
    itf.emit("size", 42);
    const result = end();
    expect(result.size).to.equal(42);
  });

  it("records array for multi-arg events", function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      events: [{ name: "point", description: "", summary: "", args: [
        { name: "x", type: "uint", summary: "" },
        { name: "y", type: "uint", summary: "" },
      ]}],
    };
    const itf = new Wl_interface(d, 3, def);
    const end = itf.aggregate();
    itf.emit("point", 3, 7);
    const result = end();
    expect(result.point).to.deep.equal([3, 7]);
  });

  it("does not attach a listener for a version-filtered event", function(){
    const def: InterfaceDefinition = {
      ...emptyDef, version: 1,
      events: [
        {name: "ev_v1",  description: "", summary: "", args: []},
        {name: "ev_v2",  since: 2, description: "", summary: "", args: []},
        {name: "ev_v1b", description: "", summary: "", args: []},
      ],
    };
    const itf = new Wl_interface(d, 3, def);
    const before = itf.listenerCount("ev_v2");
    itf.aggregate();
    expect(itf.listenerCount("ev_v2")).to.equal(before);
  });

  it("collects events on either side of a version-filtered slot", function(){
    const def: InterfaceDefinition = {
      ...emptyDef, version: 1,
      events: [
        {name: "ev_v1",  description: "", summary: "", args: []},
        {name: "ev_v2",  since: 2, description: "", summary: "", args: []},
        {name: "ev_v1b", description: "", summary: "", args: []},
      ],
    };
    const itf = new Wl_interface(d, 3, def);
    const end = itf.aggregate();
    itf.emit("ev_v1");
    itf.emit("ev_v1b");
    const result = end();
    expect(result.ev_v1).to.equal(true);
    expect(result.ev_v1b).to.equal(true);
  });

  it("aggregates nested Wl_interface events", function(){
    const childDef: InterfaceDefinition = {
      ...emptyDef, name: "wl_output",
    };
    const def: InterfaceDefinition = {
      ...emptyDef,
      events: [{ name: "child", description: "", summary: "", args: [
        { name: "obj", type: "new_id", interface: "wl_output", summary: "" },
      ]}],
    };
    const itf = new Wl_interface(d, 3, def);
    const child = new Wl_interface(d, 4, childDef);
    const end = itf.aggregate();
    itf.emit("child", child);
    const result = end();
    expect(result.child).to.be.an("object").with.property("id", 4);
  });
});

describe("Wl_interface.drain()", function(){
  let d: DisplayMock;
  beforeEach(function(){ d = new DisplayMock(); });

  it("rethrows if the until promise rejects", async function(){
    const itf = new Wl_interface(d, 3, emptyDef);
    const err = new Error("until failed");
    try{
      await itf.drain(Promise.reject(err));
      expect.fail("Should have thrown");
    }catch(e){
      expect(e).to.equal(err);
    }
  });

  it("returns aggregate result when until resolves", async function(){
    const def: InterfaceDefinition = {
      ...emptyDef,
      events: [{ name: "done", description: "", summary: "", args: [] }],
    };
    const itf = new Wl_interface(d, 3, def);
    const result = await itf.drain(Promise.resolve());
    expect(result).to.be.an("object").with.property("id", 3);
  });
});