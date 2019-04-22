const { REQ, OPT, SKP } = require("./flags.js");
const sections = {
    CSL: {
        processor: REQ,
        style: REQ,
        type: "xml"
    },
    KEYS: {
        processor: SKP,
        style: REQ,
        type: "json"
    },
    DESCRIPTION: {
        processor: OPT,
        style: OPT,
        type: "string"
    },
    INPUT: {
        processor: REQ,
        style: REQ,
        type: "json"
    },
    MODE: {
        processor: REQ,
        style: REQ,
        type: "string"
    },
    RESULT: {
        processor: REQ,
        style: REQ,
        type: "string"
    },
    NAME: {
        processor: REQ,
        style: REQ,
        type: "string"
    },
    PATH: {
        processor: REQ,
        style: REQ,
        type: "string"
    },
    ABBREVIATIONS: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    BIBENTRIES: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    BIBSECTION: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    "CITATION-ITEMS": {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    CITATIONS: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    INPUT2: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    LANGPARAMS: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    MULTIAFFIX: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    OPTIONS: {
        processor: OPT,
        style: SKP,
        type: "json"
    },
    OPTIONZ: {
        processor: OPT,
        style: SKP,
        type: "json"
    }
};
module.exports = sections;
