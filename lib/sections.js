const sections = {
    ABBREVIATIONS: {
        required: false,
        type: "json"
    },
    BIBENTRIES: {
        required: false,
        type: "json"
    },
    BIBSECTION: {
        required: false,
        type: "json"
    },
    "CITATION-ITEMS": {
        required: false,
        type: "json"
    },
    CITATIONS: {
        required: false,
        type: "json"
    },
    CSL: {
        required: true,
        type: "xml"
    },
    INPUT: {
        required: true,
        type: "json"
    },
    INPUT2: {
        required: false,
        type: "json"
    },
    LANGPARAMS: {
        required: false,
        type: "json"
    },
    MODE: {
        required: true,
        type: "string"
    },
    MULTIAFFIX: {
        required: false,
        type: "json"
    },
    OPTIONS: {
        required: false,
        type: "json"
    },
    OPTIONZ: {
        required: false,
        type: "json"
    },
    RESULT: {
        required: true,
        type: "string"
    },
    NAME: {
        required: true,
        type: "string"
    },
    PATH: {
        required: true,
        type: "string"
    }
};
module.exports = sections;
