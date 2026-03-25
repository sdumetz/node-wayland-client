'use strict';
/**
 * Regression tests for reliability-sensitive behaviour in node-wayland-client.
 *
 * Each describe block targets one specific behaviour that was previously
 * identified as buggy and has since been fixed.
 */
import { expect } from "chai";
import EventEmitter from "events";
import { format_args, get_args } from "./args.js";
import {
  ArgumentDefinition,
  DestructorRequest,
  EventDefinition,
  InterfaceDefinition,
} from "./definitions.js";
import Display from "./display.js";
import { WaylandProtocolError } from "./errors.js";
import Wl_interface from "./interface.js";


// ── Shared test helper ────────────────────────────────────────────────────

class MockDisplay extends Display {
  public packets: Buffer[] = [];
  public warnings: string[] = [];

  constructor() {
    const sock = Object.assign(new EventEmitter(), { destroy() {}, write() { return true; } });
    super(sock as any);
    this.on("warning", (msg: string) => this.warnings.push(msg));
  }

  override write(b: any): Promise<void> {
    this.packets.push(b);
    return Promise.resolve();
  }
  override async close(): Promise<void> {}

  setMaxId(n: number) { (this._maxId as any) = n; }

  /** Feed raw bytes as if they arrived from the socket (calls protected onData). */
  feedData(d: Buffer): void {
    (this as any).onData(d);
  }

  /** Expose protected nextId() for inspection. */
  nextIdPublic(): number {
    return (this as any).nextId();
  }
}

/** Build a minimal valid Wayland binary message (header + optional body). */
function makeMsg(objectId: number, opcode: number, body?: Buffer): Buffer {
  const b = body ?? Buffer.alloc(0);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(objectId, 0);
  header.writeUInt32LE(((8 + b.length) << 16) | (opcode & 0xFFFF), 4);
  return Buffer.concat([header, b]);
}

/** Build an InterfaceDefinition with a single destructor request, no events. */
function makeDtorDef(name: string): InterfaceDefinition {
  return {
    name,
    version: 1,
    description: "test interface",
    summary: "test",
    requests: [
      {
        name: "destroy",
        type: "destructor",
        description: "destroy the object",
        summary: "destroy",
        args: [],
      } as DestructorRequest,
    ],
    events: [],
    enums: {},
  };
}

/** Build an InterfaceDefinition with N named events and no requests. */
function makeEventDef(name: string, eventNames: string[]): InterfaceDefinition {
  return {
    name,
    version: 1,
    description: "test interface",
    summary: "test",
    requests: [],
    events: eventNames.map((n): EventDefinition => ({
      name: n,
      description: "",
      summary: "",
      args: [],
    })),
    enums: {},
  };
}


// ── Array argument alignment padding ──────────────────────────────────────

describe("args: array argument alignment padding is preserved across encode/decode", function () {
  /**
   * writeArray pads array data to a 4-byte boundary; readArray advances past
   * that padding.  Any argument following an unaligned array must be decoded
   * at the correct post-padding offset.
   */

  it("control: [array(4 bytes), uint] round-trips correctly — no padding involved", function () {
    const def: ArgumentDefinition[] = [
      { name: "a", type: "array" },
      { name: "b", type: "uint" },
    ];
    const buf = format_args([new Uint8Array([0x01, 0x02, 0x03, 0x04]), 0xDEAD], def);
    const [, b] = get_args(buf, def);
    expect(b).to.equal(0xDEAD);
  });

  ([1, 2, 3, 5, 6, 7] as const).forEach((len) => {
    it(`[array(${len} bytes), uint]: uint after unaligned array is read at the correct offset`, function () {
      const def: ArgumentDefinition[] = [
        { name: "a", type: "array" },
        { name: "b", type: "uint" },
      ];
      const arrayData = new Uint8Array(len).fill(0xAB);
      const buf = format_args([arrayData, 0xDEAD], def);
      const [parsedArr, parsedUint] = get_args(buf, def);

      expect(parsedArr).to.deep.equal(arrayData, "array content should be preserved");
      expect(parsedUint).to.equal(0xDEAD, `uint after ${len}-byte array must survive padding`);
    });
  });
});


