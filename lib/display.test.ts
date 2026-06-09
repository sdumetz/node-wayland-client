'use strict';
import path from "path";
import { fileURLToPath } from 'url';
import {connect} from "net";

import {expect} from "chai";

import Display from "./display.js";
import { RequestDefinition } from "./definitions.js";


const thisDir = path.dirname(fileURLToPath(import.meta.url));

describe("class Wl_display", function(){
  // @ts-ignore
  const sMock: any = { on(){} };

  describe("protocol loading", function(){
    it("can load a JSON file", async function(){
      const d = new Display(sMock);
      expect(()=>d.getDefinition("wl_display")).to.throw();
      await d.load(path.resolve(thisDir, "../protocol/wayland.json"));
      expect(d.getDefinition("wl_display")).to.be.an("object").to.have.property("name", "wl_display");
    });
  
    it("can load a XML file", async function(){
      const d = new Display(sMock);
      expect(()=>d.getDefinition("wl_display")).to.throw();
      await d.load(path.resolve(thisDir, "../protocol/wayland.xml"));
      expect(d.getDefinition("wl_display")).to.be.an("object").to.have.property("name", "wl_display");
    });
  
    it("XML and JSON loading are equivalent", async function(){
      const [i1, i2] = await Promise.all([
        path.resolve(thisDir, "../protocol/wayland.json"),
        path.resolve(thisDir, "../protocol/wayland.xml")
      ].map(async file =>{
        let d = new Display(sMock);
        await d.load(file);
        return d.getDefinition("wl_display");
      }));
      expect(i1).to.deep.equal(i2)
    });

  });

  describe("getEnum()", function(){
    it("returns a numeric enum mapping for a known interface enum", async function(){
      const d = new Display(sMock);
      await d.load("wayland");
      const e = d.getEnum("wl_display.error");
      expect(e).to.be.an("object");
      expect(e).to.have.property("invalid_object").that.is.a("number");
    });

    it("throws a clear error for an unknown enum on a known interface", async function(){
      const d = new Display(sMock);
      await d.load("wayland");
      expect(()=>d.getEnum("wl_display.nope"))
        .to.throw(/No enum named "nope" in interface "wl_display"/);
    });

    it("throws for an unknown interface", async function(){
      const d = new Display(sMock);
      await d.load("wayland");
      expect(()=>d.getEnum("wl_nonexistent.error"))
        .to.throw(/No interface definition for wl_nonexistent/);
    });

    it("throws when the reference is not of the form <interface>.<enum>", async function(){
      const d = new Display(sMock);
      await d.load("wayland");
      expect(()=>d.getEnum("wl_display")).to.throw(/expected the form/);
    });
  });

  describe("registerInterface()", function(){
    it("throws a clear error when the interface definition was never loaded", function(){
      const d = new Display(sMock);
      expect(()=>d.registerInterface(1, "wl_never_loaded"))
        .to.throw(/Cannot register interface "wl_never_loaded": no protocol definition loaded/);
    });

    it("does not throw a cryptic 'reading map' error", function(){
      const d = new Display(sMock);
      expect(()=>d.registerInterface(1, "wl_never_loaded"))
        .to.not.throw(/Cannot read properties of undefined/);
    });
  });

  describe("request()", function(){
    it("throws for fd arguments", async function(){
      const d = new Display(sMock);
      const fdDef: RequestDefinition = {
        name: "test", description: "", summary: "",
        args: [{ name: "fd", type: "fd", summary: "" }],
      };
      try{
        await d.request(1, 0, fdDef, 5);
        expect.fail("Should have thrown");
      }catch(e: any){
        expect(e.message).to.include("ancillary");
      }
    });
  });

})