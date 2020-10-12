const path = require("path");
function styleCapabilities(txt) {
    var styleCap = {
        styleID: null,
        styleName: null,
        bibliography: false,
        jurisdictionPreference: [],
        defaultLocale: "en",
        log: []
    };
    var start = txt.indexOf("<id>");
    var end = txt.indexOf("</id>");
    if (start === -1 || end === -1) {
        throw new Error("File \"" + options.watch[0] + "\" does not contain a CSL style ID");
    }
    styleCap.styleID = txt.slice(start + 4, end);
    styleCap.styleName = path.basename(styleCap.styleID);
    start = txt.indexOf("<bibliography");
    end = txt.indexOf("</bibliography>");
    if (start > -1 && end > -1) {
        styleCap.bibliography = true;
    }
    var ibid = txt.indexOf("position=\"ibid");
    if (ibid === -1) {
        ibid = txt.indexOf("position=\'ibid");
    }
    if (ibid > -1) {
        styleCap.ibid = true;
    }
    var position = txt.indexOf("position=");
    if (position > -1) {
        styleCap.position = true;
    }
    var backref = txt.indexOf("first-reference-note-number");
    if (backref > -1) {
        styleCap.backref = true;
    }
    var jprefStart = txt.indexOf("jurisdiction-preference");
    if (jprefStart > -1) {
        var jprefOpenQuote = txt.slice(jprefStart+1).indexOf("\"")+1;
        var jprefCloseQuote = txt.slice(jprefStart+jprefOpenQuote+1).indexOf("\"")+1;
        var jprefs = txt.slice(jprefStart+jprefOpenQuote+1, jprefStart+jprefOpenQuote+jprefCloseQuote);
        jprefs = jprefs.split(/\s+/);
        styleCap.jurisdictionPreference = jprefs;
    }
    var localePrefStart = txt.indexOf("default-locale");
    if (localePrefStart > -1) {
        var localePrefOpenQuote = txt.slice(localePrefStart+1).indexOf("\"")+1;
        var localePrefCloseQuote = txt.slice(localePrefStart+localePrefOpenQuote+1).indexOf("\"")+1;
        var localePref = txt.slice(localePrefStart+localePrefOpenQuote+1, localePrefStart+localePrefOpenQuote+localePrefCloseQuote);
        // styleCap.log = localePref;
        styleCap.defaultLocale = localePref;
    }
    return styleCap;
}
module.exports = {
    styleCapabilities
}
