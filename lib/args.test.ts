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

  it("encodes file descriptor arguments", function(){
    const args = [31];
    const def: ArgumentDefinition[]= [{name: "fd1", type: "fd"}];
    const buffer = format_args(args, def);
    expect(buffer).to.have.length(0);
  });


  it("throw argument for array is not an UInt8Array", function () {
    const def: ArgumentDefinition[] = [{ name: "arg1", type: "array" }];
    expect(()=>format_args([[5, 4, 3]], def)).to.throw(`Invalid type: Array for arg1`);
    expect(()=>format_args([1], def)).to.throw(`Invalid type: number for arg1`);
    expect(()=>format_args(["foo"], def)).to.throw(`Invalid type: string for arg1`);
    expect(()=>format_args([undefined], def)).to.throw(`Invalid type: undefined for arg1`);
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
  it("throw if object interface has no id", function(){
    let itfMock = {foo:"bar"};
    let def :ArgumentDefinition[] = [{ name: "arg1", type: "object" }];
    expect(()=>format_args([itfMock], def)).to.throw("Invalid type: object for arg1. Expected a number or an object with a numeric ID")
  });

  it("throw if object interface has invalid ID type", function(){
    let itfMock = {id: "3"};
    let def :ArgumentDefinition[] = [{ name: "arg1", type: "object" }];
    expect(()=>format_args([itfMock], def)).to.throw("Invalid type: object for arg1. Expected a number or an object with a numeric ID");
  });

  it("throw if object interface has invalid IDvalue", function(){
    let def :ArgumentDefinition[] = [{ name: "arg1", type: "object" }];
    expect(()=>format_args([{id: -1}], def)).to.throw("Invalid object value: -1");

    expect(()=>format_args([{id: 0}], def)).to.throw("Invalid object value: 0")
  });



  ["int", "uint", "object", "enum", "fixed"].forEach((type)=>{
    it(`throw if ${type} is NaN`, function() {
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
    const d1 :ArgumentDefinition[]= [{ name: "arg1", type: "string" }];
    let b = format_args(["hello world"], d1)
    expect(get_args(b, [{ name: "arg1", type: "string" }])).to.deep.equal(["hello world"]);
    
    const d2 :ArgumentDefinition[] =  [{name:"arg1", type:"int"}, { name: "arg2", type: "string" }];
    b = format_args([1, "hello world"], d2);
    expect(get_args(b, d2)).to.deep.equal([1, "hello world"]);
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

  it("get fd argument", function(){
    //fd is a dummy argument: the descriptor is passed as ancillary data
    expect(get_args(Buffer.alloc(0), [{ name: "arg1", type: "fd" }])).to.deep.equal([-1]);
  })

  it("throws on bad definition", function(){
    expect(()=> get_args(Buffer.alloc(4), [{ name: "arg1", type: "foo" } as any])).to.throw("Unsupported event argument type : foo");
  });

  it("pads strings length only if necessary", function(){
    const b = format_args(["size 8 s"], [{ name: "arg1", type: "string" }])
    expect(get_args(b, [{ name: "arg1", type: "string" }])).to.deep.equal(["size 8 s"]);

  });

  it("parses wl_display errors", function(){
    const def :ArgumentDefinition<ArgumentType>[] =  [
      {
        name: 'object_id',
        type: 'object',
        summary: 'object where the error occurred'
      },
      { name: 'code', type: 'uint', summary: 'error code' },
      { name: 'message', type: 'string', summary: 'error description' }
    ];
    const message = "Error message string";
    const strlen = Buffer.byteLength(message) +1 /*NULL byte*/;
    //32bits-aligned
    const len = ((strlen % 4 != 0)? strlen + 4 - (strlen % 4) : strlen)
    const b = Buffer.alloc(4+4+ 4 + len );
    b.writeUInt32LE(0x05) //Interface ID
    b.writeUInt32LE(1, 4);
    b.writeUInt32LE(strlen, 8);
    b.write(message+'\x00', 12, 'utf8');

    const args = get_args(b, def);
    expect(args).to.deep.equal([
      0x05,
      1,
      message,
    ]);
  })
})
