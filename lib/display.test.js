'use strict';
import path from "path";
import { fileURLToPath } from 'url';

import {expect} from "chai";

import Display from "./display.js";


const thisDir = path.dirname(fileURLToPath(import.meta.url));

describe("class Display", function(){
  /** @type {import("node:net").Socket} */
  // @ts-ignore
  const sMock = {
    // @ts-ignore
    on(){},
  };

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
})