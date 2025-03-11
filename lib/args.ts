'use strict';
import { endianness } from "os";
import { ArgumentDefinition, ArgumentType } from "./definitions.js";


const os_en = endianness();



/**
 * read an uint32 using native system's endianess
 */
export const readUInt = (b :Buffer, offset :number, en:"LE"|"BE" = os_en) :number => ((en == "LE")? b.readUInt32LE : b.readUInt32BE).call(b, offset);

/**
 * write an uint32 using native system's endianess
 */
export const writeUInt = (b :Buffer, value :number, offset :number, en:"LE"|"BE" = os_en) :number => ((en == "LE")? b.writeUInt32LE : b.writeUInt32BE).call(b, value, offset);

/**
 * read an int32 using native system's endianess
 */
export const readInt = (b :Buffer, offset :number, en:"LE"|"BE" = os_en)=> ((en == "LE")? b.readInt32LE : b.readInt32BE).call(b, offset);

/**
 * write an int32 using native system's endianess
 */
export const writeInt = (b :Buffer, value :number, offset :number, en:"LE"|"BE" = os_en) :number => ((en == "LE")? b.writeInt32LE : b.writeInt32BE).call(b, value, offset);

/**
 * write a 24.8 fixed point value.
 */
export function writeFixed(b :Buffer, value :number, offset :number, en:"LE"|"BE" = os_en) :number{
  const fixed = Math.round(value * 256);
  const sign = ((fixed < 0) ? 0x80000000 : 0);
  return writeInt(b, sign | Math.abs(fixed), offset, en);
}

/**
 * Read a 24.8 fixed point value.
 */
export function readFixed(b :Buffer, offset :number, en:"LE"|"BE" = os_en) :number{
  const fixed = readInt(b, offset, en);
  const sign = fixed & (1 << 31);
  const num = fixed & ~(1 << 31);
	return (sign? -1:1) * num / 256;
}

/**
 * Read a wl_array (length-prefixed byte array).
 * @return parsed array from the buffer and the offset plus the number of bytes read.
 */
export function readArray(
  b: Buffer,
  offset: number,
  en: "LE" | "BE" = os_en,
): [data: Uint8Array, newOffset: number] {
  const arrayLength = readUInt(b, offset, en);
  offset += 4;
  const arrayData = new Uint8Array(b.subarray(offset, offset + arrayLength));
  return [arrayData, offset + arrayLength];
}

/**
 * Write a Uint8Array to a buffer as a wl_array (padded to 4 byte alignment).
 * @return `offset` plus the number of bytes written.
 */
export function writeArray(
  b: Buffer,
  array: Uint8Array,
  offset: number,
  en: "LE" | "BE" = os_en,
): number {
  offset = writeUInt(b, array.length, offset, en);
  b.set(array, offset);
  const padding = (4 - (array.length % 4)) % 4;
  if (padding > 0) {
    b.fill(0, offset + array.length, offset + array.length + padding);
  }
  return offset + array.length + padding;
}

export function format_args(args:any[], def:ArgumentDefinition[]) :Buffer{
  if(args.length != def.length) throw new Error(`Bad number of arguments (${args.length}, expected ${def.length}).`);

  let argLengths = def.map(({ type, name }, index) => {
    const arg = args[index];
    switch (type) {
      case "object":
        let id:number = (typeof arg === "object")?arg?.id : arg;
        if((typeof id !== "number")){
          throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a number or an object with a numeric ID`);
        }else if( !Number.isInteger(id) || id <= 0){
          throw new Error(`Invalid ${type} value: ${id} (expect a positive integer)`);
        }
        return 4;
      case "enum":
      case "new_id":
      case "uint":
        if(typeof arg != "number") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`);
        if( Number.isNaN(arg) || arg < 0) throw new Error(`Invalid ${type} value: ${arg}`);
        return 4;
      case "fixed":
        if(typeof arg != "number") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`)
        if( Number.isNaN(arg)) throw new Error(`Invalid ${type} value: ${arg}`);
        return 4;
      case "int":
        if(typeof arg != "number") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`)
        if(Number.isNaN(arg)) throw new Error("Invalid int value: "+ arg);
        return 4;
      case "string":
        if(typeof arg !== "string") throw new Error(`Invalid type: ${typeof arg} for ${name}. Expected a ${type}`);
        let strlen = Buffer.byteLength(arg, "utf-8") + 1 /* NULL byte */;
        strlen = ((strlen % 4 != 0)? strlen + 4 - (strlen % 4) : strlen);
        return strlen+4 /* 32 bits uint strlen */;
      case "array":
        if (!(arg instanceof Uint8Array)){
          throw new Error(
            `Invalid type: ${typeof arg === "object"? arg.constructor.name: typeof arg} for ${name}. Expected a ${type}`,
          );
        }

        // 4 bytes for the length, and the length is padded to 4 bytes
        return 4 + arg.length + ((4 - (arg.length % 4)) % 4);
      default:
        break; //Proceed to throw
    }
    throw new Error(`Unsupported request argument type : ${type}`);
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
      case "enum":
      case "new_id":
      case "uint":
        writeUInt(b, arg, offset);
        offset += 4;
        break;
      case "fixed":
        writeFixed(b, arg, offset);
        offset += 4;
        break;
      case "int":
        writeInt(b, arg, offset);
        offset += 4;
        break;
      case "string":
        const strlen =  Buffer.byteLength(arg, "utf-8")+1;
        writeUInt(b, strlen, offset);
        b.write(arg+'\x00', offset + 4, "utf-8");
        offset += argLengths[i]; //account for 32bits padding when necessary
        break;
      case "array":
        offset = writeArray(b, arg, offset);
        break;
      /* c8 ignore next 2*/
      default: /* Will never get called unless we missed some case in lengths pre-parsing */
        throw new Error(`Unsupported request argument type : ${type}`);
    }
  }
  return b;
}
/**
 * Parses a buffer into an array of values, using the arguments definition.
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
      case "array":
        const [arrayData, newOffset] = readArray(b, offset);
        values.push(arrayData);
        offset = newOffset;
        break;
      default:
        throw new Error(`Unsupported event argument type : ${arg.type}`);
    }
  }

  return values;
}