
export interface InterfaceDefinition{
  name: string;
  version: number;
  description: string;
  summary: string;
  requests: RequestDefinition[];
  events: EventDefinition[];
  enums: Record<string, EnumDefinition>;
}

export interface RequestDefinition{
  name: string;
  type ?:string;
  description: string;
  summary: string;
  args: ArgumentDefinition[];
}

export interface CallbackRequest extends RequestDefinition{
  args: [CallbackArgument, ...ArgumentDefinition[]];
}

export function isCallbackRequest(req: RequestDefinition): req is CallbackRequest{
  return req?.args?.length > 0 && isCallbackArgument(req.args[0]);
}

export interface InterfaceCreationRequest extends RequestDefinition{
  args: [InterfaceArgument, ...ArgumentDefinition[]];
}

export function isInterfaceCreationRequest(req: RequestDefinition): req is InterfaceCreationRequest{
  return req?.args?.length > 0 && isInterfaceArgument(req.args[0]);
}

export interface DestructorRequest extends RequestDefinition{
  type: "destructor";
  args: [];
}

export function isDestructorRequest(req: RequestDefinition): req is DestructorRequest{
  return req?.type == "destructor";
}



export interface EventDefinition{
  name: string;
  description: string;
  summary: string;
  args: ArgumentDefinition[];
}



export interface ArgumentDefinition<T = ArgumentType>{
  /**Argument name */
  name: string;
  /**Argument type */
  type: T;
  /**If the argument is a new_id, name of the interface it creates */
  interface ?:string;
  /** 
   * Short summary of the argument's role.
   * In practice it is always present in the protocol files.
   */
  summary?: string;
}

export interface InterfaceArgument extends ArgumentDefinition<"new_id">{
  interface :string;
}
export interface CallbackArgument extends InterfaceArgument{
  interface: "wl_callback";
}

export function isInterfaceArgument(arg: ArgumentDefinition): arg is InterfaceArgument{
  return arg?.type == "new_id"; 
}

export function isCallbackArgument(arg :ArgumentDefinition): arg is CallbackArgument{
  return arg?.type == "new_id" && arg.interface == "wl_callback"
}

export type EnumDefinition = EnumValue[];

export interface EnumValue{
  name: string;
  value: number;
  summary?: string;
}

export type ArgumentType =
  | "new_id"
  | "uint"
  | "int"
  | "fixed"
  | "object"
  | "enum"
  | "string"
  | "array";

export type wl_new_id = number;
export type wl_uint = number;
export type wl_int = number;
export type wl_fixed = number;
export type wl_object = number;
export type wl_enum = number;
export type wl_string = string;
export type wl_array = Uint8Array;
/**
 * @warning This is not supported as long as there is no solution for fd transfer
 */
export type wl_fd = number;


export interface EnumReduction{
  [key: string]: number;
}