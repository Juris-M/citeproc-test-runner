====================
Citeproc Test Runner
====================

The Citeproc Test Runner is a powerful validation and testing tool for
CSL styles based on the ``citeproc-js`` citation processor. It can be
used in two ways: to run tests of the citation processor itself; and
to quickly produce and run tests of new CSL code when writing or
editing a citation style.

To run the program, you need three things on your system:

    ``node.js``
        Any recent-ish version should work. Version 7 is used for automated testing.
    ``mocha``
        Install Mocha globally with ``npm install --global mocha``.
    ``java``
        This is used to perform schema validation. Browser extension is not
        required, a basic command-line install is all you need.

With the requirements above satisfied, you can install the runner and
go to work with one command::

  npm install -g citeproc-test-runner

The program is run by typing ``cslrun`` at the command line. When run without
options, the program will display instructions on one final setup detail
(setting the directory where style tests will be saved). When that is done,
running the program again as ``cslrun`` will display a description of its
options, so you can go straight to work.

Running tests of the citation processor itself is done by making a
local ``git`` clone of the processor repository, and running
``cslrun`` from its top-level directory. The command for making the
clone is the following::

  git clone --recursive https://github.com/Juris-M/citeproc-js.git


------------------------------
Watch Mode: a testing tutorial
------------------------------

The ``cslrun`` command supports a simple but powerful “watch” mode for
use in style development. In the scenario below, we will prepare tests
for the *Journal of Irreproducible Results* (JIR). The journal `exists
<http://www.jir.com/>`_, but as there is no CSL style for it in the
CSL Repository, our tutorial will be largely devoid of
screenshots. The steps, however, can be applied to any style that
actually does exist.

I'll begin by forking the ``citeproc-js`` GitHub repository. This
will make it easy to fold my tests back into the main project ...


.. image:: https://juris-m.github.io/citeproc-js/fork.png

... and then I will clone a local copy of my forked ``citeproc-js``
repository (not the Juris-M original)::

    git clone --recursive git://github.com/fbennett/citeproc-js.git

I will do two things in preparation for work on the JIR style:

* Prepare a rough copy of the style (if it resembles another
  style, I might just fetch a copy of that, and change its
  title and ID);
* Prepare a small collection of items in Zotero for use in
  testing the style, and export the full set of items
  to a file, in CSL JSON format.

I am now ready to begin working with the ``runtests.js`` script.
The first step is to generate ``citeproc`` test fixtures for
each of the exported library items. ``runtests.js`` can do
this for me, with options like the following::

  node ./tests/runtests.js \
       -C path/to/exported-items.json \
       -S journal-of-irreproducible-results
  
I now have a set of boilerplate tests that will fail miserably,
but those that pass can be quickly converted to passing
tests, using the ``-k`` option like this::

  node ./tests/runtests.js \
       -S journal-of-irreproducible-results \
       -w ../somepath/journal-of-irreproducible-results.csl \
       -a \
       -k

The output will look something like this:

.. image:: https://juris-m.github.io/citeproc-js/style-fail.png

If I respond to the prompt with ``Y``, the output of the style
will be adopted as the RESULT of the test fixture. If I respond
with ``N``, the fixture will be skipped, and the next test will
be shown, until the test set is exhausted.

The test fixtures are located in plain text files in a ``styletests``
subdirectory, where they can be edited directly::

  ./tests/styletests/journal-of-irreproducible-results
  
The ``-C`` option that generates the boilerplate is destructive—it
will overwrite existing files—so be sure to rename the files after
populating the directory. In test fixture filenames, the underscore
(``_``) is required. The first portion of the name is the group to
which the test belongs. You will notice that, unlike the fixtures used
to test the processor, style fixtures do not contain a ``CSL``
section, for the obvious reason that the CSL code of the target style
is always used.

Once I have prepared a full set of passing tests, I can set the script
to watch the style file when I am making changes to it. The command
for that is the same as for rapid “editing” of the fixtures, but
without the ``-k`` option.::
  
  node ./tests/runtests.js \
       -S journal-of-irreproducible-results \
       -w ../somepath/journal-of-irreproducible-results.csl \
       -a
 
Each time I save the CSL file, the style code will be validated
before tests are run. Validation failures look like this:

.. image:: https://juris-m.github.io/citeproc-js/validation-fail.png

When I am happy with my tests, I can check them in to my local
``git``, push them to my GitHub repository, and file a pull request
to the ``Juris-M/citeproc-js`` master for general use by others
editing the style.
           
Done.

| FB
| 2019-03-27

