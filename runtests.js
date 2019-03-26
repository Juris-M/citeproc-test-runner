#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const tmp = require("tmp");
const clear = require("cross-clear");
const chokidar = require("chokidar");
const normalizeNewline = require("normalize-newline");

const config = require("./lib/configs.js");
const reporters = require("./lib/reporters.js");
const sections = require("./lib/sections.js");
const sources = require("./lib/sources.js");
const options = require("./lib/options.js").options;
const usage = require("./lib/options.js").usage;
const errors = require("./lib/errors.js");
const Sys = require(path.join(config.path.scriptdir, "lib", "sys.js"));

var ksTimeout;
var skipNames = {};
var TRAVIS = process.env.TRAVIS;

/*
 * Console
 */
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

/* 
 * Functions
 */
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
    if (config.mode === "styleMode") {
        if (!options.S) {
            throw new Error("Running in styleMode. The -S option is required, with either -w or -C. Add -h for help.");
        }
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
    if (!fs.existsSync(config.path.styletests)) {
        throw new Error("The configured style tests directory must exist: " + config.path.styletests);
    }
    try {
        styleTestsPth = path.join(config.path.styletests, options.S);
        if (!fs.existsSync(styleTestsPth)) {
            fs.mkdirSync(styleTestsPth);
        }
        config.path.local = path.join(config.path.styletests, options.S);
    } catch (err) {
        throw err;
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
            arr[i] = path.join(config.path.cwd, arr[i]);
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
    var lpth = path.join(config.path.local, fn);
    var spth = path.join(config.path.std, fn);
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
    for (var line of fs.readdirSync(config.path.local)) {
        if (rex.test(line)) {
            fail = false;
            var lpth = path.join(config.path.local, line);
            var tn = line.replace(/.txt\r?$/, "");
            if (!skipNames[tn]) {
                config.testData[tn] = parseFixture(tn, lpth);
            }
        }
    }
    if (!options.style) {
        for (var line of fs.readdirSync(config.path.std)) {
            if (rex.test(line)) {
                fail = false;
                var spth = path.join(config.path.std, line);
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
    for (var line of fs.readdirSync(config.path.local)) {
        if (rex.test(line)) {
            var lpth = path.join(config.path.local, line);
            var tn = line.replace(/.txt\r?$/, "");
            if (!skipNames[tn]) {
                config.testData[tn] = parseFixture(tn, lpth);
            }
        } else {
            console.log("Skipping file in local: " + line);
        }
    }
    if (!options.style) {
        for (var line of fs.readdirSync(config.path.std)) {
            if (rex.test(line)) {
                var spth = path.join(config.path.std, line);
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
    for (var line of fs.readdirSync(config.path.local)) {
        if (rex.test(line)) {
            var m = rex.exec(line);
            if (!config.testData[m[1]]) {
                config.testData[m[1]] = [];
            }
            config.testData[m[1]].push(line);
        }
    }
    for (var line of fs.readdirSync(config.path.std)) {
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
        errors.errorHandler(err);
    }
}

function Bundle(noStrip) {
    if (!config.path.src) {
        return;
    }
    // The markup of the code is weird, so we do weird things to strip
    // comments.
    // The noStrip option is not yet used, but will dump the processor
    // with comments and skipped blocks intact when set to a value.
    var ret = "";
    for (var fn of sources) {
        var txt = fs.readFileSync(path.join(config.path.src, fn + ".js")).toString();
        var stripper = new Stripper(fn, noStrip);
        for (var line of txt.split(/(?:\r\n|\n)/)) {
            stripper.checkLine(line);
        }
        ret += stripper.dumpArr() + "\n";
    }
    var license = fs.readFileSync(path.join(config.path.src, "..", "LICENSE")).toString().trim();
    license = "/*\n" + license + "\n*/\n";
    fs.writeFileSync(path.join(config.path.src, "..", "citeproc.js"), license + ret);
    fs.writeFileSync(path.join(config.path.src, "..", "citeproc_commonjs.js"), license + ret + "\nmodule.exports = CSL");
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
                config.path.jing,
                "-c",
                schema,
                tmpobj.name
            ],
            {
                cwd: path.join(config.path.scriptdir, "..")
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
                    fs.writeFileSync(path.join(config.path.configdir, ".cslValidationPos"), "" + validationCount);
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
        if (options.a && fs.existsSync(path.join(config.path.configdir, ".cslValidationPos"))) {
            startPos = fs.readFileSync(path.join(config.path.configdir, ".cslValidationPos")).toString();
            startPos = parseInt(startPos, 10);
        } else {
            fs.writeFileSync(path.join(config.path.configdir, ".cslValidationPos"), "0");
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
        args.push(path.join(config.path.fixturedir, "fixtures.js"));
        var mocha = spawn("mocha", args, {
            cwd: config.path.configdir,
            shell: process.platform == 'win32'
        });
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
                                var sys = new Sys(config, test, []);
                                var result = sys.run();
                                var input = JSON.stringify(test.INPUT, null, 2);
                                var txt = fs.readFileSync(path.join(config.path.scriptdir, "lib", "templateTXT.txt")).toString();
                                txt = txt.replace("%%INPUT_DATA%%", input);
                                txt = txt.replace("%%RESULT%%", result)
                                fs.writeFileSync(path.join(config.path.styletests, options.S, fn + ".txt"), txt);
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
    var fixtures = fs.readFileSync(path.join(config.path.scriptdir, "lib", "templateJS.js")).toString();
    var testData = Object.keys(config.testData).map(k => config.testData[k]).filter(o => o);
    fixtures = fixtures.replace("%%CONFIG%%", JSON.stringify(config, null, 2));
    fixtures = fixtures.replace("%%RUNPREP_PATH%%", JSON.stringify(path.join(config.path.scriptdir, "lib", "sys.js")));
    fixtures = fixtures.replace("%%TEST_DATA%%", JSON.stringify(testData, null, 2));
    fixtures = normalizeNewline(fixtures);
    if (!fs.existsSync(config.path.fixturedir)) {
        fs.mkdir(config.path.fixturedir);
    }
    fs.writeFileSync(path.join(config.path.fixturedir, "fixtures.js"), fixtures);
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
            await runValidationsAsync().catch(err => errors.errorHandlerNonFatal(err));
            var watcher = chokidar.watch(options.watch[0]);
            watcher.on("change", (event, filename) => {
                clear();
                fetchTestData();
                buildTests();
                runValidationsAsync().catch(err => errors.errorHandlerNonFatal(err));
            });
            for (var pth of options.watch.slice(1)) {
                watcher.add(pth);
            }
        } else {
            fetchTestData();
            buildTests();
            await runValidationsAsync().catch(err => errors.errorHandlerNonFatal(err));
        }
    } else {
        fetchTestData();
        buildTests();
        await runFixturesAsync();
    }
}

/*
 * Do stuff
 */

if (options.watch) {
    console.log("Watching: " + options.watch);
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
    errors.errorHandler(err);
}

Bundle();

if (options.C) {
    // If composing, just to that and quit.
    try {
        var pth = path.join(config.path.cwd, options.C);
        if (fs.existsSync(pth)) {
            var json = fs.readFileSync(pth);
            var arr = JSON.parse(json);
            for (var i in arr) {
                arr[i].id = "ITEM-1";
                var item = JSON.stringify([arr[i]], null, 2);
                var txt = fs.readFileSync(path.join(config.path.scriptdir, "lib", "templateTXT.txt")).toString();
                txt = txt.replace("%%INPUT_DATA%%", item);
                var pos = "" + (parseInt(i, 10)+1);
                while (pos.length < 3) {
                    pos = "0" + pos;
                }
                fs.writeFileSync(path.join(config.path.styletests, options.S, "draft_example" + pos + ".txt"), txt);
            }
            console.log("Wrote draft tests in "+path.join(config.path.styletests, options.S));
            console.log("Rename the files with the pattern *_*.txt to avoid overwrite.");
            process.exit(0);
        } else {
            throw new Error("CSL JSON source file not found: " + pth);
        }
    } catch (err) {
        errors.errorHandler(err);
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
