import {
  format_args,
  readUInt,
  readFixed,
  writeFixed,
  writeUInt,
  readInt,
  get_args,
  writeInt,
} from "./args.js";
import { expect } from "chai";
import { ArgumentDefinition, ArgumentType } from "./definitions.js";


describe("Buffer read/write", function(){
  it("reads an unsigned integer", function(){
    const b = Buffer.alloc(4);
    expect(readUInt(b, 0)).to.equal(0);
  });
  describe("read / write fixed-points", function(){
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

  ["LE", "BE"].forEach((en)=>{
    it(`works in ${en == "LE"? "Little":"Big"} Endian systems`, function(){
      let b = Buffer.alloc(4);
      writeUInt(b, 1, 0, en as any);
      expect(readUInt(b, 0, en as any)).to.equal(1);

      
      writeInt(b, -1, 0, en as any);
      expect(readInt(b, 0, en as any)).to.equal(-1);

      writeFixed(b, 1.5, 0, en as any);
      expect(readFixed(b, 0, en as any)).to.equal(1.5);
    });
  });

});

describe("format_args()", function() {
  it("throws if the number of arguments is incorrect", function() {
    const args = [1, 2, 3];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "uint" }, { name: "arg2", type: "uint" }];
    expect(() => format_args(args, def)).to.throw(Error, "Bad number of arguments (3, expected 2).");
  });
  
  it("throws if argument type is unknown or unsupported", function(){
    expect(()=>format_args([1], [{ name: "arg1", type: "foo" } as any])).to.throw(`Unsupported request argument type : foo`);
    //fd exists but is not supported
    expect(()=>format_args([1], [{ name: "arg1", type: "fd" } as any])).to.throw(`Unsupported request argument type : fd`);
  });


  it("encodes uint arguments", function() {
    const args = [1, 2];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "uint" }, { name: "arg2", type: "uint" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(8);
    expect(readUInt(buffer, 0)).to.equal(1);
    expect(readUInt(buffer, 4)).to.equal(2);
  });

  it("encodes int arguments", function() {
    const args = [-1, 1];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "int" }, { name: "arg2", type: "int" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(8);
    expect(readInt(buffer, 0)).to.equal(-1);
    expect(readInt(buffer, 4)).to.equal(1);
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

  it("encodes enum argument", function(){
    const args = [3];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "enum" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(4);
    expect(readUInt(buffer, 0)).to.equal(3);
  });

  it("encodes fixed argument", function(){
    const args = [3.5];
    const def :ArgumentDefinition[] = [{ name: "arg1", type: "fixed" }];
    const buffer = format_args(args, def);
    expect(buffer.length).to.equal(4);
    expect(readFixed(buffer, 0)).to.equal(3.5);
  });

  it("encodes empty array argument", function () {
    const args = [new Uint8Array([])];
    const def: ArgumentDefinition[] = [{ name: "arg1", type: "array" }];
    const buffer = format_args(args, def);
    expect(buffer.toString("hex")).to.equal("00000000");
  });

  it("encodes array argument", function () {
    const args = [new Uint8Array([5, 4, 3])];
    const def: ArgumentDefinition[] = [{ name: "arg1", type: "array" }];
    const buffer = format_args(args, def);
    expect(buffer.toString("hex")).to.equal("0300000005040300");
  });

  [
    "int",
    "uint",
    "fixed",
    "enum",
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

  ["int", "uint", "object", "enum", "fixed"].forEach((type)=>{
    it(`thow an error if ${type} is NaN`, function() {
      const args = [Number.NaN];
      const def :ArgumentDefinition[] = [{ name: "arg1", type: type as any }];
      expect(()=>format_args(args, def)).to.throw(`Invalid ${type} value: NaN`);
    });
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


describe("get_args()", function(){
  ["uint", "int", "object", "new_id", "enum"].forEach((type)=>{
    it(`get ${type} argument`, function(){
      const b = Buffer.alloc(4);
      writeUInt(b, 1, 0);
      expect(get_args(b, [{ name: "arg1", type: type as any }])).to.deep.equal([1]);
    });
  });

  it(`get string argument`, function(){
    const b = format_args(["hello world"], [{ name: "arg1", type: "string" }])
    expect(get_args(b, [{ name: "arg1", type: "string" }])).to.deep.equal(["hello world"]);
  });

  it("parse empty array", function () {
    const b = Buffer.alloc(32);
    b.write("00000000", "hex");
    expect(get_args(b, [{ name: "arg1", type: "array" }])).to.deep.equal([
      new Uint8Array([]),
    ]);
  });

  it("parse array", function () {
    const b = Buffer.alloc(32);
    b.write("030000000102ff00", "hex");
    expect(get_args(b, [{ name: "arg1", type: "array" }])).to.deep.equal([
      new Uint8Array([1, 2, 255]),
    ]);
  });

  it(`get fixed argument`, function(){
    const b = Buffer.alloc(4);
    writeFixed(b, 1.5, 0);
    expect(get_args(b, [{ name: "arg1", type: "fixed" }])).to.deep.equal([1.5]);
  });

  it("throws on bad definition", function(){
    expect(()=> get_args(Buffer.alloc(4), [{ name: "arg1", type: "foo" } as any])).to.throw("Unsupported event argument type : foo");
  });

  it("pads strings length only if necessary", function(){
    const b = format_args(["size 8 s"], [{ name: "arg1", type: "string" }])
    expect(get_args(b, [{ name: "arg1", type: "string" }])).to.deep.equal(["size 8 s"]);

  });
})
