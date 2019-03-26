#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("yaml");
const getopts = require("getopts");
const { spawn } = require("child_process");
const tmp = require("tmp");
const clear = require("cross-clear");
const chokidar = require("chokidar");
const normalizeNewline = require("normalize-newline");
const homeDir = require('os').homedir();

var ksTimeout;

var skipNames = {};

var TRAVIS = process.env.TRAVIS;

process.stdin.setRawMode(true);
process.stdin.resume();

// The console needs to run in binary mode, to give the fancy reporters
// control over the terminal
//process.stdin.setEncoding( 'utf8' );

process.stdin.on('data', function( key ){
    // ctrl-c ( end of text )
    if ( key.toString("hex") === "03" ) {
        console.log("\n");
        process.exit();
    }
});

/* Configuration */

/*
 * Config priority:
 * - User homeDir config
 * - Current directory config
 *
 * Should allow paths to be set as relative to homeDir or absolute,
 * but internally use always absolute for the config paths
 *
 */

const scriptDir = path.dirname(require.main.filename);

const defaultConfig =
      "path:\n"
      + "    local: fixtures/local\n"
      + "    std: fixtures/std/processor-tests/humans\n"
      + "    src: ../src\n"
      + "    locale: ../locale\n"
      + "    styles: fixtures/local/styles\n"
      + "    modules: ../juris-modules\n"
      + "    styletests: styletests\n"
      + "    jing: ../jing/jing-20131210.jar\n"
      + "    cslschema: ../csl-schemata/csl/csl.rnc\n"
      + "    cslmschema: ../csl-schemata/csl-m/csl-mlz.rnc";

var configFile = process.argv[1].replace(/.js\r?$/, ".yaml");
var baseName = "." + path.basename(configFile);
var dirName = path.dirname(configFile);
configFile = path.join(dirName, baseName);
console.log(configFile)
if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, defaultConfig);
}
var config = yaml.parse(fs.readFileSync(configFile).toString());



config.path.localAbs = path.join(scriptDir, config.path.local);
config.path.stdAbs = path.join(scriptDir, config.path.std);
config.path.srcAbs = path.join(scriptDir, config.path.src);

const reporters = {
    "landing": "landing",
    "spec": "spec",
    "spectrum": "node_modules/mocha-spectrum-reporter/index",
    "nyan": "node_modules/nyanplusreporter/src/nyanPlus",
    "dot": "dot",
    "min": "min",
    "progress": "progress"
};

function errorHandler(err) {
    console.log("\nError: " + err.message + "\n");
    process.exit(1);
}

function errorHandlerNonFatal(err) {
    console.log("\nError: " + err.message + "\n");
}

const sourceFiles = [
    "load",
    "print",
    "xmljson",
    "xmldom",
    "system",
    "sort",
    "util_disambig",
    "util_nodes",
    "util_dateparser",
    "build",
    "util_static_locator",
    "util_processor",
    "util_citationlabel",
    "api_control",
    "queue",
    "state",
    "api_cite",
    "api_bibliography",
    "util_integration",
    "api_update",
    "util_locale",
    "util_locale_sniff",
    "node_bibliography",
    "node_choose",
    "node_citation",
    "node_comment",
    "node_date",
    "node_datepart",
    "node_elseif",
    "node_else",
    "node_etal",
    "node_group",
    "node_if",
    "node_conditions",
    "node_condition",
    "util_conditions",
    "node_info",
    "node_institution",
    "node_institutionpart",
    "node_key",
    "node_label",
    "node_layout",
    "node_macro",
    "node_alternative",
    "node_alternativetext",
    "util_names_output",
    "util_names_tests",
    "util_names_truncate",
    "util_names_divide",
    "util_names_join",
    "util_names_common",
    "util_names_constraints",
    "util_names_disambig",
    "util_names_etalconfig",
    "util_names_etal",
    "util_names_render",
    "util_publishers",
    "util_label",
    "node_name",
    "node_namepart",
    "node_names",
    "node_number",
    "node_sort",
    "node_substitute",
    "node_text",
    "node_intext",
    "attributes",
    "stack",
    "util_parallel",
    "util",
    "util_transform",
    "obj_token",
    "obj_ambigconfig",
    "obj_blob",
    "obj_number",
    "util_datenode",
    "util_date",
    "util_names",
    "util_dates",
    "util_sort",
    "util_substitute",
    "util_number",
    "util_page",
    "util_flipflop",
    "formatters",
    "formats",
    "registry",
    "disambig_names",
    "disambig_citations",
    "disambig_cites",
    "util_modules",
    "util_name_particles"
];

