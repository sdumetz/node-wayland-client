
import { ElementCompact } from "xml-js";

type Element = ElementCompact;

export interface InterfaceElement extends ElementCompact{
  _attributes: {
    name: string;
    version: string;
    description: string;
    summary: string;
    request:Element|Element[];
    event:Element|Element[];
    enum?:Element[];
  }
}