// ── Fragmented socket data ─────────────────────────────────────────────────

describe("onData: fragmented socket data is buffered and dispatched correctly", function () {
  /**
   * Unix socket data can arrive in arbitrary fragments.  onData accumulates
   * incomplete data in an internal buffer between 'data' events and only
   * dispatches a message once all of its bytes have arrived.
   */

  let d: MockDisplay;
  let messages: { id: number; opcode: number; msg: Buffer }[];

  beforeEach(function () {
    d = new MockDisplay();
    messages = [];
    (d as any).onMessage = (id: number, opcode: number, msg: Buffer) =>
      messages.push({ id, opcode, msg });
  });

  it("processes one complete message correctly (baseline)", function () {
    d.feedData(makeMsg(1, 0));
    expect(messages).to.have.length(1);
    expect(messages[0]).to.include({ id: 1, opcode: 0 });
  });

  it("processes two complete messages concatenated in one chunk (baseline)", function () {
    d.feedData(Buffer.concat([makeMsg(1, 0), makeMsg(2, 1)]));
    expect(messages).to.have.length(2);
    expect(messages[0]).to.include({ id: 1, opcode: 0 });
    expect(messages[1]).to.include({ id: 2, opcode: 1 });
  });

  it("does not throw and buffers data when fewer than 8 bytes arrive (header split)", function () {
    const msg = makeMsg(1, 0);
    expect(() => d.feedData(msg.subarray(0, 3))).to.not.throw();
    expect(messages).to.have.length(0); // not dispatched yet — incomplete header
  });

  it("dispatches with the correct body when a message body arrives in a second chunk", function () {
    const body = Buffer.alloc(4);
    body.writeUInt32LE(99, 0);
    const msg = makeMsg(1, 0, body); // 12 bytes total

    d.feedData(msg.subarray(0, 8));  // header only
    expect(messages).to.have.length(0); // must wait for the body

    d.feedData(msg.subarray(8));     // body arrives
    expect(messages).to.have.length(1);
    expect(messages[0].msg.readUInt32LE(0)).to.equal(99, "body content must be preserved");
  });

  it("delivers all messages when the full payload arrives in 3-byte chunks", function () {
    const combined = Buffer.concat([makeMsg(5, 0), makeMsg(6, 1)] as Uint8Array[]);

    for (let i = 0; i < combined.length; i += 3) {
      d.feedData(combined.subarray(i, Math.min(i + 3, combined.length)));
    }

    expect(messages).to.have.length(2);
    expect(messages[0]).to.include({ id: 5, opcode: 0 });
    expect(messages[1]).to.include({ id: 6, opcode: 1 });
  });

  it("delivers a message split exactly on the header/body boundary", function () {
    const body = Buffer.alloc(8); // 8-byte body, total message = 16 bytes
    body.writeUInt32LE(0xAB, 0);
    body.writeUInt32LE(0xCD, 4);
    const msg = makeMsg(3, 2, body);

    d.feedData(msg.subarray(0, 8));   // header only
    d.feedData(msg.subarray(8));       // body only
    expect(messages).to.have.length(1);
    expect(messages[0].msg.readUInt32LE(0)).to.equal(0xAB);
    expect(messages[0].msg.readUInt32LE(4)).to.equal(0xCD);
  });

  it("delivers messages when a chunk contains a complete message followed by a partial one", function () {
    const msg1 = makeMsg(1, 0);         // 8 bytes
    const msg2 = makeMsg(2, 1);         // 8 bytes
    // Send msg1 + first 3 bytes of msg2 in one chunk, then the rest
    d.feedData(Buffer.concat([msg1, msg2.subarray(0, 3)] as Uint8Array[]));
    expect(messages).to.have.length(1); // msg1 dispatched, msg2 buffered

    d.feedData(msg2.subarray(3));
    expect(messages).to.have.length(2); // msg2 now complete
    expect(messages[1]).to.include({ id: 2, opcode: 1 });
  });
});


