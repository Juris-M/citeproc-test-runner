var path = require("path");
const getopts = require("getopts");
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
var config = require("./configs.js");
if (config.mode === "styleMode") {
    var styleModeText =  "(-S MUST be used in this configuration)";
} else {
    var styleModeText = "";
}
const usage = "Usage: " + path.basename(process.argv[1])
      + "\nUsage: runtests.js <-s testName|-g groupName|-a|-l> [-S styleName|-w cslFilePath|-C cslJsonFilePath]\n\n"
      + "  Testing options (exactly one MUST be used):\n"
      + "      -s testName, --single=testName\n"
      + "          Run a single local or standard test fixture.\n"
      + "      -g groupName, --group=groupName\n"
      + "          Run a group of tests with the specified prefix.\n"
      + "      -a, --all\n"
      + "          Run all tests.\n"
      + "  Options for style development" + styleModeText + ":\n"
      + "      -S, --style\n"
      + "          Style name (without spaces). [requires -C or -w]\n"
      + "      -w, --watch\n"
      + "          Path to CSL source file watch for changes, relative to\n"
      + "          repository root. Without -C, requires -S.\n"
      + "      -C, --compose-tests\n"
      + "          Path to CSL JSON file containing item data, relative\n"
      + "          to repository root. Requires also -S. Creates draft\n"
      + "          test fixtures in -S style test directory. Existing\n"
      + "          files will be overwritten: be sure to rename files\n"
      + "          after generating draft fixtures.\n"
      + "      -k, --key-query [use only with -S and -w]\n"
      + "          When tests fail, stop processing and ask whether to\n"
      + "          adopt the processor output as the RESULT. Useful for\n"
      + "          rapidly back-fitting tests to existing styles.\n"
      + "  Miscellaneous options:\n"
      + "      -c, --cranky\n"
      + "          Validate CSL in selected fixtures instead of running\n"
      + "          tests."
      + "      -b, --black-and-white\n"
      + "          Disable color output\n"
      + "      -r, --reporter\n"
      + "          Set the report style. Default is \"landing.\"\n"
      + "          Valid options are: spec, spectrum, nyan, dot, min\n"
      + "          and progress.\n"
      + "      -l, --list\n"
      + "          List available groups and styles.";
const options = getopts(process.argv.slice(2), optParams);
module.exports = {
    options: options,
    usage: usage
};
