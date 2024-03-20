
import { format_args, readUInt, readFixed, writeFixed, writeUInt } from "./args.js";
import { expect } from "chai";
import { ArgumentDefinition, ArgumentType } from "./definitions.js";


describe("Buffer read/write", function(){
  it("reads an unsigned integer", function(){
    const b = Buffer.alloc(4);
    expect(readUInt(b, 0)).to.equal(0);
  });

  describe("fixed-points", function(){
    this.bail();
    [
      //Those hex values and correspondances were verified through wayland queries dump 
      [0x0100,      1],
      [0x80000100, -1],
      [0x0180,      1.5],
    ].forEach(([hex, value])=>{
      const b = Buffer.alloc(4);
      it(`read 0x${hex.toString(16)} as ${value}`, function(){
        writeUInt(b, hex, 0); // 1.00000000
        expect(readFixed(b, 0)).to.equal(value);
      });
      it(`write ${value} as 0x${hex.toString(16)}`, function(){
        writeFixed(b, value, 0);
        expect(readUInt(b, 0)).to.equal(hex);
      });
    });

  });
});

describe("format_args()", function() {
  it("should throw an error if the number of arguments is incorrect", function() {
    const args = [1, 2, 3];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "uint" }, { name: "arg2", type: "uint" }];
    expect(() => format_args(args, def)).to.throw(Error, "Bad number of arguments (3, expected 2).");
  });

  it("encodes uint arguments", function() {
    const args = [1, 2];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "uint" }, { name: "arg2", type: "uint" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(8);
  });

  it("encodes new_id arguments", function() {
    const args = [3];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "new_id" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(4);
    expect(readUInt(buffer, 0)).to.equal(3);
  });

  it("encodes object arguments", function() {
    const args = [3];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "object" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(4);
    expect(readUInt(buffer, 0)).to.equal(3);
  });

  [
    "int",
    "uint",
    "fixed",
    "string"
  ].forEach((type)=>{
    [undefined, null, {}].forEach((arg)=>{
      it(`throw if an argument for ${type} is ${arg}`, function(){
        const args = [arg];
        const def :ArgumentDefinition[] = [{ name: "arg1", type: type as ArgumentType}];
        expect(()=> format_args(args, def)).to.throw(`Invalid type: ${typeof arg} for arg1. Expected a ${type}`);
      });
    });
  });

  it("throw if an argument for int is a string", function(){
    const args = ["1"];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "int" }];
    expect(()=> format_args(args, def)).to.throw("Invalid type: string for arg1. Expected a int");
  });

  it("throw if an argument for uint is a string", function(){
    const args = ["1"];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "int" }];
    expect(()=> format_args(args, def)).to.throw("Invalid type: string for arg1. Expected a int");
  });

  it("accepts interface objects as object arguments", function(){
    let itfMock = {id: 3};
    let def :ArgumentDefinition[] = [{ name: "arg1", type: "object" }];
    expect(format_args([itfMock], def).toString("hex")).to.equal("03000000");
  });


  it("thow an error if NaN", function() {
    const args = [Number.NaN];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "new_id" }];
    expect(()=>format_args(args, def)).to.throw("Invalid new_id value: NaN");
  });

  it("prefixes byteLength to strings", function() {
    const args = ["he"];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "string" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(8);
    expect(readUInt(buffer, 0)).to.equal(3 /* NULl byte is accounted-for */);
  });

  it("should return append NULL and pad to 32bits length strings", function() {
    const args = ["hello"];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "string" }];
    const buffer = format_args(args, def);
    //Hello is of length 5, + null byte + 3 bytes padding
    expect(buffer.length).to.equal(12);
  });

  it("throw on unsupported argument type", function() {
    //Ensure we throw properly on anything unexpected
    expect(()=>{
      format_args([1], [{ name: "arg1", type: "foo" } as any]);
    }).to.throw();
  });
  
});