
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
  description: string;
  summary: string;
  args: ArgumentDefinition[];
}

export interface EventDefinition{
  name: string;
  description: string;
  summary: string;
  args: ArgumentDefinition[];
}

export interface ArgumentDefinition {
  /**Argument name */
  name: string;
  /**Argument type */
  type: ArgumentType;
  /**If the argument is a new_id, name of the interface it creates */
  interface ?:string;
  /** Short summary of the argument's role */
  summary: string;
}


export type ArgumentType = "new_id"| "uint" | "int" | "fixed" | "object" | "enum" | "string";


export interface EnumReduction{
  [key: string]: number;
}