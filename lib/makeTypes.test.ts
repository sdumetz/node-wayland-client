'use strict';
import { expect } from "chai";
import ts from "typescript";

import makeTypes from "./makeTypes.js";
import { InterfaceDefinition } from "./definitions.js";


/** Parse generated source as a .d.ts and return any *syntax* errors. */
function parseErrors(src: string): readonly ts.Diagnostic[] {
  const sf = ts.createSourceFile("generated.d.ts", src, ts.ScriptTarget.Latest, true);
  return (sf as any).parseDiagnostics as ts.Diagnostic[];
}

function def(overrides: Partial<InterfaceDefinition>): InterfaceDefinition {
  return {
    name: "wl_test", version: 1, description: "", summary: "",
    requests: [], events: [], enums: {}, ...overrides,
  };
}

describe("makeTypes()", function () {
  it("produces syntactically valid TypeScript for benign input", function () {
    const out = makeTypes([def({
      summary: "a test interface",
      description: "line one\nline two",
      events: [{ name: "evt", description: "an event", summary: "fired", args: [] }],
      requests: [{ name: "req", description: "a request", summary: "do it", args: [] }],
      enums: { mode: { entries: [{ name: "fast", value: 1, summary: "go fast" }] } },
    })]);
    expect(parseErrors(out)).to.have.length(0);
  });

  it("escapes '*/' in a description so the JSDoc block is not closed early", function () {
    const out = makeTypes([def({ description: "contains */ a comment closer" })]);
    expect(out).to.not.include("contains */");      // raw closer is gone
    expect(out).to.include("contains *\\/");         // escaped form present
    expect(parseErrors(out)).to.have.length(0);
  });

  it("escapes '*/' in a summary", function () {
    const out = makeTypes([def({ summary: "danger */ here" })]);
    expect(out).to.not.include("danger */");
    expect(parseErrors(out)).to.have.length(0);
  });

  it("emits enum summaries as valid string literals (quotes + newlines escaped)", function () {
    const summary = 'has "quotes" and\na newline';
    const out = makeTypes([def({
      enums: { mode: { entries: [{ name: "a", value: 1, summary }] } },
    })]);
    expect(out).to.include(JSON.stringify(summary)); // properly escaped literal
    expect(parseErrors(out)).to.have.length(0);
  });

  it("survives '*/' inside an enum entry summary", function () {
    const out = makeTypes([def({
      enums: { mode: { entries: [{ name: "a", value: 1, summary: "danger */ here" }] } },
    })]);
    expect(parseErrors(out)).to.have.length(0);
  });

  it("escapes a request argument summary containing '*/'", function () {
    const out = makeTypes([def({
      requests: [{
        name: "req", description: "", summary: "",
        args: [{ name: "x", type: "uint", summary: "weird */ summary" }],
      }],
    })]);
    expect(parseErrors(out)).to.have.length(0);
  });
});
