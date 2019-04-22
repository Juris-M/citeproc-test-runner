/*
 * Errors
 */
function errorHandler(err) {
    console.log("\nError: " + err.message + "\n");
    console.log(err);
    process.exit(1);
}
function errorHandlerNonFatal(err) {
    console.log("\nError: " + err.message + "\n");
    console.log(err);
}
function setupGuidance(txt) {
    console.log("# " + txt);
    console.log("# To start building tests for this style, follow the instructions in the");
    console.log("# Citeproc Test Runner README:");
    console.log("#     https://www.npmjs.com/package/citeproc-test-runner");
    process.exit(1);
}
module.exports = {
    errorHandler: errorHandler,
    errorHandlerNonFatal: errorHandlerNonFatal,
    setupGuidance: setupGuidance
}
