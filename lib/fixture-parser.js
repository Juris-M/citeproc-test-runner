const fs = require("fs");
const sections = require("./sections.js");
const { REQ, OPT, SKP } = require("./flags.js");

function Parser(options, tn, fpth) {
    this.options = options;
    this.fpth = fpth;
    this.obj = {
        NAME: [tn],
        PATH: [fpth]
    };
    if (options.update || options.style) {
        this.testtype = "style";
    } else {
        this.testtype = "processor";
    }
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
            if (sections[key].type === "array") {
                try {
                    this.obj[key] = this.obj[key].split(/\s*,\s*/);
                } catch (err) {
                    console.log(this.fpth);
                    throw new Error("Array split fail for tag \"" + key + "\"");
                }
            }
        }
        //console.log(JSON.stringify(sections, null, 2));
        for (var key of Object.keys(sections)
                 .filter(key => sections[key][this.testtype] === REQ || sections[key][this.testtype] === OPT)) {
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
            if (sections[key][this.testtype] === REQ && "undefined" === typeof this.obj[key]) {
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

function parseFixture(options, tn, fpth) {
    var raw = fs.readFileSync(fpth).toString();
    var parser = new Parser(options, tn, fpth);
    for (var line of raw.split(/(?:\r\n|\n)/)) {
        parser.checkLine(line);
    }
    var ret = parser.dumpObj();
    return ret;
}

module.exports = {
    parseFixture: parseFixture
}
