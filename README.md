# normalize-parser-test

A `node.js` [package](https://www.npmjs.com/package/normalize-parser-test) for rendering JavaScript parser tests in a uniform way. Exports a single function (`default`), which takes and returns the text of a syntactically valid ECMAScript 6 program, replacing variable names and constants in a uniform way. Whitespace, comments, and nontrivial names and constants are preserved.

An optional second argument provides an options bag. Current valid options are `isModule` (to parse as a module) and `parseFn` (if you want to provide your own parsing function, which should produce Shift-format ASTs). It is not legal to provide both.

## Example

```js
let normalize = require('normalize-parser-test').default;
normalize("let[x]=y, unicode\\u{50}, foo,      something = /* kewl */ 42+1337  , bar = 'baz'+\"zz\";");
// returns "let[a]=b, unicode\\u{50}, c,      d = /* kewl */ 1+2  , e = 'f'+\"g\";"
```