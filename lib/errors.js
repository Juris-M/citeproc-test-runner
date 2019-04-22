/*
 * Errors
 */
function errorHandler(err) {
    console.log("\nError: " + err.message + "\n");
    //console.log(err);
    process.exit(1);
}
function errorHandlerNonFatal(err) {
    console.log("\nError: " + err.message + "\n");
    //console.log(err);
}
module.exports = {
    errorHandler: errorHandler,
    errorHandlerNonFatal: errorHandlerNonFatal
}
