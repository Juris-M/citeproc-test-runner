const path = require("path");
const reporters = {
    "landing": "landing",
    "spec": "spec",
    "spectrum": path.join(__dirname, "..", "node_modules", "mocha-spectrum-reporter", "index"),
    "nyan": path.join(__dirname, "..", "node_modules", "nyanplusreporter", "src", "nyanPlus"),
    "dot": "dot",
    "min": "min",
    "progress": "progress"
};
module.exports = reporters;
