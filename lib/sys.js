var fs = require("fs");
var path = require("path");
var yaml = require("yaml");
var normalizeNewline = require("normalize-newline");
var config = require("./configs");
var cwd = process.cwd();

if (fs.existsSync(config.path.src && path.join(config.path.src, "..", "citeproc_commonjs.js"))) {
    var CSL = require(path.join(config.path.src, "..", "citeproc_commonjs.js"));
} else {
    var CSL = require("citeproc");
}

var Sys = function(config, test, logger_queue){
    this.config = config;
    this.test = test;
    this._acache = {};
    this._acache["default"] = new CSL.AbbreviationSegments();
    this._setCache();
    this.logger_queue = logger_queue;
}

Sys.prototype.print = function(txt) {
    var name = this.test.NAME;
    this.logger_queue.push("[" + name + "] " + txt);
}

Sys.prototype._setCache = function() {
    this._cache = {};
    this._ids = [];
    for (var item of this.test.INPUT) {
        this._cache[item.id] = item;
        this._ids.push(item.id);
    }
}

Sys.prototype.retrieveItem = function(id){
    return this._cache[id];
};

Sys.prototype.retrieveLocale = function(lang){
    var ret = null;
    try {
        ret = fs.readFileSync(path.join(this.config.path.locale, "locales-"+lang+".xml")).toString();
        ret = ret.replace(/\s*<\?[^>]*\?>\s*\n/g, "");
    } catch (e) {
        ret = false;
    }
    return ret;
};

Sys.prototype.retrieveStyleModule = function(jurisdiction, preference) {
    var ret = null;
    if (this.submode.nojuris) {
        return ret;
    }
    var id = [jurisdiction];
    if (preference) {
        id.push(preference);
    }
    id = id.join("-");
    try {
        ret = fs.readFileSync(path.join(this.config.path.modules, "juris-" + id + ".csl")).toString();
    } catch (e) {}
    return ret;
};

Sys.prototype.getAbbreviation = function(dummyListNameVar, obj, jurisdiction, category, key){
    if (!this._acache[jurisdiction]) {
        this._acache[jurisdiction] = new CSL.AbbreviationSegments();
    }
    if (!obj[jurisdiction]) {
        obj[jurisdiction] = new CSL.AbbreviationSegments();
    }    
    var jurisdictions = ["default"];
    if (jurisdiction !== "default") {
        jurisdictions.push(jurisdiction);
    }
    jurisdictions.reverse();
    var haveHit = false;
    for (var i = 0, ilen = jurisdictions.length; i < ilen; i += 1) {
        var myjurisdiction = jurisdictions[i];
        if (this._acache[myjurisdiction][category][key]) {
            obj[myjurisdiction][category][key] = this._acache[myjurisdiction][category][key];
            jurisdiction = myjurisdiction;
            haveHit = true;
            break;
        }
    }
    return jurisdiction;
};

Sys.prototype.addAbbreviation = function(jurisdiction,category,key,val){
    if (!this._acache[jurisdiction]) {
        this._acache[jurisdiction] = new CSL.AbbreviationSegments();
    }
    this._acache[jurisdiction][category][key] = val;
};

Sys.prototype.updateDoc = function() {
    var data, result;
    for (var i=0,ilen=this.test.CITATIONS.length;i<ilen;i++) {
        var citation = this.test.CITATIONS[i];
        [data, result] = this.style.processCitationCluster(citation[0], citation[1], citation[2]);
        // To get the indexes right, we have to do removals first.
        for (var j=this.doc.length-1; j>-1; j--) {
            var citationID = this.doc[j].citationID;
            if (!this.style.registry.citationreg.citationById[citationID]) {
                this.doc = this.doc.slice(0, j).concat(this.doc.slice(j + 1));
            }
        }
        // Reset prefixes of any elements that exist in doc.
        for (var j in this.doc) {
            this.doc[j].prefix = "..";
        }
        // If citationID matches in doc, just replace the existing one.
        for (var j in result) {
            var insert = result[j];
            for (var k in this.doc) {
                var cite = this.doc[k];
                if (cite.citationID === insert[2]) {
                    // replace cite with insert, somehow
                    this.doc[k] = {
                        prefix: ">>",
                        citationID: cite.citationID,
                        String: insert[1]
                    };
                    result[j] = null;
                    break;
                }
            }
        }
        // For citationIDs that don't yet exist in doc, insert at the specified index locations.
        for (var j in result) {
            var insert = result[j];
            if (!insert) {
                continue;
            }
            this.doc = this.doc.slice(0, insert[0]).concat([
                {
                    prefix: ">>",
                    citationID: insert[2],
                    String: insert[1]
                }
            ]).concat(this.doc.slice(insert[0]));
        }
    }
};