// ── Callback requests reject on socket close ──────────────────────────────

describe("callback requests: promise rejects when the display closes", function () {
  /**
   * Callback requests use `await once(wl_callback, "done", {signal})` with an
   * AbortController that fires on display "close" and "error".  If the
   * compositor disconnects before sending "done", the promise rejects with a
   * descriptive error rather than hanging indefinitely.
   */
  this.timeout(800);

  it("sync()-style request rejects when the display emits 'close'", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    // Intercept createInterface so no "done" event is ever emitted
    const orig = d.createInterface.bind(d);
    (d as any).createInterface = (name: string) => orig(name); // callback never fires

    const def: InterfaceDefinition = {
      name: "wl_test_iface",
      version: 1,
      description: "test",
      summary: "test",
      requests: [
        {
          name: "do_sync",
          description: "sync",
          summary: "sync",
          args: [
            {
              name: "cb",
              type: "new_id",
              interface: "wl_callback",
              summary: "callback",
            },
          ],
        },
      ],
      events: [],
      enums: {},
    };

    const itf = new Wl_interface(d, 50, def);
    const syncPromise = (itf as any).do_sync();

    // The handler has two levels of async suspension before it registers the
    // "close" listener (await request() → await write()). Two microtask yields
    // let those continuations run before we fire "close".
    await Promise.resolve(); // lets request() complete
    await Promise.resolve(); // lets the handler register its display listeners

    // Connection closes — "done" will never arrive
    d.emit("close");

    const winner = await Promise.race([
      syncPromise.then(() => "resolved", () => "rejected"),
      new Promise<string>((res) => setTimeout(() => res("timeout"), 300)),
    ]);

    expect(winner).to.equal(
      "rejected",
      "callback promise should reject when the connection closes",
    );
  });
});


// ── nextId() exhaustion and slot reuse ────────────────────────────────────

describe("nextId(): ID space exhaustion and slot reuse", function () {

  it("throws when all IDs in a constrained range are occupied", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    d.setMaxId(5);
    for (let id = 1; id <= 5; id++) {
      d.registerInterface(id, "wl_display");
    }
    expect(() => d.nextIdPublic()).to.throw(/exhausted/);
  });

  it("nextId() returns the next free ID when lower IDs are densely occupied", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    // Occupy IDs 2..101 so nextId must scan past them
    for (let id = 2; id <= 101; id++) {
      d.registerInterface(id, "wl_display");
    }
    expect(d.nextIdPublic()).to.equal(102);
  });

  it("deleteId() frees a slot that is reused after the ID space wraps around", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    d.setMaxId(5);
    // pin ID 1 and fill 2..5 via createInterface so #last_id advances to 5
    d.registerInterface(1, "wl_display");
    d.createInterface("wl_display");
    const itf3 = d.createInterface("wl_display");
    d.createInterface("wl_display");
    d.createInterface("wl_display");
    d.deleteId(itf3.id);
    // nextId: 6→wrap→1(occupied), 2(occupied), 3(free) → reuses itf3.id
    expect(d.nextIdPublic()).to.equal(itf3.id);
  });
});


// ── Destructor request ordering ───────────────────────────────────────────

