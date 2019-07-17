#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const tmp = require("tmp");
const clear = require("cross-clear");
const chokidar = require("chokidar");
const normalizeNewline = require("normalize-newline");
const fetchURL = require("fetch-promise");
const zoteroToCSLM = require('zotero2jurismcsl').convert;
const zoteroToCSL = require('zotero-to-csl');

const config = require("./lib/configs.js");
const reporters = require("./lib/reporters.js").get(config);
const parseFixture = require("./lib/fixture-parser.js").parseFixture;
const sources = require("./lib/sources.js");
const options = require("./lib/options.js").options;
const usage = require("./lib/options.js").usage;
const errors = require("./lib/errors.js");
const Sys = require(path.join(config.path.scriptdir, "lib", "sys.js"));
const { styleCapabilities } = require("./lib/style-capabilities");

var ksTimeout;
var cdTimeout;
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
    if (TRAVIS) {
        options.r = "spec";
    } else if (!options.r) {
        options.r = "landing";
    }
    if (config.mode === "styleMode") {
        if (!options.watch) {
            throw new Error("Running in styleMode. The -w option is required. Add -h for help.");
        }
    }
    if (options.C) {
        throw new Error("The -C option has been discontinued. See cslrun --help for details.");
    }
    if (!options.U) {
        if (["s", "g", "a", "l"].filter(o => options[o]).length > 1) {
            throw new Error("Only one of -s, -g, -a, or -l may be invoked.");
        }
        if (["s", "g", "a", "l"].filter(o => options[o]).length === 0) {
            console.log(usage);
            throw new Error("Use one of -s, -g, -a, or -l.");
        }
    }
    if (options.U && !options.watch) {
        throw new Error("The -U option requires -w.");
    }
    if (options.k && !options.watch) {
        throw new Error("The -k option requires -w.");
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
    if (config.path.std) {
        var spth = path.join(config.path.std, fn);
    }
    if (!fs.existsSync(lpth) && (options.style || !fs.existsSync(spth))) {
        console.log("Looked for " + lpth);
        console.log("Looked for " + spth);
        throw new Error("Test fixture \"" + options.single + "\" not found.");
    }
    if (fs.existsSync(lpth)) {
        config.testData[tn] = parseFixture(options, tn, lpth);
    }
    if (!options.style) {
        if (fs.existsSync(spth)) {
            checkOverlap(tn);
            config.testData[tn] = parseFixture(options, tn, spth);
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
                config.testData[tn] = parseFixture(options, tn, lpth);
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
                        config.testData[tn] = parseFixture(options, tn, spth);
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
                config.testData[tn] = parseFixture(options, tn, lpth);
            }
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
                        config.testData[tn] = parseFixture(options, tn, spth);
                    }
                }
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
        console.log("Using processor from package");
        return;
    } else {
        console.log("Rebundling processor");
    }
    // The markup of the code is weird, so we do weird things to strip
    // comments.
    // The noStrip option is not yet used, but will dump the processor
    // with comments and skipped blocks intact when set to a value.
    var ret = "";
    for (var fn of sources) {
        var txt = fs.readFileSync(path.join(config.path.src, fn + ".js")).toString();
        /*
        var stripper = new Stripper(fn, noStrip);
        for (var line of txt.split(/(?:\r\n|\n)/)) {
            stripper.checkLine(line);
        }
        ret += stripper.dumpArr() + "\n";
        */
        ret += txt + "\n";
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
        //console.log("java -client -jar " + config.path.jing + " -c " + schema + " " + tmpobj.name);
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
            {});
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

                // XXX Control this with the -c option?
                if (options.c) {
                    process.exit();
                } else {
                    await runFixturesAsync();
                }
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
                if (options.watch && options.c) {
                    process.exit();
                } else if (!options.watch) {
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
    //console.log(config.testData)
    var validationGoal = Object.keys(config.testData).length;
    var startPos = 0;
    if (options.w) {
        console.log("Watching: " + options.watch[0]);
        console.log("Validating CSL.");
    } else {
        console.log("Validating CSL in " + validationGoal + " fixtures.");
    }
    if (!options.w && !options.l && !options.U) {
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
        console.log("Testing CSL.");
        if (TRAVIS) {
            if (!fs.existsSync(config.path.fixturedir)) {
                fs.mkdirSync(config.path.fixturedir);
            }
        }
        if (options.r) {
            if (reporters[options.r]) {
                if (reporters[options.r].path) {
                    options.r = reporters[options.r].path;
                } else {
                    console.log("Reporter not found, defaulting to \"landing.\" Install \"" + options.r + "\" with:\n");
                    console.log("    npm install " + reporters[options.r].npmname);
                    console.log("or")
                    console.log("    npm install -g " + reporters[options.r].npmname);
                    options.r = "landing";
                }
            } else {
                console.log("Unknown reporter \"" + options.r + ",\" defaulting to \"landing.\"");
                options.r = "landing";
            }
        }
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
            shell: process.platform == 'win32'
        });
        mocha.on("error", function(err) {
            var error = new Error("Failure running \"mocha.\" If the command \"mocha\" is not found,\ninstall it globally with:\n\n    npm install -g mocha");
            errors.errorHandler(error);
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
                                txt = txt.replace("%%MODE%%", test.MODE);
                                txt = txt.replace("%%KEYS%%", JSON.stringify(test.KEYS, null, 2));
                                txt = txt.replace("%%DESCRIPTION%%", test.DESCRIPTION);
                                txt = txt.replace("%%INPUT%%", input);
                                txt = txt.replace("%%RESULT%%", result)
                                for (var key in test) {
                                    if (["MODE", "INPUT", "RESULT", "NAME", "PATH", "CSL", "KEYS", "DESCRIPTION"].indexOf(key) > -1) {
                                        continue;
                                    }
                                    if (key.toUpperCase() !== key) {
                                        continue;
                                    }
                                    var testKey = typeof test[key] == "object" ? JSON.stringify(test[key], null, 2) : test[key];
                                    var block = "\n\n>>===== " + key + " =====>>\n" + testKey.trim() + "\n<<===== " + key + " =====<<\n";
                                    txt += block;
                                }
                                
                                fs.writeFileSync(path.join(config.path.styletests, options.S, fn + ".txt"), txt);
                                // Should this be promisified?
                                bundleValidateTest().catch(err => errors.errorHandler(err));
                                resolve();
                            }
                            if (key == "n" || key == "N") {
                                skipNames[test.NAME] = true;
                                // Should this be promisified?
                                bundleValidateTest().catch(err => errors.errorHandler(err));
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
    if (Object.keys(config.testData).length === 0) {
        errors.setupGuidance("No tests to run.");
    }
    fixtures = fixtures.replace("%%CONFIG%%", JSON.stringify(config, null, 2));
    fixtures = fixtures.replace("%%RUNPREP_PATH%%", JSON.stringify(path.join(config.path.scriptdir, "lib", "sys.js")));
    fixtures = normalizeNewline(fixtures);
    if (!fs.existsSync(config.path.fixturedir)) {
        fs.mkdirSync(config.path.fixturedir);
    }
    fs.writeFileSync(path.join(config.path.fixturedir, "fixtures.js"), fixtures);
}

async function bundleValidateTest() {
    // Bundle, load, and run tests if -s, -g, or -a
    // Bundle the processor code.
    if (options.watch) {
        clear();
    }
    Bundle();
    // Build and run tests
    if (options.watch) {
        fetchTestData();
        buildTests();
        if (options.novalidation) {
            await runFixturesAsync();
        } else if (options.validationonly) {
            //
        } else {
            await runValidationsAsync().catch(err => errors.errorHandlerNonFatal(err));
        }
        if (options.once || options.validationonly) {
            process.exit();
        }
        var watcher = chokidar.watch(options.watch[0]);
        watcher.on("change", (event, filename) => {
            if (!cdTimeout) {
                cdTimeout = setTimeout(function() { cdTimeout=null }, 200) // block for 0.1 second to avoid stutter
                clear();
                Bundle();
                fetchTestData();
                buildTests();
                runValidationsAsync().catch(err => errors.errorHandlerNonFatal(err));
            }
        });
        for (var pth of options.watch.slice(1)) {
            watcher.add(pth);
        }
    } else if (options.cranky) {
        fetchTestData();
        buildTests();
        await runValidationsAsync().catch(err => errors.errorHandlerNonFatal(err));
    } else {
        fetchTestData();
        buildTests();
        await runFixturesAsync();
    }
}

/*
 * Do stuff
 */

(async function() {
    try {
        checkSanity();
        if (options.watch) {
            setWatchFiles(options);
        }
        if (options.list) {
            setGroupList();
        }
        
        // If we are using -w and -S is not set, sniff out the style name and set it on
        // options, so legacy code will do its thing.
        if (options.watch && !options.style) {
            var txt = fs.readFileSync(options.watch[0]).toString();
            config.styleCapabilities = styleCapabilities(txt);
            options.style = config.styleCapabilities.styleName;
            options.S = config.styleCapabilities.styleName;
        }
        if (options.style) {
            setLocalPathToStyleTestPath(options.style);
        }
        
        if (options.U) {

            // Contact server, analyze return, check current fixtures,
            // update with any missing fixtures. Big one.
            // (1) Get collections from API
            var json = await fetchURL("https://api.zotero.org/groups/" + config.groupID + "/collections/top");
            var obj = JSON.parse(json.buf.toString());
            var collectionKey = obj.filter(o => (o.data.name === options.S))
                .map(o => o.data.key);
            if (!collectionKey || !collectionKey[0]) {
                errors.setupGuidance("No collection found for style \"" + options.S + "\" in library of test items.");
            }
            collectionKey = collectionKey[0];
            json = await fetchURL("https://api.zotero.org/groups/" + config.groupID + "/collections/" + collectionKey + "/items/top");
            obj = JSON.parse(json.buf.toString());
            // Need to read off the keys of the existing tests before building the data array.
            // Can get the highest test number, or the holes in existing numbers, while we're at it.
            var styleTestDir = path.join(config.path.styletests, options.S);
            var doneKeys = {};
            var doneNums = {};
            var rex = new RegExp("^.*_.*\.txt\\r?$");
            for (var fileName of fs.readdirSync(styleTestDir)) {
                if (!rex.test(fileName)) continue;
                var fixture = parseFixture(options, fileName, path.join(styleTestDir, fileName));
                for (var key of fixture.KEYS) {
                    doneKeys[key] = true;
                }
                var m = fileName.match(/[^0-9]*([0-9]+)/);
                if (m) {
                    doneNums[parseInt(m[1], 10)] = true;
                }
            }
            var max = 0;
            var doneNumsLst = Object.keys(doneNums);
            if (doneNumsLst.length > 0) {
                var max = Object.keys(doneNums).map(o => parseInt(o)).reduce(function(a, b) {
                    return Math.max(a, b);
                });
            } 
            var newNums = [];
            for (var i=1,ilen=(max + obj.length + 1); i<ilen; i++) {
                if (!doneNums[i]) {
                    newNums.push(i);
                    if (newNums.length === obj.length) {
                        break;
                    }
                }
            }
            newNums.reverse();
            var arr = [];
            for (var o of obj) {
                var key = o.data.key;
                if (doneKeys[key]) {
                    continue;
                }
                delete o.data.key;
                var description = o.data.abstractNote;
                if (description) {
                    description = description.slice(0, 50).replace(/\n+/g, " ");
                }
                delete o.data.abstractNote;
                delete o.data.version;
                delete o.data.dateAdded;
                delete o.data.dateModified;
                var cslData = zoteroToCSL(o.data);
                var cslItem = zoteroToCSLM(o, cslData);
                arr.push({
                    key: key,
                    item: cslItem,
                    description: description
                });
            }
            // Templates get some big changes here.
            for (var i in arr) {
                arr[i].id = "ITEM-1";
                var item = JSON.stringify([arr[i]], null, 2);
                var txt = fs.readFileSync(path.join(config.path.scriptdir, "lib", "templateTXT.txt")).toString();
                txt = txt.replace("%%MODE%%", "all");
                txt = txt.replace("%%KEYS%%", JSON.stringify([arr[i].key], null, 2));
                txt = txt.replace("%%INPUT%%", JSON.stringify([arr[i].item], null, 2));
                // Can we do something just a little more elegant with file naming?
                
                var pos = "" + newNums.pop();
                while (pos.length < 3) {
                    pos = "0" + pos;
                }
                var fileStub = "style_test" + pos;
                if (arr[i].description) {
                    txt = txt.replace("%%DESCRIPTION%%", arr[i].description);
                } else {
                    txt = txt.replace("%%DESCRIPTION%%", "should pass test " + fileStub)
                }
                fs.writeFileSync(path.join(config.path.styletests, options.S, fileStub + ".txt"), txt);
            }
            if (arr.length > 0) {
                console.log("Maybe wrote draft tests to "+path.join(config.path.styletests, options.S));
            } else {
                console.log("No tests to write this time");
            }
            process.exit(0);
        } else if (options.single || options.group || options.all) {
            bundleValidateTest().catch(err => errors.errorHandler(err));
        } else if (options.l) {
            // Otherwise we've collected a list of group names.
            var ret = Object.keys(config.testData);
            ret.sort();
            for (var key of ret) {
                console.log(key + " (" + config.testData[key].length + ")");
            }
            process.exit(0);
        }
    } catch (err) {
        errors.errorHandler(err);
    }
})();
