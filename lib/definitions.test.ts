import { expect } from "chai";
import { isCallbackArgument, isInterfaceArgument } from "./definitions.js";



describe("definitions", function(){
  describe("isInterfaceArgument", function(){
    [
      null,
      undefined,
      {}
    ].forEach((arg)=>{
      it(`returns false when given ${arg}`, function(){
        expect(isInterfaceArgument(arg as any)).to.be.false;
      });
    });

    it("returns true for a new_id argument", function(){
      expect(isInterfaceArgument({name: "foo", type: "new_id"})).to.be.true;
    });

    it("returns true if argument is a callback", function(){
      expect(isCallbackArgument({name: "foo", type: "new_id", interface: "wl_callback"})).to.be.true;
    });

  });

  describe("isCallbackArgument", function(){
    [
      null,
      undefined,
      {}
    ].forEach((arg)=>{
      it(`returns false when given ${arg}`, function(){
        expect(isCallbackArgument(arg as any)).to.be.false;
      });
    });

    it("returns true for a new_id argument", function(){
      expect(isCallbackArgument({name: "foo", type: "new_id", interface: "wl_callback"})).to.be.true;
    });
    
  });
});