Sys.prototype.run = function(){
    var len, pos, ret, id_set;
    var ret = [];

    function variableWrapper(params, prePunct, str, postPunct) {
        //print(JSON.stringify(params,null,2));
        if (params.variableNames[0] === 'title' 
            && params.itemData.URL 
            && params.context === "citation" 
            && params.position === "first") {

            return prePunct + '<a href="' + params.itemData.URL + '">' + str + '</a>' + postPunct;
        } else if (params.variableNames[0] === 'first-reference-note-number' 
                   && params.context === "citation" 
                   && params.position !== "first") {

            return prePunct + '<b>' + str + '</b>' + postPunct;
        } else {
            return (prePunct + str + postPunct);
        }
    }


    // this.csl_reverse_lookup_support = true;

    if (this.test.OPTIONS && this.test.OPTIONS.variableWrapper) {
        this.variableWrapper = variableWrapper;
    }
    var lang_bases_needed = {};
    for (var lang in CSL.LANGS) {
        var lang_base = lang.split("-")[0];
        lang_bases_needed[lang_base] = true;
    } 
    for (var lang_base in lang_bases_needed) {
        if (!CSL.LANG_BASES[lang_base]) {
            throw "ERROR: missing in CSL.LANG_BASES: " + lang_base;
        }
    }
    var testCSL = this.test.CSL;
    this.style = new CSL.Engine(this,testCSL);
    this.style.fun.dateparser.addDateParserMonths(["ocak", "Şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık", "bahar", "yaz", "sonbahar", "kış"]);

    var mode = this.test.MODE.split("-");
    this.submode = {};
    for (var i=1,ilen=mode.length;i<ilen;i++) {
        this.submode[mode[i]] = true;
    }
    this.test.MODE = mode[0];

    if (this.submode["rtf"]) {
        this.style.setOutputFormat("rtf");
    }
    if (this.submode["plain"]) {
        this.style.setOutputFormat("plain");
    }
    if (this.submode["asciidoc"]) {
        this.style.setOutputFormat("asciidoc");
    }
    if (this.submode["xslfo"]) {
        this.style.setOutputFormat("xslfo");
    }
    //this.style.setParseNames(true);
    //this.style.opt.development_extensions.static_statute_locator = true;
    //this.style.opt.development_extensions.clobber_locator_if_no_statute_section = true;
    //this.style.opt.development_extensions.handle_parallel_articles = true;
    //this.style.opt.development_extensions.rtl_support = true;
	for (var opt in this.test.OPTIONS) {
        if (opt === "variableWrapper") {
            continue;
        }
		this.style.opt.development_extensions[opt] = this.test.OPTIONS[opt];
	}

    

    //this.style.opt.development_extensions.thin_non_breaking_space_html_hack = true;
    //this.style.opt.development_extensions.wrap_url_and_doi = true;
    var langParams = {
        persons:["translit"],
        institutions:["translit"],
        titles:["translit", "translat"],
        journals:['translit'],
        publishers:["translat"],
        places:["translat"]
    };
    if (this.test.LANGPARAMS) {
        for (var key in this.test.LANGPARAMS) {
            langParams[key] = this.test.LANGPARAMS[key];
        }
    }
    this.style.setLangPrefsForCites(langParams);
    if (this.test.MULTIAFFIX) {
        this.style.setLangPrefsForCiteAffixes(this.test.MULTIAFFIX);
    }
    if (this.test.ABBREVIATIONS) {
        for (var jurisdiction in this.test.ABBREVIATIONS) {
            for (var field in this.test.ABBREVIATIONS[jurisdiction]) {
                for (var key in this.test.ABBREVIATIONS[jurisdiction][field]) {
                    this.addAbbreviation(jurisdiction,field,key,this.test.ABBREVIATIONS[jurisdiction][field][key]);
                }
            }
        }
    }

    if (this.test.BIBENTRIES){
        for (i=0,ilen=this.test.BIBENTRIES.length;i<ilen;i++) {
            var id_set = this.test.BIBENTRIES[i];
            this.style.updateItems(id_set, this.submode["nosort"]);
        }
    } else if (!this.test.CITATIONS) {
        this.style.updateItems(this._ids, this.submode["nosort"]);
    }
    if (!this.test["CITATION-ITEMS"] && !this.test.CITATIONS){
        var citation = [];
        for (var i=0,ilen=this.style.registry.reflist.length;i<ilen;i++) {
            var item = this.style.registry.reflist[i];
            citation.push({"id":item.id});
        }
        this.test["CITATION-ITEMS"] = [citation];
    }
    var citations = [];
    if (this.test["CITATION-ITEMS"]){
        for (var i=0,ilen=this.test["CITATION-ITEMS"].length;i<ilen;i++) {
            var citation = this.test["CITATION-ITEMS"][i];
            citations.push(this.style.makeCitationCluster(citation));
        }
    } else if (this.test.CITATIONS){
        this.doc = [];
        this.updateDoc();
        if (this.test.INPUT2) {
            this.test.INPUT = this.test.INPUT2;
            this._setCache();
            this.updateDoc();
        }
        citations = this.doc.map(function(elem, idx) {
            return elem.prefix + "[" + idx + "] " + elem.String;
        });
    }
    ret = citations.join("\n");
    if (this.test.MODE == "bibliography" && !this.submode["header"]){
        if (this.test.BIBSECTION){
            var ret = this.style.makeBibliography(this.test.BIBSECTION);
        } else {
            var ret = this.style.makeBibliography();
        }
        ret = ret[0]["bibstart"] + ret[1].join("") + ret[0]["bibend"];
    } else if (this.test.MODE == "bibliography" && this.submode["header"]){
        var obj = this.style.makeBibliography()[0];
        var lst = [];
        for (var key in obj) {
            var keyval = [];
            keyval.push(key);
            keyval.push(obj[key]);
            lst.push(keyval);
        }
        lst.sort(
            function (a, b) {
                if (a > b) {
                    return 1;
                } else if (a < b) {
                    return -1;
                } else {
                    return 0;
                }
            }
        );
        ret = "";
        for (pos = 0, len = lst.length; pos < len; pos += 1) {
            ret += lst[pos][0] + ": " + lst[pos][1] + "\n";
        }
        ret = ret.replace(/^\s+/,"").replace(/\s+$/,"");
    }
    if (this.test.MODE !== "bibliography" && this.test.MODE !== "citation") {
        throw "Invalid mode in test file " + this.NAME + ": " + this.test.MODE;
    }
    ret = normalizeNewline(ret);
    return ret;
};
module.exports = Sys;