/* Utilities */

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

const optParams = {
    alias: {
        s: "single",
        g: "group",
        a: "all",
        l: "list",
        c: "cranky",
        w: "watch",
        S: "style",
        k: "key-query",
        C: "compose-tests",
        b: "black-and-white",
        r: "reporter",
        h: "help"
    },
    string: ["s", "g", "S", "w", "C", "r"],
    boolean: ["a", "l", "c", "k", "b", "h"],
    unknown: option => {
        throw Error("Unknown option \"" +option + "\"");
    }
};

const options = getopts(process.argv.slice(2), optParams);

function Parser(options, tn, fpth) {
    this.options = options;
    this.fpth = fpth;
    this.obj = {
        NAME: [tn],
        PATH: [fpth]
    };
    this.section = false;
    this.state = null;
    this.openRex = new RegExp("^.*>>===*\\s(" + Object.keys(sections).join("|") + ")\\s.*=>>.*");
    this.closeRex = new RegExp("^.*<<===*\\s(" + Object.keys(sections).join("|") + ")\\s.*=<<.*");
    this.dumpObj = function() {
        for (var key in this.obj) {
            this.obj[key] = this.obj[key].join("\n");
            if (sections[key].type === "json") {
                try {
                    this.obj[key] = JSON.parse(this.obj[key]);
                } catch (err) {
                    console.log(this.fpth);
                    console.log(this.obj[key])
                    throw new Error("JSON parse fail for tag \"" + key + "\"");
                }
            }
        }
        for (var key of Object.keys(sections).filter(key => sections[key].required)) {
            if (this.options.watch && key === "CSL") {
                var inStyle = false;
                this.obj[key] = fs.readFileSync(this.options.watch[0]).toString();
                var cslList = this.obj[key].split(/(?:\r\n|\n)/);
                for (var i in cslList) {
                    var line = cslList[i];
                    if (line.indexOf("<style") > -1) {
                        inStyle = true;
                    }
                    if (inStyle) {
                        var m = line.match(/default-locale=[\"\']([^\"\']+)[\"\']/);
                        if (m && m[1].indexOf("-x-") === -1) {
                            var defaultLocale = m[1] + "-x-sort-en";
                            cslList[i] = cslList[i].replace(/default-locale=[\"\']([^\"\']+)[\"\']/, "default-locale=\"" + defaultLocale + "\"");
                            this.obj.CSL = cslList.join("\n");
                        }
                    }
                    if (inStyle && line.indexOf(">") > -1) {
                        break;
                    }
                }
            }
            if ("undefined" === typeof this.obj[key]) {
                console.log(this.fpth);
                throw new Error("Missing required tag \"" + key + "\"");
            }
        }
        if (this.obj.CSL.trim().slice(-4) === ".csl") {
            try {
                this.obj.CSL = fs.readFileSync(path.join(scriptDir, config.path.styles, this.obj.CSL.trim())).toString();
            } catch (err) {
                console.log("Warning: style \"" + this.obj.CSL.trim() + "\" not found, skipping test");
                this.obj = false;
            }
        }
        return this.obj;
    };
    this.checkLine = function (line) {
        var m = null;
        if (this.openRex.test(line)) {
            m = this.openRex.exec(line);
            if (this.state) {
                console.log(this.fpth);
                throw new Error("Attempted to open tag \"" + m[1] + "\" before tag \"" + this.section + "\" was closed.");
            }
            this.section = m[1];
            this.state = "opening";
        } else if (this.closeRex.test(line)) {
            m = this.closeRex.exec(line);
            if (this.section !== m[1]) {
                console.log(this.fpth);
                throw new Error("Expected closing tag \"" + this.section + "\" but found \"" + m[1] + "\"");
            }
            this.state = "closing";
            // for empty results
            if (this.section === "RESULT" && !this.obj[this.section]) {
                this.obj[this.section] = [""];
            }
        } else {
            if (this.state === "opening") {
                this.obj[this.section] = [];
                this.state = "reading";
            } else if (this.state === "closing") {
                this.state = null;
            }
        }
        if (this.state === "reading") {
            this.obj[this.section].push(line);
        }
    };
}

function parseFixture(tn, fpth) {
    var raw = fs.readFileSync(fpth).toString();
    var parser = new Parser(options, tn, fpth);
    for (var line of raw.split(/(?:\r\n|\n)/)) {
        parser.checkLine(line);
    }
    return parser.dumpObj();
}

function Stripper(fn, noStrip) {
    this.fn = fn;
    this.noStrip = noStrip;
    this.arr = [];
    this.area = "code";
    this.state = "reading";
    this.skipStarRex = new RegExp("^\\s*(\\/\\*.*?\\*\\/)\\r?$", "m");
    this.skipSlashRex = new RegExp("^\\s*(\\/\\/.*)\\r?$");
    this.openRex = new RegExp("^\\s*(\\/\\*|\\/\\/SNIP-START)");
    this.closeRex = new RegExp("^\\s*(\\*\\/|\\/\\/SNIP-END)\\s*\\r?$");
    this.checkRex = new RegExp("");
    this.dumpArr = function() {
        return this.arr.join("\n");
    };
    this.checkLine = function (line) {
        if (line.match(/^.use strict.;?\r?$/)) {
            return;
        }
        if (this.noStrip) {
            this.arr.push(line);
        } else {
            var m = null;
            if (this.skipStarRex.test(line)) {
                return;
            } else if (this.openRex.test(line)) {
                m = this.openRex.exec(line);
                this.area = "comment";
                this.state = "opening";
            } else if (this.closeRex.test(line)) {
                m = this.closeRex.exec(line);
                this.state = "closing";
            } else if (this.skipSlashRex.test(line)) {
                return;
            } else {
                if (this.state === "opening") {
                    this.state = "skipping";
                } else if (this.state === "closing") {
                    this.state = "reading";
                    this.area = "code";
                }
            }
            if (this.state === "reading") {
                if (line.trim()) {
                    this.arr.push(line);
                }
            }
        }
    };
}

/* Options */

const usage = "Usage: " + path.basename(process.argv[1])
      + "Usage: runtests.js <-s testName|-g groupName|-a|-l> [-S styleName|-w cslFilePath|-C cslJsonFilePath]\n"
      + "  -s testName, --single=testName\n"
      + "      Run a single local or standard test fixture.\n"
      + "  -g groupName, --group=groupName\n"
      + "      Run a group of tests with the specified prefix.\n"
      + "  -a, --all\n"
      + "      Run all tests.\n"
      + "  Option for use with -s, -g, or -a:\n"
      + "      -c, --cranky\n"
      + "          Validate CSL in selected fixtures\n"
      + "      -b, --black-and-white\n"
      + "          Disable color output\n"
      + "      -r, --reporter\n"
      + "          Set the report style. Default is \"landing.\"\n"
      + "          Valid options are: spec, spectrum, nyan, dot, min\n"
      + "          and progress.\n"
      + "  Options for style development with -s, -g, or -a:\n"
      + "      -S, --style\n"
      + "          Style name (without spaces). Without -C, requires -w.\n"
      + "      -w, --watch\n"
      + "          Path to CSL source file watch for changes, relative to\n"
      + "          repository root. Without -C, requires -S.\n"
      + "      Option for use with -s, -g, or -a with -S and -w:\n"
      + "          -k, --key-query\n"
      + "              When tests fail, stop processing and ask whether to\n"
      + "              adopt the processor output as the RESULT. Useful for\n"
      + "              rapidly back-fitting tests to existing styles.\n"
      + "      Option for use with -S:\n"
      + "          -C, --compose-tests\n"
      + "              Path to CSL JSON file containing item data, relative\n"
      + "              to repository root. Requires also -S. Creates draft\n"
      + "              test fixtures in -S style test directory. Existing\n"
      + "              files will be overwritten: be sure to rename files\n"
      + "              after generating draft fixtures.\n"
      + "  Option for use on its own, or with -S  \n"
      + "          -l, --list\n"
      + "              List available groups and styles.";

// First things first
if (options.watch) {
    console.log("Watching: " + options.watch);
}
function checkSanity() {
    if (options.h) {
        console.log(usage);
        process.exit();
    }
    if (options.r) {
        if (reporters[options.r]) {
            options.r = reporters[options.r];
        } else {
            console.log("Unknown reporter \"" + options.r + ",\" defaulting to \"landing.\"");
            options.r = "landing";
        }
    } else if (TRAVIS) {
        options.r = "spec";
    } else {
        options.r = "landing";
    }
    if (!options.C) {
        if (["s", "g", "a", "l"].filter(o => options[o]).length > 1) {
            throw new Error("Only one of -s, -g, -a, or -l may be invoked.");
        }
        if (["s", "g", "a", "l"].filter(o => options[o]).length === 0) {
            console.log(usage);
            throw new Error("Use one of -s, -g, -a, or -l.");
        }
    }
    if (!options.C && ((options.watch && !options.style) || (!options.watch && options.style))) {
        throw new Error("Without -C, the -w and -S options must be set together.");
    }
    if (options.C && !options.style) {
        throw new Error("The -C option requires -S.");
    }
    if (options.k && !options.style) {
        throw new Error("The -k option requires -S and -w.");
    }
}

function setLocalPathToStyleTestPath() {
    var styleTestsPth = null;
    try {
        var testDirPth = path.join(scriptDir, config.path.styletests);
        if (!fs.existsSync(testDirPth)) {
            fs.mkdirSync(testDirPth);
        }
        styleTestsPth = path.join(testDirPth, options.S);
        if (!fs.existsSync(styleTestsPth)) {
            fs.mkdirSync(styleTestsPth);
        }
        config.path.local = path.join(config.path.styletests, options.S);
        config.path.localAbs = styleTestsPth;
    } catch (err) {
        throw new Error("Unable to create style tests directory: " + styleTestsPth);
    }
}

function setWatchFiles(options) {
    var arr = options.watch;
    if ("string" === typeof arr) {
        arr = [arr];
    }
    for (var i in arr) {
        if (!path.isAbsolute(arr[i])) {
            arr[i] = path.join(scriptDir, "..", arr[i]);
        }
        if (!fs.existsSync(arr[i])) {
            throw new Error("CSL file or directory to be watched does not exist: " + arr[i]);
        }
    }
    options.watch = arr;
    options.w = arr;
}

function checkOverlap(tn) {
    if (config.testData[tn]) {
        throw new Error("Fixture name exists in local and std: " + tn);
    }
}

function checkSingle() {
    var tn = options.single.replace(/.txt~?\r?$/, "");
    var fn = tn + ".txt";
    if (fn.split("_").length !== 2) {
        throw new Error("Single test fixture must be specified as [group]_[name]");
    }
    var lpth = path.join(config.path.localAbs, fn);
    var spth = path.join(config.path.stdAbs, fn);
    if (!fs.existsSync(lpth) && (options.style || !fs.existsSync(spth))) {
        console.log("Looking for " + lpth);
        console.log("Looking for " + spth);
        throw new Error("Test fixture \"" + options.single + "\" not found.");
    }
    if (fs.existsSync(lpth)) {
        config.testData[tn] = parseFixture(tn, lpth);
    }
    if (!options.style) {
        if (fs.existsSync(spth)) {
            checkOverlap(tn);
            config.testData[tn] = parseFixture(tn, spth);
        }
    }
}

function checkGroup() {
    var fail = true;
    var rex = new RegExp("^" + options.group + "_.*\.txt\\r?$");
    for (var line of fs.readdirSync(config.path.localAbs)) {
        if (rex.test(line)) {
            fail = false;
            var lpth = path.join(config.path.localAbs, line);
            var tn = line.replace(/.txt\r?$/, "");
            if (!skipNames[tn]) {
                config.testData[tn] = parseFixture(tn, lpth);
            }
        }
    }
    if (!options.style) {
        for (var line of fs.readdirSync(config.path.stdAbs)) {
            if (rex.test(line)) {
                fail = false;
                var spth = path.join(config.path.stdAbs, line);
                var tn = line.replace(/.txt\r?$/, "");
                if (!skipNames[tn]) {
                    if (fs.existsSync(spth)) {
                        checkOverlap(tn);
                        config.testData[tn] = parseFixture(tn, spth);
                    }
                }
            }
        }
    }
    if (fail) {
        throw new Error("No fixtures found for group \"" + options.group + "\".");
    }
    
}

function checkAll() {
    var rex = new RegExp("^.*_.*\.txt\\r?$");
    for (var line of fs.readdirSync(config.path.localAbs)) {
        if (rex.test(line)) {
            var lpth = path.join(config.path.localAbs, line);
            var tn = line.replace(/.txt\r?$/, "");
            if (!skipNames[tn]) {
                config.testData[tn] = parseFixture(tn, lpth);
            }
        } else {
            console.log("Skipping file in local: " + line);
        }
    }
    if (!options.style) {
        for (var line of fs.readdirSync(config.path.stdAbs)) {
            if (rex.test(line)) {
                var spth = path.join(config.path.stdAbs, line);
                var tn = line.replace(/.txt\r?$/, "");
                if (!skipNames[tn]) {
                    if (fs.existsSync(spth)) {
                        checkOverlap(tn);
                        config.testData[tn] = parseFixture(tn, spth);
                    }
                }
            } else {
                console.log("Skipping file in std: " + line);
            }
        }
    }
}

function setGroupList() {
    var rex = new RegExp("^([^_]+)_.*\.txt\\r?$");
    for (var line of fs.readdirSync(config.path.localAbs)) {
        if (rex.test(line)) {
            var m = rex.exec(line);
            if (!config.testData[m[1]]) {
                config.testData[m[1]] = [];
            }
            config.testData[m[1]].push(line);
        }
    }
    for (var line of fs.readdirSync(config.path.stdAbs)) {
        if (rex.test(line)) {
            var m = rex.exec(line);
            if (!config.testData[m[1]]) {
                config.testData[m[1]] = [];
            }
            config.testData[m[1]].push(line);
        }
    }
}

// Is this initialization needed?
config.testData = {};

function fetchTestData() {
    try {
        config.testData = {};
        if (options.single) {
            checkSingle();
        }
        if (options.group) {
            checkGroup();
        }
        if (options.all) {
            checkAll();
        }
    } catch (err) {
        errorHandler(err);
    }
}

try {
    checkSanity();
    if (options.style) {
        setLocalPathToStyleTestPath(options.style);
    }
    if (options.watch) {
        setWatchFiles(options);
    }
    if (options.list) {
        setGroupList();
    }
} catch (err) {
    errorHandler(err);
}


/* Operations */

function Bundle(noStrip) {
    // The markup of the code is weird, so we do weird things to strip
    // comments.
    // The noStrip option is not yet used, but will dump the processor
    // with comments and skipped blocks intact when set to a value.
    var ret = "";
    for (var fn of sourceFiles) {
        var txt = fs.readFileSync(path.join(config.path.srcAbs, fn + ".js")).toString();
        var stripper = new Stripper(fn, noStrip);
        for (var line of txt.split(/(?:\r\n|\n)/)) {
            stripper.checkLine(line);
        }
        ret += stripper.dumpArr() + "\n";
    }
    var license = fs.readFileSync(path.join(scriptDir, "..", "LICENSE")).toString().trim();
    license = "/*\n" + license + "\n*/\n";
    fs.writeFileSync(path.join(scriptDir, "..", "citeproc.js"), license + ret);
    fs.writeFileSync(path.join(scriptDir, "..", "citeproc_commonjs.js"), license + ret + "\nmodule.exports = CSL");
}

function runJingAsync(validationCount, validationGoal, schema, test) {
    var jingPromise = new Promise((resolve, reject) => {
        var tmpobj = tmp.fileSync();
        fs.writeFileSync(tmpobj.name, test.CSL);
        var buf = [];
        var jing = spawn(
            "java",
            [
                "-client",
                "-jar",
                path.join(scriptDir, config.path.jing),
                "-c",
                path.join(scriptDir, schema),
                tmpobj.name
            ],
            {
                cwd: path.join(scriptDir, "..")
            });
        jing.stderr.on('data', (data) => {
            reject(data.toString());
        });
        jing.stdout.on('data', (data) => {
            buf.push(data);
        });
        jing.on('close', async function(code) {
            validationCount++;
            // If we are watching and code is 0, chain to integration tests.
            // Otherwise stop here.
            if (code == 0 && options.watch) {
                await runFixturesAsync();
                resolve();
            } else if (code == 0) {
                process.stdout.write("+");
                if (validationCount === validationGoal) {
                    console.log("\nDone.");
                    process.exit(0);
                }
                resolve();
            } else {
                var txt = Buffer.concat(buf).toString();
                var lines = txt.split(/(?:\r\n|\n)/);
                for (var line of lines) {
                    console.log(line.toString().replace(/^.*?:([0-9]+):([0-9]+):\s*(.*)$/m, "[$1] : $3"));
                }
                console.log("\nValidation failure for " + test.NAME);
                if (!options.watch) {
                    validationCount--;
                    fs.writeFileSync(path.join(scriptDir, "..", ".cslValidationPos"), "" + validationCount);
                    process.exit(0);
                }
                resolve();
            }
        });
    });
    return jingPromise;
}


async function runValidationsAsync() {
    var validationCount = 0;
    var validationGoal = Object.keys(config.testData).length;
    var startPos = 0;
    if (options.w) {
        console.log("Validating CSL.");
    } else {
        console.log("Validating CSL in " + validationGoal + " fixtures.");
    }
    if (!options.w && !options.l && !options.C) {
        if (options.a && fs.existsSync(path.join(scriptDir, "..", ".cslValidationPos"))) {
            startPos = fs.readFileSync(path.join(scriptDir, "..", ".cslValidationPos")).toString();
            startPos = parseInt(startPos, 10);
        } else {
            fs.writeFileSync(path.join(scriptDir, "..", ".cslValidationPos"), "0");
        }
    }
    for (var key in config.testData) {
        if (startPos > validationCount) {
            process.stdout.write(".");
            validationCount++;
            continue;
        }
        var test = config.testData[key];
        var schema = config.path.cslschema;
        var lineList = test.CSL.split(/(?:\r\n|\n)/);
        var inStyle = false;
        var m = null;  // for version match
        for (var line of lineList) {
            if (line.indexOf("<style") > -1) {
                inStyle = true;
            }
            if (inStyle && !m) {
                m = line.match(/version=[\"\']([^\"\']+)[\"\']/);
            }
            if (inStyle && line.indexOf(">") > -1) {
                break;
            }
        }
        if (m) {
            if (m[1].indexOf("mlz") > -1) {
                schema = config.path.cslmschema;
            }
        } else {
            throw new Error("Version not found in CSL for fixture: " + key);
        }
        await runJingAsync(validationCount, validationGoal, schema, test);
        validationCount++;
        if (options.watch) {
            // If in watch mode, all validations will be of the
            // same CSL, so break after launching the first.
            break;
        }
    }
}


function runFixturesAsync() {
    var fixturesPromise = new Promise((resolve, reject) => {
        var args = [];
        if (options.b) {
            args.push("--no-color");
        } else {
            args.push("--color");
        }
        args.push("-R");
        args.push(options.r);
        if (options.k) {
            args.push("--bail");
        }
        var mocha = spawn("mocha", args, {cwd: path.join(scriptDir, ".."), shell: process.platform == 'win32'});
        mocha.stdout.on('data', (data) => {
            var lines = data.toString();
            process.stdout.write(lines);
            if (options.w && options.k) {
                var m = lines.match(/.*AssertionError:\s*([^\n]+)\.txt/m);
                if (m) {
                    console.log("Adopt this output as correct test RESULT? (y/n)");
                    process.stdin.once('data', function (key) {
                        if (!ksTimeout) {
                            ksTimeout = setTimeout(function() { ksTimeout=null }, 100) // block for 0.1 second to avoid stutter
                            
                            var fn = path.basename(m[1]);
                            var test = config.testData[fn];
                            
                            if (key == "y" || key == "Y") {
                                var sys = new Sys(test);
                                var result = sys.run();
                                var input = JSON.stringify(test.INPUT, null, 2);
                                var txt = fs.readFileSync(path.join(scriptDir, "templateTXT.txt")).toString();
                                txt = txt.replace("%%INPUT_DATA%%", input);
                                txt = txt.replace("%%RESULT%%", result)
                                fs.writeFileSync(path.join(scriptDir, config.path.styletests, options.S, fn + ".txt"), txt);
                                // Should this be promisified?
                                bundleValidateTest();
                                resolve();
                            }
                            if (key == "n" || key == "N") {
                                skipNames[test.NAME] = true;
                                // Should this be promisified?
                                bundleValidateTest();
                                resolve();
                            }
                        }
                    });
                }
            }
        });
        mocha.stderr.on('data', (data) => {
            console.log(data.toString().replace(/\s+\r?$/, ""));
            reject();
        });
        mocha.on('close', (code) => {
            resolve();
            if (!options.watch) {
                console.log("\n");
                process.exit();
            }
        });
    });
    return fixturesPromise;
}

function buildTests() {
    var fixtures = fs.readFileSync(path.join(scriptDir, "templateJS.js")).toString();
    var testData = Object.keys(config.testData).map(k => config.testData[k]).filter(o => o);
    fixtures = fixtures.replace("%%RUNPREP_PATH%%", JSON.stringify(path.join(scriptDir, "testlib.js")));
    fixtures = fixtures.replace("%%TEST_DATA%%", JSON.stringify(testData, null, 2));
    if (!fs.existsSync(path.join(scriptDir, "..", "test"))) {
        fs.mkdirSync(path.join(scriptDir, "..", "test"));
    }
    fixtures = normalizeNewline(fixtures);
    fs.writeFileSync(path.join(scriptDir, "..", "test", "fixtures.js"), fixtures);
}

async function bundleValidateTest(skipBundle) {
    // Bundle, load, and run tests if -s, -g, or -a
    
    // Bundle the processor code.
    if (!skipBundle) {
        Bundle();
    }

    // Build and run tests
    if (options.cranky || options.watch) {
        if (options.watch) {
            clear();
            fetchTestData();
            buildTests();
            await runValidationsAsync().catch(err => errorHandlerNonFatal(err));
            var watcher = chokidar.watch(options.watch[0]);
            watcher.on("change", (event, filename) => {
                clear();
                fetchTestData();
                buildTests();
                runValidationsAsync().catch(err => errorHandlerNonFatal(err));
            });
            for (var pth of options.watch.slice(1)) {
                watcher.add(pth);
            }
        } else {
            fetchTestData();
            buildTests();
            await runValidationsAsync().catch(err => errorHandlerNonFatal(err));
        }
    } else {
        fetchTestData();
        buildTests();
        await runFixturesAsync();
    }
}

Bundle();
const Sys = require(path.join(scriptDir, "testlib.js"));

if (options.C) {
    // If composing, just to that and quit.
    try {
        var pth = path.join(scriptDir, "..", options.C);
        if (fs.existsSync(pth)) {
            var json = fs.readFileSync(pth);
            var arr = JSON.parse(json);
            for (var i in arr) {
                arr[i].id = "ITEM-1";
                var item = JSON.stringify([arr[i]], null, 2);
                var txt = fs.readFileSync(path.join(scriptDir, "templateTXT.txt")).toString();
                txt = txt.replace("%%INPUT_DATA%%", item);
                var pos = "" + (parseInt(i, 10)+1);
                while (pos.length < 3) {
                    pos = "0" + pos;
                }
                fs.writeFileSync(path.join(scriptDir, config.path.styletests, options.S, "draft_example" + pos + ".txt"), txt);
            }
            process.exit(0);
        } else {
            throw new Error("CSL JSON source file not found: " + pth);
        }
    } catch (err) {
        errorHandler(err);
    }
} else if (options.single || options.group || options.all) {
    bundleValidateTest(true).catch(err => {
        if (err) {
            console.log(err);
        }
    });
} else if (options.l) {
    // Otherwise we've collected a list of group names.
    var ret = Object.keys(config.testData);
    ret.sort();
    for (var key of ret) {
        console.log(key + " (" + config.testData[key].length + ")");
    }
    process.exit(0);
}
