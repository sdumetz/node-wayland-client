import { expect } from "chai";
import { isCallbackArgument, isCallbackRequest, isDestructorRequest, isInterfaceArgument, isInterfaceCreationRequest, wl_arg_as_number } from "./definitions.js";


const badValues :any[] = [
  null,
  undefined,
  {}
];

describe("definitions", function(){
  describe("isInterfaceArgument", function(){
    badValues.forEach((arg)=>{
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
    badValues.forEach((arg)=>{
      it(`returns false when given ${arg}`, function(){
        expect(isCallbackArgument(arg as any)).to.be.false;
      });
    });

    it("returns true for a new_id argument", function(){
      expect(isCallbackArgument({name: "foo", type: "new_id", interface: "wl_callback"})).to.be.true;
    });
    
  });

  describe("isCallbackRequest", function(){
    badValues.forEach((req)=>{
      it(`returns false when given ${req}`, function(){
        expect(isCallbackRequest(req as any)).to.be.false;
      });
    });

    it("returns true if the first argument is a callback", function(){
      expect(isCallbackRequest({name: "some_callback", description: "", summary: "", args: [{name: "foo", type: "new_id", interface: "wl_callback"}]})).to.be.true;
    });
  });

  describe("isInterfaceCreationRequest", function(){
    badValues.forEach((req)=>{
      it(`returns false when given ${req}`, function(){
        expect(isInterfaceCreationRequest(req as any)).to.be.false;
      });
    });

    it("returns true if the first argument is a new_id", function(){
      expect(isInterfaceCreationRequest({name: "some_interface", description: "", summary: "", args: [{name: "foo", type: "new_id", interface: "some_interface"}]})).to.be.true;
    });
  });

  describe("isDestructorRequest", function(){
    badValues.forEach((req)=>{
      it(`returns false when given ${req}`, function(){
        expect(isDestructorRequest(req as any)).to.be.false;
      });
    });

    it("returns true if the type is 'destructor'", function(){
      expect(isDestructorRequest({name: "some request", description: "", summary: "", args: [], type: "destructor"})).to.be.true;
    });
  });

  describe("wl_arg_as_number", function(){
    it("checks type of argument", function(){
      expect(()=>wl_arg_as_number("foo")).to.throw("Invalid argument type :");
      expect(wl_arg_as_number(1)).to.equal(1);
      expect(wl_arg_as_number(0)).to.equal(0);
      expect(wl_arg_as_number(-1)).to.equal(-1);
    });
  });
});