describe("destructor: wire request is sent before the object ID is released", function () {
  /**
   * The destructor handler awaits `display.request(...)` before calling
   * `display.deleteId(this.id)`.  If the write fails the ID is preserved in
   * #objects, so any subsequent server event for that ID is handled normally
   * rather than producing a ghost-object warning.
   */

  // A definition with one destructor request and one no-arg event,
  // so feedData(makeMsg(id, 0)) can be used to probe object presence.
  const dtorWithEventDef: InterfaceDefinition = {
    ...makeDtorDef("wl_surface"),
    events: [{ name: "enter", description: "", summary: "", args: [] }],
  };

  it("failed destructor request leaves the object ID intact in #objects", async function () {
    const d = new MockDisplay();
    await d.load([dtorWithEventDef]);
    (d as any).request = async () => { throw new Error("write failed"); };
    const itf = d.registerInterface(77, "wl_surface");
    try { await (itf as any).destroy(); } catch { /* expected */ }
    // ID must still be tracked — no ghost object
    (d as any).request = () => Promise.resolve();
    d.feedData(makeMsg(77, 0));
    expect(d.warnings).to.not.include("No interface with id 77");
  });

  it("successful destructor removes the object ID from #objects", async function () {
    const d = new MockDisplay();
    await d.load([dtorWithEventDef]);
    (d as any).request = async () => {};
    const itf = d.registerInterface(77, "wl_surface");
    await (itf as any).destroy();
    d.feedData(makeMsg(77, 0));
    expect(d.warnings).to.include("No interface with id 77");
  });
});


// ── aggregate() listener lifecycle ───────────────────────────────────────

describe("aggregate(): listener registration and cleanup", function () {
  /**
   * aggregate() attaches one listener per declared event.  Cleanup happens
   * by calling the returned function or automatically via the `using` keyword
   * (Disposable).  Discarding the return value without `using` leaks listeners,
   * but this is acceptable since concurrent aggregates on the same interface
   * are not an expected use-case.
   */

  it("each discarded aggregate() call adds its own listener per event", function () {
    const d = new MockDisplay();
    const itf = new Wl_interface(d, 10, makeEventDef("wl_output", ["geometry", "mode", "done"]));

    const before = itf.listenerCount("geometry");
    const CALLS = 5;

    for (let i = 0; i < CALLS; i++) {
      itf.aggregate(); // return value discarded
    }

    expect(itf.listenerCount("geometry")).to.equal(
      before + CALLS,
      `${CALLS} discarded aggregates each add their own 'geometry' listener`,
    );
  });

  it("using-based aggregate() cleans up listeners even when result is not collected", function () {
    const d = new MockDisplay();
    const itf = new Wl_interface(d, 10, makeEventDef("wl_output", ["geometry"]));
    const before = itf.listenerCount("geometry");
    {
      using _end = itf.aggregate(); // discarded — using calls [Symbol.dispose]
    }
    expect(itf.listenerCount("geometry")).to.equal(before);
  });

  it("properly ended aggregate() removes all its listeners (control case)", function () {
    const d = new MockDisplay();
    const itf = new Wl_interface(d, 10, makeEventDef("wl_output", ["geometry", "mode"]));

    const before = itf.listenerCount("geometry");
    const end = itf.aggregate();
    end(); // properly terminated

    expect(itf.listenerCount("geometry")).to.equal(
      before,
      "a terminated aggregate() must not leave dangling listeners",
    );
  });
});


// ── WaylandProtocolError vs socket error disambiguation ───────────────────

