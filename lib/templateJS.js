var path = require("path");
var config = %%CONFIG%%
var assert = require(config.path.chai).assert;
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
    Object.keys(config.testData).map(k => config.testData[k]).forEach(function(test) {
        var description = test.DESCRIPTION;
        if (!description) {
            description = "should pass"
        }
        test["STYLE-CAPABILITIES"] = config.styleCapabilities;
        it(description + ' ' + test.NAME, function() {
            var sys = new Sys(config, test, logger_queue);
            sys.preloadAbbreviationSets();
            var ret = sys.run();
            try{
                assert.equal(ret, test.RESULT);
            } catch (err) {
                err.message = test.PATH
                throw err
            }
        });
    });
});
