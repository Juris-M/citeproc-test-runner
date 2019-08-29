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
        O: "once",
        N: "novalidation",
        S: "style",
        k: "key-query",
        C: "compose-tests",
        U: "update",
        b: "black-and-white",
        r: "reporter",
        A: "abbreviations",
        h: "help"
    },
    string: ["s", "g", "S", "w", "C", "r", "A"],
    boolean: ["a", "l", "c", "k", "b", "h", "U", "O", "N"],
    unknown: option => {
        throw Error("Unknown option \"" +option + "\"");
    }
};
var config = require("./configs.js");
if (config.mode === "styleMode") {
    var styleModeText =  " (-S MUST be used in this configuration)";
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
      + "      -w, --watch\n"
      + "          Path to CSL source file watch for changes, relative to\n"
      + "          repository root.\n"
      + "      -U, --update\n"
      + "          Update style tests from collection in JM Style Samples.\n"
      + "      -k, --key-query (used with -w)\n"
      + "          When tests fail, stop processing and ask whether to\n"
      + "          adopt the processor output as the RESULT. Useful for\n"
      + "          rapidly generating tests for existing styles.\n"
      + "      -A, --abbreviations\n"
      + "          Path to abbreviation files, such as a clone of jurism-abbreviations:\n"
      + "            https://github.com/Juris-M/jurism-abbreviations\n"
      + "      -S, --style\n"
      + "          Override name of test set. (Allows use of tests not\n"
      + "          orginally composed for the CSL file designated by -w)\n"
      + "      -C, --compose-tests\n"
      + "          (Discontinued. Open a collection in JM Style Tests and\n"
      + "          use the -U option instead.)\n"
      + "  Miscellaneous options:\n"
      + "      -c, --cranky\n"
      + "          Validate CSL in selected fixtures instead of running\n"
      + "          tests.\n"
      + "      -O, --once\n"
      + "          Use with the -w option. Exits immediately after running tests.\n"
      + "      -N, --novalidation\n"
      + "          Do not validate before running tests.\n"
      + "      -b, --black-and-white\n"
      + "          Disable color output\n"
      + "      -r, --reporter\n"
      + "          Set the report style. Default is \"landing.\"\n"
      + "          Built-in options are: spec, dot, min, progress.\n"
      + "          If installed via npm, nyanplusreporter (as \"nyan\")\n"
      + "          and mocha-spectrum-reporter (as \"spectrum\") are also\n"
      + "          available."
      + "      -l, --list\n"
      + "          List available groups and styles.";
const options = getopts(process.argv.slice(2), optParams);
module.exports = {
    options: options,
    usage: usage
};
