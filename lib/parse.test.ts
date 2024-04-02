import { InterfaceElement } from "./elements.js";
import { parseArg, parseEnums, parseEvent, parseInterface, parseRequest } from "./parse.js";
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
    });
    it("parse minimal argument", function(){
      //Remove optional fields
      const arg =  {
        "_attributes": {
          "name": "foo",
          "type": "int",
        }
      };
      expect(parseArg(arg)).to.deep.equal({
        name: "foo",
        type: "int",
      });
    });
    it("throw if arg has no name", function(){
      const arg =  {
        "_attributes": {
          "type": "new_id",
          "interface": "wl_callback",
          "summary": "callback object for the sync request"
        }
      };
      expect(()=>parseArg(arg)).to.throw("Argument has no name");
    });
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

    it("throws if request has no name", function(){
      expect(()=>parseRequest({
        "_attributes": {
        },
        "description": {
          "_attributes": {
            "summary": "asynchronous roundtrip"
          },
          "_text": "the description"
        },
        "arg": {}
      })).to.throw("Request has no name")
    })
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
      const itf = parseInterface(def as any);
      expect(itf).to.be.an("object");
      expect(itf).to.have.property("name", "wl_callback");
      expect(itf).to.have.property("version").a("number").equal(1);
    });

    it("accepts version as a number", function() {
      const itf = parseInterface({...def,
        "_attributes": {
          "name": "wl_callback",
          "version": 1
        }
      } as any);
      expect(itf).to.be.an("object");
      expect(itf).to.have.property("version").a("number").equal(1);
    });
    
    it("rejects invalid version", function(){
      expect(()=>parseInterface({...def,
        "_attributes": {
          "name": "wl_callback",
          "version": "x"
        }
      } as any)).to.throw("Invalid version x for interface wl_callback");
    });
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
    it("throw if enum has no name", function(){
      expect(()=>parseEnums({
        _attributes: {},
        entry: {
          _attributes: {
            name: 'bad_surface',
            value: '0',
            summary: 'wl_surface is not a sibling or the parent'
          }
        }
      })).to.throw("Enum has no name")
    });

    it("throw if enum member has no name", function(){
      expect(()=>parseEnums({
        _attributes: { name: 'error' },
        entry: {
          _attributes: {
            value: '0',
          }
        }
      })).to.throw("Enum member has no name")
    });
    it("throw if enum member has no value", function(){
      expect(()=>parseEnums({
        _attributes: { name: 'error' },
        entry: {
          _attributes: {
            name: 'bad_surface',
          }
        }
      })).to.throw("Enum member has no value")
    });
  });

  describe("parseEvent()", function(){
    it("parse simple event", function(){
      expect(parseEvent({
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
      })).to.deep.equal({
        name: "done",
        description: "\n\tNotify the client when the related request is done.\n      ",
        summary: "done event",
        args: [{
          name: "callback_data",
          type: "uint",
          summary: "request-specific data for the callback"
        }]
      });
    });
    it("throw if event has no name", function(){
      expect(()=>parseEvent({
        "_attributes": {
          "type": "destructor"
        },
        "arg": {}
      })).to.throw("event has no name");
    });
  });
})