import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappLink, whatsappNumber } from "../src/lib/whatsapp";

test("numéros WhatsApp", () => {
  assert.equal(whatsappNumber("+225 07 12 34 56 78"), "2250712345678");
  assert.equal(whatsappNumber("00 33 6 12 34 56 78"), "33612345678");
  assert.equal(whatsappNumber("06 12 34 56 78"), "33612345678"); // France par défaut
  assert.equal(whatsappNumber("06.12.34.56.78", "France"), "33612345678");
  assert.equal(whatsappNumber("07 12 34 56 78", "Côte d'Ivoire"), "2250712345678"); // le 0 reste en Côte d'Ivoire
  assert.equal(whatsappNumber("77 123 45 67", "Sénégal"), "221771234567");
  assert.equal(whatsappNumber("221 77 123 45 67", "Senegal"), "221771234567");
  assert.equal(whatsappNumber("90 12 34 56", "Togo"), "22890123456");
  assert.equal(whatsappNumber("90 12 34 56"), null); // pays inconnu
  assert.equal(whatsappNumber("abc"), null);
  assert.equal(whatsappNumber(null), null);
  assert.equal(whatsappLink("33612345678", "Bonjour à vous"), "https://wa.me/33612345678?text=Bonjour%20%C3%A0%20vous");
});