describe("Display error events: WaylandProtocolError vs socket errors", function () {
  /**
   * Both Wayland protocol errors (from the compositor via wl_display.error)
   * and socket-level errors end up on the Display "error" event.
   * Protocol errors are wrapped in WaylandProtocolError; socket errors are
   * forwarded as-is so consumers can use instanceof to tell them apart.
   *
   * wl_display.error is intercepted at the onMessage level before push() is
   * called, so the Node.js "error" event on wl_display is never used for
   * protocol errors
   */

  /** Serialises wl_display.error args into a wire body buffer. */
  function makeWlDisplayErrorBody(srcId: number, errno: number, message: string): Buffer {
    const args: ArgumentDefinition[] = [
      { name: "object_id", type: "uint" },
      { name: "code",      type: "uint" },
      { name: "message",   type: "string" },
    ];
    return format_args([srcId, errno, message], args);
  }

  /** Minimal Display subclass that exposes the underlying socket. */
  class SocketDisplay extends Display {
    public readonly testSocket: EventEmitter;
    constructor() {
      const s = Object.assign(new EventEmitter(), { destroy() {}, write() { return true; } });
      super(s as any);
      this.testSocket = s;
    }
    override write(_b: any): Promise<void> { return Promise.resolve(); }
    override async close(): Promise<void> {}
  }

  it("protocol error (unknown source) emits WaylandProtocolError", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    d.registerInterface(1, "wl_display");

    let received: Error | undefined;
    d.on("error", (e: Error) => { received = e; });

    d.feedData(makeMsg(1, 0, makeWlDisplayErrorBody(99, 0, "test protocol error")));

    expect(received).to.be.instanceOf(WaylandProtocolError);
    expect(received!.message).to.include("unknown");
  });

  it("protocol error (known source) emits WaylandProtocolError on Display", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    d.registerInterface(1, "wl_display");
    d.registerInterface(42, "wl_display");

    let received: Error | undefined;
    d.on("error", (e: Error) => { received = e; });

    d.feedData(makeMsg(1, 0, makeWlDisplayErrorBody(42, 0, "bad method")));

    expect(received).to.be.instanceOf(WaylandProtocolError);
    expect(received!.message).to.include("wl_display");
  });

  it("invalid_method error includes the resolved method name", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    d.registerInterface(1, "wl_display");
    // Register the faulty object at ID 42 so its request[0] ("sync") can be resolved
    d.registerInterface(42, "wl_display");

    let received: Error | undefined;
    d.on("error", (e: Error) => { received = e; });

    // errno=1 is wl_display.error.invalid_method; message matches compositor format
    d.feedData(makeMsg(1, 0, makeWlDisplayErrorBody(1, 1, "invalid method 0 (since 1 < 2), object wl_display#42")));

    expect(received).to.be.instanceOf(WaylandProtocolError);
    expect(received!.message).to.include('"sync"');
  });

  it("emitError() on wl_display reaches Display directly without mangling", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    const wl_display = d.registerInterface(1, "wl_display");

    let received: Error | undefined;
    d.on("error", (e: Error) => { received = e; });

    const internalError = new Error("parse failure");
    wl_display.emitError(internalError);

    expect(received).to.equal(internalError);
    expect(received).not.to.be.instanceOf(WaylandProtocolError);
  });

  it("socket error is forwarded as-is (not a WaylandProtocolError)", function () {
    const d = new SocketDisplay();
    const socketError = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });

    let received: Error | undefined;
    d.on("error", (e: Error) => { received = e; });

    d.testSocket.emit("error", socketError);

    expect(received).to.equal(socketError, "same Error object must be forwarded");
    expect(received).not.to.be.instanceOf(WaylandProtocolError);
  });

  it("protocol error calls socket.destroy()", async function () {
    const d = new SocketDisplay();
    await d.load("wayland");
    d.registerInterface(1, "wl_display");

    let destroyCalled = false;
    (d.testSocket as any).destroy = () => { destroyCalled = true; };
    d.on("error", () => { /* absorb */ });

    (d as any)._handleProtocolError(makeWlDisplayErrorBody(99, 0, "fatal"));

    expect(destroyCalled).to.be.true;
  });
});


// ── wl_registry global_remove handling ───────────────────────────────────

