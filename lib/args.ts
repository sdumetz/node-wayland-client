'use strict';
import { endianness } from "os";
import { ArgumentDefinition, wl_arg } from "./definitions.js";


// The Wayland wire protocol always uses the host's native byte order (client
// and server share the machine over a unix socket). Resolve the right Buffer
// methods once, at module load, rather than branching on every read/write.
const LE = endianness() === "LE";

type Reader = (b :Buffer, offset :number) => number;
type Writer = (b :Buffer, value :number, offset :number) => number;

/** read an uint32 in host byte order */
export const readUInt :Reader = LE
  ? (b, offset) => b.readUInt32LE(offset)
  : (b, offset) => b.readUInt32BE(offset);

/** write an uint32 in host byte order. @returns the offset past the written value */
export const writeUInt :Writer = LE
  ? (b, value, offset) => b.writeUInt32LE(value, offset)
  : (b, value, offset) => b.writeUInt32BE(value, offset);

/** read an int32 in host byte order */
export const readInt :Reader = LE
  ? (b, offset) => b.readInt32LE(offset)
  : (b, offset) => b.readInt32BE(offset);

/** write an int32 in host byte order. @returns the offset past the written value */
export const writeInt :Writer = LE
  ? (b, value, offset) => b.writeInt32LE(value, offset)
  : (b, value, offset) => b.writeInt32BE(value, offset);

/**
 * Write a 24.8 signed fixed point value (wl_fixed_t).
 *
 * wl_fixed_t is a plain two's-complement `int32_t` holding `value * 256`
 * (see wayland-util.h: `wl_fixed_from_int(i) = i * 256`). It is NOT a
 * sign-magnitude number, so negative values must use the regular int32
 * representation (e.g. -1.0 -> -256 -> 0xFFFFFF00 on the wire).
 */
export function writeFixed(b :Buffer, value :number, offset :number) :number{
  return writeInt(b, Math.round(value * 256), offset);
}

/**
 * Read a 24.8 signed fixed point value (wl_fixed_t).
 * @see writeFixed
 */
export function readFixed(b :Buffer, offset :number) :number{
  return readInt(b, offset) / 256;
}

/**
 * Read a wl_array (length-prefixed byte array).
 * @return parsed array from the buffer and the offset plus the number of bytes read.
 */
export function readArray(
  b: Buffer,
  offset: number,
): [data: Uint8Array, newOffset: number] {
  const arrayLength = readUInt(b, offset);
  offset += 4;
  const arrayData = new Uint8Array(b.subarray(offset, offset + arrayLength));
  const padding = (4 - (arrayLength % 4)) % 4;
  return [arrayData, offset + arrayLength + padding];
}

/**
 * Write a Uint8Array to a buffer as a wl_array (padded to 4 byte alignment).
 * @return `offset` plus the number of bytes written.
 */
export function writeArray(
  b: Buffer,
  array: Uint8Array,
  offset: number,
): number {
  offset = writeUInt(b, array.length, offset);
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
      case "fd":
        return 0;
      default:
        break; //Proceed to throw
    }
    throw new Error(`Unsupported request argument type : ${type}`);
  });

  let b = Buffer.allocUnsafe(argLengths.reduce((a, s)=>a+s, 0));

  //Arguments
  let offset = 0;
  for(let i = 0; i < args.length; i++){
    let arg = args[i];
    const {type} = def[i];
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
        // Zero the alignment padding: the body is allocUnsafe'd, so the bytes
        // between the NUL terminator and the 32-bit boundary would otherwise
        // leak uninitialised heap memory onto the wire.
        b.fill(0, offset + 4 + strlen, offset + argLengths[i]);
        offset += argLengths[i]; //account for 32bits padding when necessary
        break;
      case "array":
        offset = writeArray(b, arg, offset);
        break;
      case "fd":
        break;
      /* c8 ignore next 2*/
      default: /* Will never get called unless we missed some case in lengths pre-parsing */
        throw new Error(`Unsupported request argument type : ${type}`);
    }
  }
  /* c8 ignore next Since we used allocUnsafe, verify that we wrote the entire buffer. This should never be true unless we have a critical bug */
  if(offset != b.byteLength) throw new Error(`misaligned write: buffer is ${b.byteLength} bytes but we wrote ${offset} bytes`);
  return b;
}
/**
 * Parses a buffer into an array of values, using the arguments definition.
 * @returns the parsed values with correct types. Better types might be inferred
 */
export function get_args<T extends ArgumentDefinition[]>(b :Buffer, defs :T) :wl_arg[]{
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
        let nLength = readUInt(b, offset);
        offset +=4;
        values.push(b.subarray(offset, nLength+offset -1).toString("utf-8").replace(/\x00+$/, ""));
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
      case "fd":
        //fd arguments are a placeholder of size 0, received as ancillary data
        //Push -1 (bad FD) and expect it to be replaced by the actual data if supported
        values.push(-1);
        break;
      default:
        throw new Error(`Unsupported event argument type : ${arg.type}`);
    }
  }

  return values;
}