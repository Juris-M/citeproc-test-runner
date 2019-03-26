var path = require("path");
var assert = require('chai').assert;
var Sys = require(%%RUNPREP_PATH%%);
var logger_queue = [];

describe('Integration tests', function() {
    after(function() {
        setTimeout(
            function() {
                for (var entry of logger_queue) {
                    process.stdout.write(entry+"\n");
                }
            }, 100)
    });
    var tests = %%TEST_DATA%%
    tests.forEach(function(test) {
        it('should pass ' + test.NAME, function() {
            var sys = new Sys(test, logger_queue);
            var ret = sys.run();
            try{
                assert.equal(ret, test.RESULT, "FILE: " + test.PATH);
            } catch (err) {
                err.message = test.PATH
                throw err
            }
        });
    });
});
