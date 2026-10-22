// src/tests/documentLegal.test.js
// Documents légaux : nettoyage du HTML de l'éditeur (lib/htmlDocumentLegal.js)
// et lecture du champ accepte_cgu (services/documentLegal.service.js).
// Lancement : node --experimental-test-module-mocks --test src/tests/documentLegal.test.js

import test from "node:test";
import assert from "node:assert/strict";

test.mock.module("../lib/prisma.js", { defaultExport: {} });

const { nettoyerHtmlDocumentLegal, texteBrut } = await import("../lib/htmlDocumentLegal.js");
const { cguAcceptees, cguRefusees } = await import("../services/documentLegal.service.js");

test("supprime scripts, styles, classes et gestionnaires d'événements", () => {
  const html = nettoyerHtmlDocumentLegal(
    '<h2 style="color:red" class="x" onclick="alert(1)">Article 1</h2>' +
      '<script>alert(1)</script><p><span style="font-size:40px">Texte</span></p>' +
      '<img src=x onerror="alert(1)"><iframe src="https://exemple.com"></iframe>'
  );
  assert.equal(html, "<h2>Article 1</h2><p>Texte</p>");
});

test("garde la structure et convertit les titres hors plage", () => {
  const html = nettoyerHtmlDocumentLegal(
    "<h1>Titre</h1><h5>Sous</h5><b>gras</b> <i>it</i><ul><li>un</li></ul><blockquote>c</blockquote><hr>"
  );
  assert.equal(html, "<h2>Titre</h2><h4>Sous</h4><strong>gras</strong> <em>it</em><ul><li>un</li></ul><blockquote>c</blockquote><hr />");
});

test("liens : http(s), mailto, tel et relatifs seulement", () => {
  assert.equal(
    nettoyerHtmlDocumentLegal('<a href="javascript:alert(1)" target="_blank">x</a>'),
    "<a>x</a>"
  );
  assert.equal(nettoyerHtmlDocumentLegal('<a href="/contact">c</a>'), '<a href="/contact">c</a>');
  assert.equal(nettoyerHtmlDocumentLegal('<a href="mailto:a@b.cm">m</a>'), '<a href="mailto:a@b.cm">m</a>');
  assert.equal(nettoyerHtmlDocumentLegal('<a href="//evil.com">p</a>'), "<a>p</a>");
});

test("entrée non textuelle → chaîne vide ; texte brut sans balises", () => {
  assert.equal(nettoyerHtmlDocumentLegal(null), "");
  assert.equal(texteBrut("<h2>Article&nbsp;1</h2><p>  Objet   du  service </p>"), "Article 1 Objet du service");
});

test("accepte_cgu : JSON et multipart", () => {
  assert.equal(cguAcceptees({ accepte_cgu: true }), true);
  assert.equal(cguAcceptees({ accepte_cgu: "true" }), true);
  assert.equal(cguAcceptees({}), false);
  assert.equal(cguRefusees({ accepte_cgu: false }), true);
  assert.equal(cguRefusees({ accepte_cgu: "false" }), true);
  assert.equal(cguRefusees({}), false);
  assert.equal(cguRefusees(undefined), false);
});
