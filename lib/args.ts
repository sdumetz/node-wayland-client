'use strict';
import { endianness } from "os";
import { ArgumentDefinition } from "./definitions.js";


const en = endianness();



/**
 * read an uint32 using native system's endianess
 */
export const readUInt = (b :Buffer, offset :number) :number => ((en == "LE")? b.readUInt32LE : b.readUInt32BE).call(b, offset);

/**
 * write an uint32 using native system's endianess
 */
export const writeUInt = (b :Buffer, value :number, offset :number) :number => ((en == "LE")? b.writeUInt32LE : b.writeUInt32BE).call(b, value, offset);

/**
 * read an int32 using native system's endianess
 */
export const readInt = (b :Buffer, offset :number)=> ((en == "LE")? b.readInt32LE : b.readInt32BE).call(b, offset);

/**
 * write an int32 using native system's endianess
 */
export const writeInt = (b :Buffer, value :number, offset :number) :number => ((en == "LE")? b.writeInt32LE : b.writeInt32BE).call(b, value, offset);

/**
 * write a 24.8 fixed point value.
 */
export function writeFixed(b :Buffer, value :number, offset :number) :number{
  const fixed = Math.round(value * 256);
  const sign = ((fixed < 0) ? 0x80000000 : 0);
  return writeInt(b, sign | Math.abs(fixed), offset);
}

/**
 * Read a 24.8 fixed point value.
 */
export function readFixed(b :Buffer, offset :number) :number{
  const fixed = readInt(b, offset);
  const sign = fixed & (1 << 31);
  const num = fixed & ~(1 << 31);
	return (sign? -1:1) * num / 256;
}

/**
 * 
 */
export function format_args(args:any[], def:ArgumentDefinition[]) :Buffer{
  if(args.length != def.length) throw new Error(`Bad number of arguments (${args.length}, expected ${def.length}).`);

  let argLengths = def.map(({type, name}, index)=>{
    switch(type){
      case "new_id":
      case "uint":
      case "object":
      case "enum":
      case "fixed":
      case "int":
        return 4;
      case "string":
        const arg = args[index];
        if(typeof arg !== "string") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`);
        let strlen = Buffer.byteLength(arg, "utf-8") + 1 /* NULL byte */;
        strlen = ((strlen % 4 != 0)? strlen + 4 - (strlen % 4) : strlen);
        return strlen+4 /* 32 bits uint strlen */;
      default:
        throw new Error(`Unsupported request argument type : ${type}`);
    }
  });

  let b = Buffer.alloc(argLengths.reduce((a, s)=>a+s, 0));

  //Arguments
  let offset = 0;
  for(let i = 0; i < args.length; i++){
    let arg = args[i];
    const {type, name} = def[i];
    switch(type){
      case "object":
        if(typeof arg == "object" && typeof arg?.id === "number") arg = arg.id;
      case "new_id":
      case "uint":
        if(typeof arg != "number") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`);
        if( Number.isNaN(arg) || arg < 0) throw new Error(`Invalid ${type} value: ${arg}`);
        writeUInt(b, arg, offset);
        offset += 4;
        break;
      case "fixed":
        writeFixed(b, arg, offset);
        offset += 4;
      case "int":
        if(typeof arg != "number") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`)
        if(Number.isNaN(arg)) throw new Error("Invalid int value: "+ arg);
        writeInt(b, arg, offset);
        offset += 4;
        break;
      case "string":
        const strlen =  Buffer.byteLength(arg, "utf-8")+1;
        writeUInt(b, strlen, offset);
        b.write(arg+'\x00', offset + 4, "utf-8");
        offset += argLengths[i]; //account for 32bits padding when necessary
        break;
      default:
        throw new Error(`Unsupported request argument type : ${type}`);
    }
  }
  return b;
}
/**
 * @returns the parsed values with correct types. Better types might be inferred
 */
export function get_args(b :Buffer, defs :ArgumentDefinition[]) :any[]{
  const values = [];
  let offset = 0;

  for(let arg of defs){
    switch(arg.type){
      case "new_id":
      case "uint":
      case "object":
      case "enum":
        values.push(readUInt(b, offset));
        offset += 4;
        break;
      case "int":
        values.push(readInt(b, offset));
        offset += 4;
        break;
      case "string":
        let nLength = readUInt(b, 4);
        offset +=4;
        values.push(b.slice(offset, nLength+offset-1).toString("utf-8").replace(/\x00+$/, ""));
        offset += ((nLength % 4 != 0)? nLength + 4 - (nLength % 4) : nLength);
        break;
      case "fixed":
        values.push(readFixed(b, offset));
        offset += 4;
        break;
      default:
        throw new Error(`Unsupported event argument type : ${arg.type}`);
    }
  }

  return values;
}