describe("wl_registry: global_remove removes globals from the registry", function () {
  /**
   * Display._bindRegistry() registers listeners for both "global" and
   * "global_remove" on wl_registry.  When the compositor removes a global
   * (e.g. a hot-unplugged device), the entry is deleted from #globals so that
   * a subsequent bind() throws a clean Error rather than sending a wire
   * request for a dead global.
   */

  it("Display._bindRegistry() installs a global_remove handler", function () {
    expect(Display.toString()).to.include("global_remove");
    expect(Display.toString()).to.not.include("@todo");
  });

  it("bind() rejects for a never-advertised global (baseline)", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    let threw = false;
    try {
      await d.bind("zwlr_output_manager_v1");
    } catch (e: any) {
      threw = true;
      expect(e.message).to.match(/No global named|No interface definition/);
    }
    expect(threw).to.be.true;
  });

  it("bind() throws for an interface whose global was removed", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    // Register wl_registry at object ID 2 and install the global/global_remove
    // handlers via the same protected method that init() uses.
    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    // Simulate: compositor advertised wl_compositor (global name=5), then removed it
    registry.emit("global", 5, "wl_compositor", 5);
    registry.emit("global_remove", 5);

    // bind() must now throw — the global is no longer available
    let threw = false;
    try {
      await d.bind("wl_compositor");
    } catch (e: any) {
      threw = true;
      expect(e.message).to.match(/No global named/);
    }
    expect(threw).to.be.true;
  });

  it("bind() throws citing server when requested version exceeds server version", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    // Server advertises wl_compositor at v2; def.version is 4
    registry.emit("global", 5, "wl_compositor", 2);

    let threw = false;
    try {
      await d.bind("wl_compositor", 3);
    } catch (e: any) {
      threw = true;
      expect(e.message).to.include("server only supports v2");
    }
    expect(threw).to.be.true;
  });

  it("bind() throws citing definition when requested version exceeds definition but not server", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    // Server supports more than our definition (def.version for wl_compositor is 4)
    registry.emit("global", 5, "wl_compositor", 99);

    let threw = false;
    try {
      await d.bind("wl_compositor", 5);
    } catch (e: any) {
      threw = true;
      expect(e.message).to.include("definition only covers v4");
    }
    expect(threw).to.be.true;
  });

  it("bind() throws citing server when both server and definition are below requested version", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    // Both server (v2) and def (v4) are below requested v5
    registry.emit("global", 5, "wl_compositor", 2);

    let threw = false;
    try {
      await d.bind("wl_compositor", 5);
    } catch (e: any) {
      threw = true;
      expect(e.message).to.include("server only supports v2");
    }
    expect(threw).to.be.true;
  });

  it("bind() auto-negotiates to min(def.version, serverVersion)", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    // Server advertises wl_compositor at v2; def.version is 4
    registry.emit("global", 5, "wl_compositor", 2);

    try { await d.bind("wl_compositor"); } catch { /* wire format may fail without full init() */ }

    // The interface is registered in #objects before the wire call
    expect(d.getObject("wl_compositor")!.version).to.equal(2);
  });

  it("bind() auto-negotiates to def.version when server advertises higher", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    // Server advertises version higher than our definition (v4 for wl_compositor)
    registry.emit("global", 5, "wl_compositor", 99);

    try { await d.bind("wl_compositor"); } catch { /* wire format may fail without full init() */ }

    expect(d.getObject("wl_compositor")!.version).to.equal(4);
  });

  it("bind() does not throw when requested version is within negotiated range", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    registry.emit("global", 5, "wl_compositor", 3);

    let threw = false;
    try { await d.bind("wl_compositor", 3); } catch (e: any) {
      if (/Cannot bind/.test(e.message)) threw = true;
    }
    expect(threw).to.be.false;
  });

  it("listGlobals() returns all currently advertised global names", async function () {
    const d = new MockDisplay();
    await d.load("wayland");

    const registry = d.registerInterface(2, "wl_registry");
    (d as any)._bindRegistry(registry);

    registry.emit("global", 1, "wl_compositor", 4);
    registry.emit("global", 2, "wl_shm", 1);

    const globals = [...d.listGlobals()];
    expect(globals).to.include("wl_compositor");
    expect(globals).to.include("wl_shm");
  });
});


// ── Backward compatibility with pre-since JSON format ────────────────────

