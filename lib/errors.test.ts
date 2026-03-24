import { expect } from "chai";
import { WaylandProtocolError } from "./errors.js";



describe("WaylandProtocolError", function(){
  it("has a name property", function(){
    const e = new WaylandProtocolError("some reason");
    expect(e).to.have.property("name", "WaylandProtocolError");
  });

  it("stringifies properly", function(){
    const e = new WaylandProtocolError("some reason");
    expect(e.toString()).to.equal("WaylandProtocolError: some reason");
  });
});