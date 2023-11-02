import { parseArg, parseEnums, parseInterface, parseRequest } from "./parse.js";
import {expect} from "chai";

describe("parsers", function(){
  describe("parseArg()", function(){
    it("parse simple argument", function(){
      const arg =  {
        "_attributes": {
          "name": "callback",
          "type": "new_id",
          "interface": "wl_callback",
          "summary": "callback object for the sync request"
        }
      };
      expect(parseArg(arg)).to.deep.equal({
        summary: "callback object for the sync request",
        name: "callback",
        type: "new_id",
        interface: "wl_callback",
      });
    })
  });

  describe("parseRequest()", function(){
    it("parse simple request", function(){
      expect(parseRequest({
        "_attributes": {
          "name": "sync"
        },
        "description": {
          "_attributes": {
            "summary": "asynchronous roundtrip"
          },
          "_text": "the description"
        },
        "arg": {
          "_attributes": {
            "name": "callback",
            "type": "new_id",
            "interface": "wl_callback",
            "summary": "arg_summary"
          }
        }
      })).to.deep.equal({
        name: "sync",
        description: "the description",
        summary: "asynchronous roundtrip",
        args:[{
          name:"callback",
          type:"new_id",
          interface: "wl_callback",
          summary: "arg_summary"
        }]
      });
    });
  });

  describe("parseInterface()", function(){
    const def = {
      "_attributes": {
        "name": "wl_callback",
        "version": "1"
      },
      "description": {
        "_attributes": {
          "summary": "callback object"
        },
        "_text": "\n      Clients can handle the 'done' event to get notified when\n      the related request is done.\n    "
      },
      "event": {
        "_attributes": {
          "name": "done",
          "type": "destructor"
        },
        "description": {
          "_attributes": {
            "summary": "done event"
          },
          "_text": "\n\tNotify the client when the related request is done.\n      "
        },
        "arg": {
          "_attributes": {
            "name": "callback_data",
            "type": "uint",
            "summary": "request-specific data for the callback"
          }
        }
      }
    };

    it("parse simple interface", function(){
      const itf = parseInterface(def);
      expect(itf).to.be.an("object");
      expect(itf).to.have.property("name", "wl_callback");
      expect(itf).to.have.property("version").a("number").equal(1);
    })
  })

  describe("parseEnum()", function(){
    it("parse simple enumeration", function(){
      expect(parseEnums({
        _attributes: { name: 'error' },
        entry: {
          _attributes: {
            name: 'bad_surface',
            value: '0',
            summary: 'wl_surface is not a sibling or the parent'
          }
        }
      })).to.deep.equal({
        error: [{
          name: "bad_surface",
          value: 0,
          summary: "wl_surface is not a sibling or the parent",
        }]
      });
    });
  });
})