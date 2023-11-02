import {EventEmitter} from "node:events";
import {InterfaceDefinition, EventDefinition, RequestDefinition, EnumDefinition} from "./definitions.d.ts";
import { Display } from "./display.d.ts";




interface AggregateResult{
  [e :string]: number|string|AggregateResult|number[]|string[]|AggregateResult[];
}

export default class Interface extends EventEmitter{
  private #d: Display;
  /** Interface name */
  public name: string;
  /** Interface version number */
  public version: number;
  /**Object ID of this instance */
  public id: number;

  public readonly events: EventDefinition[];
  public readonly requests: RequestDefinition[];
  public readonly enums: Record<string, EnumDefinition>;

  async [r:string]:(...args :any[])=>Promise<Interface>;

  constructor(d:Display, id, def :InterfaceDefinition);

  /**
   * Parse an event's message before emitting it
   * @param evcode event index
   * @param b message body
   */
  emit(evcode :number, b :Buffer):boolean;

  /**
   * Utility function to aggregate all events on this interface over a time period
   * @example:
   * ```js
   * const agg = iface.aggregate();
   * await display.sync();
   * const result = agg();
   * ```
   */
  aggregate(): ()=>AggregateResult;
}