describe("Backward compatibility: old JSON format (no since / no type / array enums)", function () {
  /**
   * JSON files generated before this version omit `since` on requests/events,
   * omit `type` on requests, and represent enums as plain arrays rather than
   * {since?, entries} objects.  The module must handle these gracefully.
   */

  /** Minimal old-format InterfaceDefinition — bypasses TS types via `as any`. */
  function makeOldDef(name: string): InterfaceDefinition {
    return {
      name,
      version: 3,
      description: "",
      summary: "",
      requests: [
        // no `type` field — was never included before
        {name: "plain_req",  description: "", summary: "", args: []},
        {name: "destructor", description: "", summary: "", args: []},
      ],
      events: [
        {name: "ev", description: "", summary: "", args: []},
      ],
      // old format: plain array instead of {since?, entries}
      enums: {error: [{name: "bad", value: 0, summary: "bad thing"}]} as any,
    };
  }

  it("all requests are attached when since is absent", function () {
    const d = new MockDisplay();
    d.load([makeOldDef("test_iface")]);
    const itf = d.registerInterface(10, "test_iface");
    expect((itf as any).plain_req).to.be.a("function");
    expect((itf as any).destructor).to.be.a("function");
  });

  it("all events are present when since is absent", function () {
    const d = new MockDisplay();
    d.load([makeOldDef("test_iface")]);
    const itf = d.registerInterface(10, "test_iface");
    expect(itf.events[0]).to.deep.include({name: "ev"});
  });

  it("old-format array enum is accessible in this.enums", function () {
    const d = new MockDisplay();
    d.load([makeOldDef("test_iface")]);
    const itf = d.registerInterface(10, "test_iface");
    expect(itf.enums["error"]).to.be.an("array").with.length(1);
    expect(itf.enums["error"][0]).to.include({name: "bad", value: 0});
  });

  it("getEnum() works with old-format array enum", function () {
    const d = new MockDisplay();
    d.load([makeOldDef("test_iface")]);
    const result = d.getEnum("test_iface.error");
    expect(result).to.deep.equal({bad: 0});
  });
});


// ── Wl_interface version-gated methods and events ─────────────────────────

describe("Wl_interface: version-gated methods, events, and enums", function () {
  /**
   * Methods, events, and enums introduced after the negotiated version must
   * be invisible on the Wl_interface instance.
   *
   * Test cases use real protocol data from wayland.json:
   *   - wl_surface.set_buffer_transform  (request  since=2, opcode=7)
   *   - wl_pointer.frame                 (event    since=5, opcode=5)
   *   - wl_data_device_manager.dnd_action (enum    since=3)
   */

  it("method with since > bound version is not attached", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    // set_buffer_transform is since=2; binding at v1 must not define it
    const itf = d.registerInterface(10, "wl_surface", 1);
    expect((itf as any).set_buffer_transform).to.be.undefined;
  });

  it("method with since <= bound version is attached", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    const itf = d.registerInterface(10, "wl_surface", 2);
    expect((itf as any).set_buffer_transform).to.be.a("function");
  });

  it("event with since > bound version is undefined in this.events", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    // frame is since=5, opcode=5
    const itf = d.registerInterface(10, "wl_pointer", 4);
    expect(itf.events[5]).to.be.undefined;
  });

  it("event with since <= bound version is present in this.events", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    const itf = d.registerInterface(10, "wl_pointer", 5);
    expect(itf.events[5]).to.deep.include({name: "frame"});
  });

  it("enum with since > bound version is absent from this.enums", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    // dnd_action is since=3 on wl_data_device_manager
    const itf = d.registerInterface(10, "wl_data_device_manager", 2);
    expect(itf.enums["dnd_action"]).to.be.undefined;
  });

  it("enum with since <= bound version is present in this.enums", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    const itf = d.registerInterface(10, "wl_data_device_manager", 3);
    expect(itf.enums["dnd_action"]).to.be.an("array");
  });

  it("inspect() does not show version-gated methods", async function () {
    const d = new MockDisplay();
    await d.load("wayland");
    const itf = d.registerInterface(10, "wl_surface", 1);
    expect(itf.inspect()).to.not.include("set_buffer_transform");
  });
});
