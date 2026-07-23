// ─── Custom Babel plugin(s) for jest.config.js's ESM-node_modules transform ──
// Kept in its own file (rather than inline in jest.config.js) because
// babel-jest computes its cache key by serializing the transformer options
// passed to it — a plugin given as an in-memory function reference doesn't
// survive that serialization on a warm/full-suite run (`.plugins[0] must be
// a string, object, function`), even though it works on a cold single-file
// run. Babel plugins referenced by resolvable file path (a string) don't
// have this problem.
//
// yoga-layout's WASM loader (@react-pdf/layout's flex-layout engine)
// references `import.meta.url` to locate itself. next/babel transpiles the
// surrounding module to commonjs but leaves `import.meta` untouched (it's
// valid-but-different syntax, not part of the modules-to-commonjs
// transform), which still throws under Node's commonjs loader. Shim it to
// the CJS-equivalent file URL — this is the same rewrite bundlers apply
// automatically; no @babel/* package beyond the already-installed
// @babel/core is required.
module.exports = function importMetaUrlShimPlugin({ types: t }) {
  return {
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
          path.replaceWith(
            t.objectExpression([
              t.objectProperty(
                t.identifier('url'),
                t.memberExpression(
                  t.callExpression(
                    t.memberExpression(
                      t.callExpression(t.identifier('require'), [t.stringLiteral('url')]),
                      t.identifier('pathToFileURL')
                    ),
                    [t.identifier('__filename')]
                  ),
                  t.identifier('href')
                )
              ),
            ])
          )
        }
      },
    },
  }
}
