const fs = require("fs");
const path = require("path");
var reporters = {
    "landing": {
        path: "landing"
    },
    "spec": {
        path: "spec"
    },
    "dot": {
        path: "dot"
    },
    "min": {
        path: "min"
    },
    "list": {
        path: "list"
    },
    "progress": {
        path: "progress"
    },
    "spectrum": {
        npmname: "mocha-spectrum-reporter",
        location: ["mocha-spectrum-reporter", "index"]
    },
    "nyan": {
        npmname: "nyanplusreporter",
        location: ["nyanplusreporter", "src", "nyanPlus"]
    }
};
function lookForReporter(config, nickName) {
    locationPath = reporters[nickName].location.join(path.sep);
    var locations = [
        path.join(__dirname, "..", "..", locationPath),
        path.join(__dirname, "..", "node_modules", locationPath),
        path.join(config.path.cwd, "node_modules", locationPath)
    ]
    for (var loc of locations) {
        if (fs.existsSync(loc + ".js")) {
            reporters[nickName].path = loc
        }
    }
}
function getReporters(config) {
    lookForReporter(config, "spectrum");
    lookForReporter(config, "nyan");
    return reporters;
}
module.exports = {
    get: getReporters
}
