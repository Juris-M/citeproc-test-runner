var fs = require("fs");
var path = require("path");
var config = require("./configs");

var CSL = true;
if (fs.existsSync(config.path.src && path.join(config.path.src, "..", "citeproc_commonjs.js"))) {
    try {
        var CSL = require(path.join(config.path.src, "..", "citeproc_commonjs.js"));
    } catch (err) {
        console.log("ERROR: syntax error in processor code");
        console.log(err);
        process.exit();
    }
} else {
    var CSL = require("citeproc");
}

var abbrevPath = null;
if (config.path.abbrevs && fs.existsSync(config.path.abbrevs)) {
    abbrevPath = config.path.abbrevs;
} else {
    abbrevPath = require("citeproc-abbrevs").getAbbrevPath();
}

function preloadAbbreviations (CSL, styleEngine, citation, acache) {
    var styleID = styleEngine.opt.styleID;
    var obj = styleEngine.transform.abbrevs;
    var suppressedJurisdictions = styleEngine.opt.suppressedJurisdictions;
    var jurisdiction, category, rawvals;
    var isMlzStyle = styleEngine.opt.version.slice(0, 4) === '1.1m';

    let rawFieldFunction = {
        "container-title": (item, varname) => {
            return item[varname] ? [item[varname]] : [];
        },
        "collection-title": (item, varname) => {
            return item[varname] ? [item[varname]] : [];
        },
        "institution-entire": (item, varname) => {
            let ret = [];
            let names = item[varname];
            for (let i=0,ilen=names.length;i<ilen;i++) {
                if (names[i].literal) {
                    ret.push(names[i].literal);
                }
            }
            return ret.length ? ret : [];
        },
        "institution-part": (item, varname) => {
            let ret = [];
            let names = item[varname];
            for (let i=0,ilen=names.length;i<ilen;i++) {
                if (names[i].literal) {
                    let nameparts = names[i].literal.split(/\s*\|\s*/);
                    for (let j=0,jlen=nameparts.length;j<jlen;j++) {
                        ret.push(nameparts[j]);
                    }
                }
            }
            return ret.length ? ret : [];
        },
        "number": (item, varname) => {
            return varname === "number" ? [item[varname]] : [];
        },
        "title": (item, varname) => {
            return [
                "title",
                "title-short",
                "genre",
                "event",
                "medium"
            ].indexOf(varname) > -1 ? [item[varname]] : [];
        },
        "place": (item, varname) => {
            return [
                "archive-place",
                "publisher-place",
                "event-place",
                "country",
                "jurisdiction",
                "language-name",
                "language-name-original"
            ].indexOf(varname) > -1 ? [item[varname]] : [];
        }
    };

    // For items
    let rawItemFunction = {
        "nickname": (item) => {
            var ret = [];
            for (let varname in CSL.CREATORS) {
                if (item[varname]) {
                    for (let i=0,ilen=item[varname].length;i<ilen;i++) {
                        let name = item[varname][i];
                        if (!name.literal) {
                            let rawname = CSL.Util.Names.getRawName(item[varname][i]);
                            ret.push(rawname);
                        }
                    }
                }
            }
            return ret.length ? ret : false;
        },
        "hereinafter": (item) => {
            return [item.id];
        },
        "classic": (item) => {
            // This is a change from legacy, which used "<author>, <title>"
            return [item.id];
        }
    };

    var _registerEntries = (val, jurisdictions, category, passed_field, domain) => {
        var humanVal = null;
        if (passed_field) {
            var topCode = jurisdictions.join(":");
            val = styleEngine.sys.normalizeAbbrevsKey(passed_field, val);
        }
        for (let i=jurisdictions.length;i>0;i--) {
            let jurisdiction = jurisdictions.slice(0,i).join(":");
            _setCacheEntry(styleID, obj, jurisdiction, category, val, false, domain);
        }
        if (category === "hereinafter") {
            var item = styleEngine.sys.retrieveItem(val);
        }
        _setCacheEntry(styleID, obj, "default", category, val, false, domain);
    };
    
    let _checkAbbrevsForJurisdiction = (styleID, country) => {
        var ret = {};
        for (var i=0,ilen=citation.citationItems.length;i<ilen;i++) {
            var id = citation.citationItems[i].id;
            var item = styleEngine.sys.retrieveItem(id);
            for (var fn of fs.readdirSync(abbrevPath)) {
                var rex = new RegExp(`^auto-${country}(?:-([^.]+))*.json$`);
                var m = rex.exec(fn);
                if (!m) continue;
                var domain = m[1];
                // Fetch source from file
                // Parse JSON
                // Add mapping to acache
                // Done! (I think)
                var obj = JSON.parse(fs.readFileSync(path.join(abbrevPath, fn)).toString());
                var jurisd;
                if (domain) {
                    ret[domain] = true;
                    var abbrevs = {};
                    for (let jurisdiction in obj.xdata) {
                        jurisd = jurisdiction + "@" + domain;
                        abbrevs[jurisd] = obj.xdata[jurisdiction];
                    }
                } else {
                    abbrevs = obj.xdata;
                }
                Object.assign(acache, abbrevs);
            }
        }
        return Object.keys(ret);
    };
    
    var _setCacheEntry = (styleID, obj, jurisdiction, category, rawval, humanRawVal, domain) => {
        if (!rawval) return;
        
        rawval = "" + rawval;
        var ids = [rawval];

        // always false in the test framework
        //if (humanRawVal) {
        //    ids.push(humanRawVal);
        //}
        for (var i=0,ilen=ids.length; i<ilen; i++) {
            var id = ids[i];
            if (id) {
                var jurisd = jurisdiction;
			    var itemJurisd = domain ? jurisd + "@" + domain : jurisd;
                
			    if (!obj[itemJurisd]) {
				    obj[itemJurisd] = new CSL.AbbreviationSegments();
			    }
			    if (!obj[itemJurisd][category]) {
				    obj[itemJurisd][category] = {};
			    }

                var abbrev = false;
                if (acache[itemJurisd]) {
                    if (acache[itemJurisd][category]) {
                        if (acache[itemJurisd][category][rawval]) {
                            abbrev = acache[itemJurisd][category][rawval];
                        }
                    }
                }
                
                // XXXZ Stuff goes here to get abbrev from file object.
                if (abbrev) {
				    obj[itemJurisd][category][rawval] = abbrev;
                    break;
                }
            }
        }
    };

    for (var i=0,ilen=citation.citationItems.length;i<ilen;i++) {
        var id = citation.citationItems[i].id;
        var item = styleEngine.sys.retrieveItem(id);
        if (item.jurisdiction) {
            var jurisdictions = item.jurisdiction.split(":");
            if (!styleEngine.opt.availableAbbrevDomains) {
                styleEngine.opt.availableAbbrevDomains = {};
            }
            var jurisdictions = item.jurisdiction.split(":");
            if (!styleEngine.opt.availableAbbrevDomains[jurisdictions[0]]) {
                styleEngine.opt.availableAbbrevDomains[jurisdictions[0]] = _checkAbbrevsForJurisdiction(styleID, jurisdictions[0]);
            }
        } else {
            var jurisdictions = [];
        }
        if (item.language) {
            var lst = item.language.toLowerCase().split("<");
            if (lst.length > 0) {
                item["language-name"] = lst[0];
            }
            if (lst.length === 2) {
                item["language-name-original"] = lst[1];
            }
        }
        
		var domain = CSL.getAbbrevsDomain(styleEngine, jurisdictions[0], item.language);
        
        // set for fields
        for (let field of Object.keys(item)) {
            category = CSL.FIELD_CATEGORY_REMAP[field];
            var rawvals = false;
            var hackedvals = false;
            if (category) {
                rawvals = rawFieldFunction[category](item, field).map(function(val){
                    return [val, category, field];
                });
                if ("jurisdiction" === field) {
                    rawvals = rawvals.concat(rawFieldFunction[category](item, field).map(function(val){
                        val = val.split(":")[0];
                        return [val, category, "country"];
                    }));
                }
            } else if (CSL.CREATORS.indexOf(field) > -1) {
                rawvals = rawFieldFunction["institution-entire"](item, field).map(function(val){
                    return [val, "institution-entire", field];
                });
                rawvals = rawvals.concat(rawFieldFunction["institution-part"](item, field).map(function(val){
                    return [val, "institution-part", field];
                }));
            } else if (field === "authority") {
                if ("string" === typeof item[field]) {
                    //var spoofItem = {authority:[{literal:styleEngine.sys.getHumanForm(item.jurisdiction, item[field])}]};
                    var spoofItem = {authority:[{literal:item[field]}]};
                } else {
                    var spoofItem = item;
                }
                rawvals = rawFieldFunction["institution-entire"](spoofItem, field).map(function(val){
                    return [val, "institution-entire", field];
                });
                rawvals = rawvals.concat(rawFieldFunction["institution-part"](spoofItem, field).map(function(val){
                    return [val, "institution-part", field];
                }));
            }
            if (!rawvals) continue;
            for (var j=0,jlen=rawvals.length;j<jlen;j++) {
                var val = rawvals[j][0];
                var category = rawvals[j][1];
                var passed_field = rawvals[j][2];
                _registerEntries(val, jurisdictions, category, passed_field, domain);
				// This really shouldn't be necessary anymore. Unkeyed jurisdictions are not possible,
				// and language switching is to be controlled through abbrev list selection.
				/*
                if (item.multi && item.multi._keys.jurisdiction) {
                    for (var key of Object.keys(item.multi._keys.jurisdiction)) {
                        val = item.multi._keys[key];
                        // See calls to this function above.
                        yield _registerEntries(val, jurisdictions, category, passed_field, domain);
                    }
                }
				 */
            }
            
        }
        
        // set for items
        for (let functionType in rawItemFunction) {
            rawvals = rawItemFunction[functionType](item);
            for (let i=0,ilen=rawvals.length;i<ilen;i++) {
                var val = rawvals[i];
                // Empty array registers only for "default" jurisdiction
                _registerEntries(val, [], functionType);
            }
        }
        // yield this.Zotero.CachedJurisdictionData.load(item);
    }
};


module.exports = {
    preloadAbbreviations: preloadAbbreviations,
    CSL: CSL
};
