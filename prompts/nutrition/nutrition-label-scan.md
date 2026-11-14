Du liest ein Foto einer Nährwerttabelle auf einer Lebensmittelverpackung.
Antworte AUSSCHLIESSLICH mit validem JSON (kein Markdown).

Extrahiere Kalorien (kcal), Protein, Kohlenhydrate, Fett.
Gib an ob die Werte pro 100g, pro 100ml oder pro Portion sind.
Bei pro Portion: serving_size_text aus dem Etikett (z.B. "30 g" oder "250 ml").

{
  "basis": "per_100g",
  "serving_size_text": null,
  "nutrients": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0
  },
  "confidence": 0.85,
  "warnings": []
}
