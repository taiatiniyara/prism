## graphify

For any question about this repo's architecture, structure, components, or how
to add/modify/find code, your **first tool call must be** to read
`graphify-out/GRAPH_REPORT.md` (if it exists).

Triggers: "how do I…", "where is…", "what does … do", "add/modify a
<component>", "explain the architecture", or anything that depends on how files
or classes relate.

After reading the report (and `graphify-out/wiki/index.md` for deep questions),
answer from the graph. Only read source files when (a) modifying/debugging
specific code, (b) the graph lacks the needed detail, or (c) the graph is
missing or stale.

Type `/graphify` in Copilot Chat to build or update the graph.

## error checks

Always check for errors in the code after generating it. If you see an error,
fix it and then check again. Repeat until there are no errors. Run npx tsc
--noEmit to check for TypeScript errors, or the equivalent for your language. If
you are using an IDE, make sure to check for any error highlights or warnings in
the code editor. If you are using a linter, run it to check for any linting
errors or warnings. If you are running tests, make sure to check the test
results for any failures or errors. If you are using a build tool, make sure to
check the build output for any errors or warnings. Always make sure to fix any
errors before proceeding with further development or testing.

## documentation

Always update or add documentation for new code. This includes comments in the
code itself, as well as any relevant README files or wiki pages. Make sure the
documentation is clear and concise, and that it accurately reflects the
functionality of the code.

## refactoring

If you see an opportunity to improve the structure or readability of the code,
consider refactoring it. This can include things like renaming variables or
functions for clarity, breaking up large functions into smaller ones, or
reorganizing code into different files or modules. Always make sure to run tests
after refactoring to ensure that you haven't introduced any new bugs.

## code style

Follow the project's code style guidelines. This includes things like
indentation, naming conventions, and formatting. Consistent code style makes it
easier for everyone to read and understand the code. If the project doesn't have
a style guide, follow common conventions for the language you're using (e.g.,
PEP 8 for Python, Airbnb for JavaScript).
