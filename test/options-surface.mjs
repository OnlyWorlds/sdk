/**
 * The package's exported surface, read with the TypeScript checker from src/index.ts (or another entry,
 * a subpath's, relative to this file): every
 * parameter of every exported function, constructor and public method whose type is an object
 * (not a primitive, an array, a function, or a built-in such as Blob or Response; a type with a
 * string index signature is a record by nature and left out). test/options.test.mjs holds each
 * such parameter either as fenced (an options object, called with an unknown key) or as data (with
 * why), and fails on one it does not hold: a new options parameter cannot ship unfenced unseen.
 *
 * A parameter is named `fn#index`: `readWorldFile#1`, `new OwV2Client#0`, `OwV2Client.list#1`.
 */

import ts from 'typescript';
import { fileURLToPath } from 'node:url';

export function objectParameters(from = '../src/index.ts') {
  const entry = fileURLToPath(new URL(from, import.meta.url));
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10,
    lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'], strict: true, skipLibCheck: true, noEmit: true, resolveJsonModule: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const fromLib = (decl) => program.isSourceFileDefaultLibrary(decl.getSourceFile()) || decl.getSourceFile().fileName.includes('node_modules');

  /** Whether one (non-union) type is an object a caller hands over as settings or as data. */
  const isObjectParam = (t) => {
    if (t.flags & ts.TypeFlags.TypeParameter) t = checker.getBaseConstraintOfType(t) ?? t;
    if (!(t.flags & ts.TypeFlags.Object)) return false;
    if (checker.isArrayType(t) || checker.isTupleType(t)) return false;
    if (t.getCallSignatures().length || t.getConstructSignatures().length) return false;
    if (checker.getIndexInfoOfType(t, ts.IndexKind.String)) return false;
    // A built-in (Blob, Response, Uint8Array) is not settings; a mapped type (Pick, Omit) is declared in the lib but shaped here.
    const decls = t.getSymbol()?.getDeclarations() ?? [];
    if (!(t.objectFlags & ts.ObjectFlags.Mapped) && decls.length && decls.every(fromLib)) return false;
    return checker.getPropertiesOfType(t).length > 0;
  };
  const paramIsObject = (param, at) => {
    let t = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(param, at));
    const parts = t.isUnion() ? t.types : [t];
    // A union with a record member (an element body `OwElement | Record<string, unknown>`) is data.
    if (parts.some(p => p.flags & ts.TypeFlags.Object && checker.getIndexInfoOfType(p, ts.IndexKind.String))) return false;
    return parts.some(isObjectParam);
  };

  const found = new Set();
  const visitSignatures = (name, sigs, at) => {
    for (const sig of sigs) {
      sig.getParameters().forEach((p, i) => { if (paramIsObject(p, at)) found.add(`${name}#${i}`); });
    }
  };
  const isPublic = (decl) => {
    const flags = ts.getCombinedModifierFlags(decl);
    return !(flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) && !(decl.name && ts.isPrivateIdentifier(decl.name));
  };

  const moduleSymbol = checker.getSymbolAtLocation(source);
  for (let sym of checker.getExportsOfModule(moduleSymbol)) {
    const name = sym.getName();
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    if (!(sym.flags & ts.SymbolFlags.Value)) continue;
    const decl = sym.valueDeclaration ?? sym.getDeclarations()?.[0];
    if (!decl) continue;
    const type = checker.getTypeOfSymbolAtLocation(sym, decl);
    visitSignatures(name, type.getCallSignatures(), decl);
    if (sym.flags & ts.SymbolFlags.Class) {
      visitSignatures(`new ${name}`, type.getConstructSignatures(), decl);
      const statics = checker.getPropertiesOfType(type).filter(p => p.getName() !== 'prototype');
      const instance = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(sym));
      for (const [members, sep] of [[statics, '.'], [instance, '.']]) {
        for (const m of members) {
          const md = m.valueDeclaration ?? m.getDeclarations()?.[0];
          if (!md || fromLib(md) || !isPublic(md)) continue;
          const mt = checker.getTypeOfSymbolAtLocation(m, md);
          visitSignatures(`${name}${sep}${m.getName()}`, mt.getCallSignatures(), md);
        }
      }
    }
  }
  return [...found].sort();
}
