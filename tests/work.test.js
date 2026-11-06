import test from "node:test";
import assert from "node:assert/strict";
import { buildWebsitePrompt, normalizeExclusionTerms } from "../public/work.js";

test("normaliza termos excluídos e remove acentos/espaços vazios", () => {
  assert.deepEqual(
    normalizeExclusionTerms(" advocacia, ESCRITÓRIO de advocacia ,, advogado "),
    ["advocacia", "escritorio de advocacia", "advogado"]
  );
});

test("prompt do site usa somente os campos manuais permitidos", () => {
  const prompt = buildWebsitePrompt({
    name: "Ateliê Aurora",
    service: "Corte e coloração",
    location: "Campinas, SP",
    details: "Atendimento com hora marcada; visual contemporâneo.",
    contact: "(19) 3333-4444",
    googlePlace: { name: "Dado que não deve ser copiado", address: "Rua obtida do Maps" }
  });

  assert.match(prompt, /Ateliê Aurora/);
  assert.match(prompt, /Corte e coloração/);
  assert.match(prompt, /Campinas, SP/);
  assert.match(prompt, /3333-4444/);
  assert.doesNotMatch(prompt, /Dado que não deve ser copiado/);
  assert.doesNotMatch(prompt, /Rua obtida do Maps/);
});

test("prompt exige nome e serviço confirmados", () => {
  assert.throws(() => buildWebsitePrompt({ name: "Cliente" }), /nome confirmado.*serviço/i);
  assert.throws(() => buildWebsitePrompt({ service: "Reparos" }), /nome confirmado.*serviço/i);
});

test("briefing é limitado a comprimentos razoáveis", () => {
  const prompt = buildWebsitePrompt({ name: "A".repeat(200), service: "B".repeat(200) });
  assert.match(prompt, new RegExp("A".repeat(120)));
  assert.doesNotMatch(prompt, new RegExp("A".repeat(121)));
});
