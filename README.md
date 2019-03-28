# Citeproc Test Runner

A productivity tool for authoring citation styles in the popular [Citation Style Language](https://citationstyles.org/) (CSL) used by [Zotero](https://www.zotero.org/), [Mendeley](https://www.mendeley.com/), [Jurism](https://juris-m.github.io/) and other projects. The script assumes that [node](https://nodejs.org/), [java](https://www.java.com/en/download/) and [mocha](https://mochajs.org/) are installed (the last globally with `npm i -g mocha`). With those in place, installation is a one-liner:
``` bash
    npm install -g citeproc-test-runner
```
After installing, start the program with `cslrun`. It will spit out instructions on setting the root directory for style tests. After configuration, `cslrun -h` will display a list of options to help you get started.

The tool can be used both for building and for running tests. If you export a set of items in CSL JSON, you can build tests from them with:
``` bash
    cslrun -S <style-nickname> -C <csl-json-file>
```
That will create a subdirectory with the style nickname under your style-test root, and populate it with boilerplate test fixtures built from the data in the export file. You can then run:
``` bash
    cslrun -S <style-nickname> -w <csl-style-file> -a -k
```
That will run each of the tests in turn, failing miserably but with an option to adopt the processor's return as the expected result for the test. If you hit `Y` for each fixture, you have a set of passing tests, which you can tweak if there are anomalies in the style that generated the output. Be sure to rename the fixtures from their boilerplate names, since another run with the `-C` option will overwrite them otherwise.

To use the tests as a validation and output monitor when editing a style, remove the `-k` option:
``` bash
    cslrun -S <style-nickname> -w <csl-style-file> -a
```
The runner will watch the style file, and rerun validation and tests when it changes on disk, for pretty-good dynamic validation with any editor that saves files. Long-suffering users of `nano` and `edlin` rejoice!

As a nice extra in the CSL-M zone, the `-w` option can be repeated, to watch a jurisdiction submodule in addition to the parent style.

Enjoy!

FB
