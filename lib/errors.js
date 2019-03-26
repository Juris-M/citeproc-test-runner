/*
 * Errors
 */
function errorHandler(err) {
    console.log("\nError: " + err.message + "\n");
    process.exit(1);
}
function errorHandlerNonFatal(err) {
    console.log("\nError: " + err.message + "\n");
}
module.exports = {
    errorHandler: errorHandler,
    errorHandlerNonFatal: errorHandlerNonFatal
}
