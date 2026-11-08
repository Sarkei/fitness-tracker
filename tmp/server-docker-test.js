// server.ts
import "dotenv/config";
import express from "express";

// aiProviders.ts
import { GoogleGenAI } from "@google/genai";
var PLACEHOLDER_SUBSTRINGS = ["your_mistral_api_key_here", "your_gemini_api_key_here"];
function isConfiguredApiKey(key) {
  if (key == null || typeof key !== "string") return false;
  const t = key.trim();
  if (t.length < 16) return false;
  const lower = t.toLowerCase();
  if (PLACEHOLDER_SUBSTRINGS.some((p) => lower.includes(p))) return false;
  if (/^your[_\s]/i.test(t) && /key/i.test(t)) return false;
  return true;
}
function resolveAiCapabilities() {
  const mistralConfigured = isConfiguredApiKey(process.env.MISTRAL_API_KEY);
  const geminiConfigured = isConfiguredApiKey(process.env.GEMINI_API_KEY);
  const enabled = mistralConfigured || geminiConfigured;
  const provider = mistralConfigured ? "mistral" : geminiConfigured ? "gemini" : "none";
  return { enabled, provider, mistralConfigured, geminiConfigured };
}
async function mistralChat(messages, jsonObject) {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages,
      ...jsonObject ? { response_format: { type: "json_object" } } : {},
      temperature: 0.7,
      max_tokens: 8e3
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}
async function mistralVision(messages) {
  const key = process.env.MISTRAL_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("MISTRAL_API_KEY not configured");
  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "pixtral-large-latest",
      messages,
      temperature: 0.5,
      max_tokens: 4096
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Mistral vision error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}
async function geminiGenerate(prompt, inlineImage) {
  const key = process.env.GEMINI_API_KEY;
  if (!isConfiguredApiKey(key)) throw new Error("GEMINI_API_KEY not configured");
  const ai = new GoogleGenAI({ apiKey: key });
  const parts = [
    { text: prompt }
  ];
  if (inlineImage) {
    parts.push({ inlineData: { mimeType: inlineImage.mimeType, data: inlineImage.data } });
  }
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts }]
  });
  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}
async function completeCoachJson(messages) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no valid API keys configured");
  if (caps.mistralConfigured) {
    try {
      return await mistralChat(messages, true);
    } catch (e) {
      console.warn("[AI] Mistral coach request failed, falling back to Gemini:", e);
      if (!isConfiguredApiKey(process.env.GEMINI_API_KEY)) throw e;
    }
  }
  const merged = messages.map((m) => `${m.role.toUpperCase()}:
${m.content}`).join("\n\n---\n\n");
  const prompt = `${merged}

Respond with ONLY valid JSON (no markdown fences).`;
  return geminiGenerate(prompt);
}
async function completeMealAnalysis(prompt, image) {
  const caps = resolveAiCapabilities();
  if (!caps.enabled) throw new Error("AI features disabled: no valid API keys configured");
  if (caps.mistralConfigured) {
    try {
      if (image) {
        const dataUrl = `data:${image.mimeType};base64,${image.data}`;
        const messages = [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: dataUrl }
            ]
          }
        ];
        return await mistralVision(messages);
      }
      return await mistralChat([{ role: "user", content: prompt }], false);
    } catch (e) {
      console.warn("[AI] Mistral meal analysis failed, trying Gemini:", e);
      if (!isConfiguredApiKey(process.env.GEMINI_API_KEY)) throw e;
    }
  }
  return geminiGenerate(prompt, image);
}
async function completeWorkoutTemplateJson(prompt) {
  return completeCoachJson([{ role: "user", content: prompt }]);
}

// src/lib/foodDatabase.ts
var _id = 0;
var id = () => `food_${++_id}`;
var FOOD_DATABASE = [
  // =======================================================================
  // PROTEIN – Fleisch & Geflügel
  // =======================================================================
  { id: id(), name: "H\xFChnerbrust (roh)", category: "protein", nutrients: { calories: 165, protein: 31, carbs: 0, fat: 3.6 }, servings: [{ name: "100g", grams: 100 }, { name: "150g", grams: 150 }, { name: "200g", grams: 200 }] },
  { id: id(), name: "H\xFChnerbrust (gebraten)", category: "protein", nutrients: { calories: 195, protein: 33, carbs: 0, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "H\xFChnerbrust (paniert)", category: "protein", nutrients: { calories: 260, protein: 18, carbs: 15, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Schnitzel (180g)", grams: 180 }] },
  { id: id(), name: "H\xE4hnchenschenkel (mit Haut)", category: "protein", nutrients: { calories: 215, protein: 26, carbs: 0, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (200g)", grams: 200 }] },
  { id: id(), name: "H\xE4hnchenschenkel (ohne Haut)", category: "protein", nutrients: { calories: 170, protein: 28, carbs: 0, fat: 6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "H\xE4hnchenfl\xFCgel", category: "protein", nutrients: { calories: 290, protein: 27, carbs: 0, fat: 19 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (90g)", grams: 90 }] },
  { id: id(), name: "Putenbrust (roh)", category: "protein", nutrients: { calories: 110, protein: 24, carbs: 0, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Putenbrust (gebraten)", category: "protein", nutrients: { calories: 150, protein: 29, carbs: 0, fat: 3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Putengeschnetzeltes", category: "protein", nutrients: { calories: 145, protein: 25, carbs: 2, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Rinderfilet (roh)", category: "protein", nutrients: { calories: 130, protein: 22, carbs: 0, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Steak (200g)", grams: 200 }] },
  { id: id(), name: "Rindersteak (gebraten)", category: "protein", nutrients: { calories: 180, protein: 28, carbs: 0, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Steak (160g)", grams: 160 }] },
  { id: id(), name: "Rinderhackfleisch (mager)", category: "protein", nutrients: { calories: 150, protein: 26, carbs: 0, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (125g)", grams: 125 }] },
  { id: id(), name: "Rinderhackfleisch (20% Fett)", category: "protein", nutrients: { calories: 245, protein: 19, carbs: 0, fat: 18 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Patty (125g)", grams: 125 }] },
  { id: id(), name: "Rindergulasch", category: "protein", nutrients: { calories: 140, protein: 20, carbs: 3, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Roastbeef", category: "protein", nutrients: { calories: 135, protein: 22, carbs: 0, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Scheiben (90g)", grams: 90 }] },
  { id: id(), name: "Schweineschnitzel (roh)", category: "protein", nutrients: { calories: 105, protein: 22, carbs: 0, fat: 1.9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schweineschnitzel (paniert)", category: "protein", nutrients: { calories: 240, protein: 16, carbs: 17, fat: 12 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schweinefilet", category: "protein", nutrients: { calories: 109, protein: 22, carbs: 0, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schweinehackfleisch", category: "protein", nutrients: { calories: 230, protein: 16, carbs: 0, fat: 18 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Spareribs", category: "protein", nutrients: { calories: 290, protein: 20, carbs: 2, fat: 22 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Lammkotelett", category: "protein", nutrients: { calories: 280, protein: 17, carbs: 0, fat: 23 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lammkeule", category: "protein", nutrients: { calories: 165, protein: 23, carbs: 0, fat: 8 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kalbsschnitzel", category: "protein", nutrients: { calories: 110, protein: 22, carbs: 0, fat: 2.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wildschweinkeule", category: "protein", nutrients: { calories: 120, protein: 23, carbs: 0, fat: 2.8 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Hirschgulasch", category: "protein", nutrients: { calories: 115, protein: 22, carbs: 0, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Entenbrust", category: "protein", nutrients: { calories: 201, protein: 19, carbs: 0, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Brust (200g)", grams: 200 }] },
  { id: id(), name: "G\xE4nsebrust", category: "protein", nutrients: { calories: 238, protein: 17, carbs: 0, fat: 18 }, servings: [{ name: "100g", grams: 100 }] },
  // PROTEIN – Wurst & Aufschnitt
  { id: id(), name: "H\xE4hnchenwurst", category: "protein", nutrients: { calories: 160, protein: 16, carbs: 2, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (20g)", grams: 20 }] },
  { id: id(), name: "Putenwurst", category: "protein", nutrients: { calories: 140, protein: 17, carbs: 2, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (20g)", grams: 20 }] },
  { id: id(), name: "Salami", category: "protein", nutrients: { calories: 380, protein: 22, carbs: 1, fat: 33 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (15g)", grams: 15 }] },
  { id: id(), name: "Schinken (gekocht)", category: "protein", nutrients: { calories: 110, protein: 19, carbs: 1, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (25g)", grams: 25 }] },
  { id: id(), name: "Schinken (roh/Serrano)", category: "protein", nutrients: { calories: 145, protein: 26, carbs: 0.5, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (30g)", grams: 30 }] },
  { id: id(), name: "Prosciutto di Parma", category: "protein", nutrients: { calories: 175, protein: 25, carbs: 0.3, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (30g)", grams: 30 }] },
  { id: id(), name: "Wiener W\xFCrstchen", category: "protein", nutrients: { calories: 295, protein: 13, carbs: 1, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (50g)", grams: 50 }] },
  { id: id(), name: "Bratwurst", category: "protein", nutrients: { calories: 310, protein: 14, carbs: 1, fat: 28 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Leberwurst", category: "protein", nutrients: { calories: 310, protein: 13, carbs: 3, fat: 28 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (25g)", grams: 25 }] },
  { id: id(), name: "Mettwurst", category: "protein", nutrients: { calories: 350, protein: 16, carbs: 0, fat: 31 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (25g)", grams: 25 }] },
  { id: id(), name: "Chorizo", category: "protein", nutrients: { calories: 455, protein: 24, carbs: 1, fat: 40 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Scheiben (30g)", grams: 30 }] },
  { id: id(), name: "Pepperoni", category: "protein", nutrients: { calories: 494, protein: 21, carbs: 0.5, fat: 44 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (5g)", grams: 5 }] },
  { id: id(), name: "Mortadella", category: "protein", nutrients: { calories: 315, protein: 15, carbs: 2, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (20g)", grams: 20 }] },
  { id: id(), name: "Bacon (gebraten)", category: "protein", nutrients: { calories: 541, protein: 37, carbs: 1, fat: 42 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Streifen (30g)", grams: 30 }] },
  { id: id(), name: "Speck (ger\xE4uchert)", category: "protein", nutrients: { calories: 455, protein: 20, carbs: 0, fat: 41 }, servings: [{ name: "100g", grams: 100 }] },
  // PROTEIN – Fisch & Meeresfrüchte
  { id: id(), name: "Lachsfilet (frisch)", category: "protein", nutrients: { calories: 208, protein: 20, carbs: 0, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (125g)", grams: 125 }] },
  { id: id(), name: "Lachs (ger\xE4uchert)", category: "protein", nutrients: { calories: 142, protein: 20, carbs: 0, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (50g)", grams: 50 }] },
  { id: id(), name: "Thunfisch (in Wasser, Dose)", category: "protein", nutrients: { calories: 130, protein: 29, carbs: 0, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (150g)", grams: 150 }] },
  { id: id(), name: "Thunfisch (in \xD6l, Dose)", category: "protein", nutrients: { calories: 200, protein: 27, carbs: 0, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (150g)", grams: 150 }] },
  { id: id(), name: "Kabeljau (Dorsch)", category: "protein", nutrients: { calories: 82, protein: 18, carbs: 0, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (180g)", grams: 180 }] },
  { id: id(), name: "Forelle (frisch)", category: "protein", nutrients: { calories: 119, protein: 20, carbs: 0, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (150g)", grams: 150 }] },
  { id: id(), name: "Forelle (ger\xE4uchert)", category: "protein", nutrients: { calories: 140, protein: 22, carbs: 0, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sardinen in \xD6l (Dose)", category: "protein", nutrients: { calories: 208, protein: 25, carbs: 0, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (90g)", grams: 90 }] },
  { id: id(), name: "Sardinen in Tomatensauce (Dose)", category: "protein", nutrients: { calories: 160, protein: 17, carbs: 2, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (120g)", grams: 120 }] },
  { id: id(), name: "Makrele (frisch)", category: "protein", nutrients: { calories: 205, protein: 19, carbs: 0, fat: 14 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Makrele (ger\xE4uchert)", category: "protein", nutrients: { calories: 305, protein: 19, carbs: 0, fat: 25 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Hering (frisch)", category: "protein", nutrients: { calories: 158, protein: 18, carbs: 0, fat: 9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Hering (Rollmops)", category: "protein", nutrients: { calories: 125, protein: 12, carbs: 4, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (60g)", grams: 60 }] },
  { id: id(), name: "Zander", category: "protein", nutrients: { calories: 83, protein: 19, carbs: 0, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Heilbutt", category: "protein", nutrients: { calories: 110, protein: 22, carbs: 0, fat: 2.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Scholle", category: "protein", nutrients: { calories: 91, protein: 18, carbs: 0, fat: 1.9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Tilapia", category: "protein", nutrients: { calories: 96, protein: 20, carbs: 0, fat: 1.7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Pangasius", category: "protein", nutrients: { calories: 89, protein: 17, carbs: 0, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Seelachs", category: "protein", nutrients: { calories: 79, protein: 17, carbs: 0, fat: 0.8 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Garnelen", category: "protein", nutrients: { calories: 99, protein: 24, carbs: 0.2, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Tintenfisch", category: "protein", nutrients: { calories: 92, protein: 16, carbs: 3, fat: 1.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Muscheln", category: "protein", nutrients: { calories: 86, protein: 12, carbs: 4, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lachs (Dose)", category: "protein", nutrients: { calories: 139, protein: 20, carbs: 0, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (213g)", grams: 213 }] },
  // PROTEIN – Eier
  { id: id(), name: "Eier", category: "protein", nutrients: { calories: 155, protein: 13, carbs: 1.1, fat: 11 }, servings: [{ name: "1 Stk. (M, 50g)", grams: 50 }, { name: "1 Stk. (L, 60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Eiwei\xDF", category: "protein", nutrients: { calories: 52, protein: 11, carbs: 0.7, fat: 0.2 }, servings: [{ name: "1 Stk. (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Eigelb", category: "protein", nutrients: { calories: 322, protein: 16, carbs: 1, fat: 27 }, servings: [{ name: "1 Stk. (20g)", grams: 20 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Spiegelei", category: "protein", nutrients: { calories: 196, protein: 14, carbs: 0.6, fat: 15 }, servings: [{ name: "1 Stk. (55g)", grams: 55 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "R\xFChrei (mit Milch)", category: "protein", nutrients: { calories: 155, protein: 12, carbs: 1.5, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Eier (120g)", grams: 120 }] },
  { id: id(), name: "Hartgekochte Eier", category: "protein", nutrients: { calories: 155, protein: 13, carbs: 1.1, fat: 11 }, servings: [{ name: "1 Stk. (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  // PROTEIN – Hülsenfrüchte & Pflanzlich
  { id: id(), name: "Kichererbsen (gekocht)", category: "protein", nutrients: { calories: 139, protein: 8, carbs: 27, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (240g)", grams: 240 }] },
  { id: id(), name: "Linsen rot (gekocht)", category: "protein", nutrients: { calories: 116, protein: 9, carbs: 20, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Linsen braun (gekocht)", category: "protein", nutrients: { calories: 105, protein: 8, carbs: 18, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Linsen gr\xFCn (gekocht)", category: "protein", nutrients: { calories: 112, protein: 9, carbs: 19, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kidneybohnen (aus der Dose)", category: "protein", nutrients: { calories: 105, protein: 8, carbs: 15, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (250g)", grams: 250 }] },
  { id: id(), name: "Wei\xDFe Bohnen (gekocht)", category: "protein", nutrients: { calories: 115, protein: 8, carbs: 17, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schwarze Bohnen (gekocht)", category: "protein", nutrients: { calories: 132, protein: 9, carbs: 24, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Edamame (gesch\xE4lt)", category: "protein", nutrients: { calories: 121, protein: 11, carbs: 9, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Schale (150g)", grams: 150 }] },
  { id: id(), name: "Tofu (natur)", category: "protein", nutrients: { calories: 76, protein: 8, carbs: 2, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Block (200g)", grams: 200 }] },
  { id: id(), name: "Tofu (gebraten)", category: "protein", nutrients: { calories: 145, protein: 15, carbs: 3, fat: 9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Tempeh", category: "protein", nutrients: { calories: 193, protein: 19, carbs: 9, fat: 11 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Seitan", category: "protein", nutrients: { calories: 370, protein: 75, carbs: 14, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sojageschnetzeltes (trocken)", category: "protein", nutrients: { calories: 330, protein: 50, carbs: 15, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lupinen (gekocht)", category: "protein", nutrients: { calories: 119, protein: 16, carbs: 10, fat: 3 }, servings: [{ name: "100g", grams: 100 }] },
  // PROTEIN – Proteinpulver
  { id: id(), name: "Whey-Proteinpulver", category: "protein", nutrients: { calories: 400, protein: 80, carbs: 7, fat: 5 }, servings: [{ name: "1 Portion (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Casein-Proteinpulver", category: "protein", nutrients: { calories: 360, protein: 80, carbs: 4, fat: 2 }, servings: [{ name: "1 Portion (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Erbsenproteinpulver", category: "protein", nutrients: { calories: 380, protein: 78, carbs: 5, fat: 5 }, servings: [{ name: "1 Portion (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Veganer Burger-Patty", category: "protein", nutrients: { calories: 250, protein: 15, carbs: 8, fat: 18 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Patty (113g)", grams: 113 }] },
  // =======================================================================
  // KOHLENHYDRATE – Reis & Getreide
  // =======================================================================
  { id: id(), name: "Haferflocken", category: "carbs", nutrients: { calories: 389, protein: 17, carbs: 66, fat: 7 }, servings: [{ name: "1 Portion (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Haferflocken (zart)", category: "carbs", nutrients: { calories: 372, protein: 13, carbs: 67, fat: 6 }, servings: [{ name: "1 Portion (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Reis (Langkorn, ungekocht)", category: "carbs", nutrients: { calories: 360, protein: 7, carbs: 80, fat: 1 }, servings: [{ name: "1 Tasse (185g)", grams: 185 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Reis (Langkorn, gekocht)", category: "carbs", nutrients: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Basmati Reis (ungekocht)", category: "carbs", nutrients: { calories: 350, protein: 9, carbs: 78, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Jasmin Reis (ungekocht)", category: "carbs", nutrients: { calories: 355, protein: 7, carbs: 79, fat: 0.8 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Vollkornreis (ungekocht)", category: "carbs", nutrients: { calories: 350, protein: 8, carbs: 77, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wildreis (ungekocht)", category: "carbs", nutrients: { calories: 357, protein: 15, carbs: 75, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sushi-Reis (ungekocht)", category: "carbs", nutrients: { calories: 345, protein: 6, carbs: 78, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Parboiled Reis (ungekocht)", category: "carbs", nutrients: { calories: 352, protein: 8, carbs: 79, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Quinoa (ungekocht)", category: "carbs", nutrients: { calories: 368, protein: 14, carbs: 64, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (170g)", grams: 170 }] },
  { id: id(), name: "Bulgur (ungekocht)", category: "carbs", nutrients: { calories: 342, protein: 12, carbs: 76, fat: 1.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Couscous (ungekocht)", category: "carbs", nutrients: { calories: 376, protein: 13, carbs: 77, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Buchweizen", category: "carbs", nutrients: { calories: 343, protein: 13, carbs: 71, fat: 3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Hirse", category: "carbs", nutrients: { calories: 378, protein: 11, carbs: 72, fat: 4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Amaranth", category: "carbs", nutrients: { calories: 371, protein: 14, carbs: 65, fat: 7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Dinkel (K\xF6rner)", category: "carbs", nutrients: { calories: 338, protein: 15, carbs: 63, fat: 2.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Gerste (Graupen)", category: "carbs", nutrients: { calories: 354, protein: 10, carbs: 73, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }] },
  // KOHLENHYDRATE – Nudeln
  { id: id(), name: "Nudeln (ungekocht)", category: "carbs", nutrients: { calories: 370, protein: 13, carbs: 75, fat: 1.5 }, servings: [{ name: "1 Portion (80g)", grams: 80 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Nudeln (gekocht)", category: "carbs", nutrients: { calories: 131, protein: 5, carbs: 25, fat: 1 }, servings: [{ name: "1 Portion (200g)", grams: 200 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Vollkornnudeln (ungekocht)", category: "carbs", nutrients: { calories: 350, protein: 15, carbs: 64, fat: 2.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Spaghetti (ungekocht)", category: "carbs", nutrients: { calories: 371, protein: 13, carbs: 75, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (80g)", grams: 80 }] },
  { id: id(), name: "Penne (ungekocht)", category: "carbs", nutrients: { calories: 352, protein: 12, carbs: 72, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Fusilli (ungekocht)", category: "carbs", nutrients: { calories: 352, protein: 12, carbs: 72, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Reisnudeln (ungekocht)", category: "carbs", nutrients: { calories: 364, protein: 3, carbs: 82, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Glasnudeln (ungekocht)", category: "carbs", nutrients: { calories: 350, protein: 0, carbs: 86, fat: 0 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sp\xE4tzle (frisch)", category: "carbs", nutrients: { calories: 160, protein: 6, carbs: 30, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Gnocchi", category: "carbs", nutrients: { calories: 150, protein: 4, carbs: 32, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Schupfnudeln", category: "carbs", nutrients: { calories: 150, protein: 4, carbs: 31, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Lasagne-Platten (ungekocht)", category: "carbs", nutrients: { calories: 350, protein: 12, carbs: 72, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mie-Nudeln (ungekocht)", category: "carbs", nutrients: { calories: 351, protein: 10, carbs: 69, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Nest (70g)", grams: 70 }] },
  // KOHLENHYDRATE – Brot & Backwaren
  { id: id(), name: "Vollkornbrot", category: "carbs", nutrients: { calories: 250, protein: 13, carbs: 41, fat: 3 }, servings: [{ name: "1 Scheibe (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Roggenbrot", category: "carbs", nutrients: { calories: 259, protein: 9, carbs: 48, fat: 3.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (50g)", grams: 50 }] },
  { id: id(), name: "Toastbrot (Weizen)", category: "carbs", nutrients: { calories: 260, protein: 8, carbs: 49, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (35g)", grams: 35 }] },
  { id: id(), name: "Toastbrot (Vollkorn)", category: "carbs", nutrients: { calories: 250, protein: 9, carbs: 42, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (35g)", grams: 35 }] },
  { id: id(), name: "Kn\xE4ckebrot", category: "carbs", nutrients: { calories: 352, protein: 11, carbs: 67, fat: 2.5 }, servings: [{ name: "1 Scheibe (10g)", grams: 10 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Baguette", category: "carbs", nutrients: { calories: 250, protein: 8, carbs: 50, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (30g)", grams: 30 }] },
  { id: id(), name: "Ciabatta", category: "carbs", nutrients: { calories: 270, protein: 8, carbs: 52, fat: 3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Br\xF6tchen (Weizen)", category: "carbs", nutrients: { calories: 270, protein: 9, carbs: 55, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (60g)", grams: 60 }] },
  { id: id(), name: "Br\xF6tchen (Vollkorn)", category: "carbs", nutrients: { calories: 240, protein: 10, carbs: 45, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (65g)", grams: 65 }] },
  { id: id(), name: "Croissant", category: "carbs", nutrients: { calories: 406, protein: 8, carbs: 45, fat: 21 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (70g)", grams: 70 }] },
  { id: id(), name: "Tortilla-Wrap (Weizen)", category: "carbs", nutrients: { calories: 310, protein: 8, carbs: 52, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Wrap (60g)", grams: 60 }] },
  { id: id(), name: "Tortilla (Mais)", category: "carbs", nutrients: { calories: 234, protein: 5, carbs: 48, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Pita-Brot", category: "carbs", nutrients: { calories: 275, protein: 9, carbs: 56, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (60g)", grams: 60 }] },
  { id: id(), name: "Naan-Brot", category: "carbs", nutrients: { calories: 310, protein: 9, carbs: 56, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (90g)", grams: 90 }] },
  { id: id(), name: "Laugenbrezel", category: "carbs", nutrients: { calories: 325, protein: 10, carbs: 65, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (75g)", grams: 75 }] },
  { id: id(), name: "Pumpernickel", category: "carbs", nutrients: { calories: 223, protein: 9, carbs: 45, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (25g)", grams: 25 }] },
  { id: id(), name: "Weizenmehl (Type 405)", category: "carbs", nutrients: { calories: 348, protein: 10, carbs: 72, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Dinkelmehl", category: "carbs", nutrients: { calories: 345, protein: 12, carbs: 70, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Polenta (trocken)", category: "carbs", nutrients: { calories: 350, protein: 8, carbs: 75, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  // KOHLENHYDRATE – Kartoffeln
  { id: id(), name: "Kartoffeln (roh)", category: "carbs", nutrients: { calories: 77, protein: 2, carbs: 17, fat: 0.1 }, servings: [{ name: "1 mittelgro\xDF (150g)", grams: 150 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kartoffeln (gekocht)", category: "carbs", nutrients: { calories: 86, protein: 1.9, carbs: 20, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Kartoffeln (gebacken)", category: "carbs", nutrients: { calories: 93, protein: 2.5, carbs: 21, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (200g)", grams: 200 }] },
  { id: id(), name: "S\xFC\xDFkartoffel", category: "carbs", nutrients: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 mittelgro\xDF (200g)", grams: 200 }] },
  { id: id(), name: "Pommes frites (hausgemacht)", category: "carbs", nutrients: { calories: 312, protein: 3.5, carbs: 41, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Kartoffelp\xFCree", category: "carbs", nutrients: { calories: 90, protein: 2, carbs: 18, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  // KOHLENHYDRATE – Müsli & Frühstückscerealien
  { id: id(), name: "M\xFCsli (unges\xFC\xDFt)", category: "carbs", nutrients: { calories: 370, protein: 10, carbs: 62, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (60g)", grams: 60 }] },
  { id: id(), name: "Granola", category: "carbs", nutrients: { calories: 450, protein: 9, carbs: 60, fat: 18 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (50g)", grams: 50 }] },
  { id: id(), name: "Cornflakes", category: "carbs", nutrients: { calories: 357, protein: 8, carbs: 84, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (30g)", grams: 30 }] },
  { id: id(), name: "Corn Flakes (ges\xFC\xDFt)", category: "carbs", nutrients: { calories: 380, protein: 5, carbs: 88, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (30g)", grams: 30 }] },
  // =======================================================================
  // FETTE
  // =======================================================================
  { id: id(), name: "Avocado", category: "fat", nutrients: { calories: 160, protein: 2, carbs: 9, fat: 15 }, servings: [{ name: "1/2 Stk. (70g)", grams: 70 }, { name: "1 Stk. (140g)", grams: 140 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Mandeln", category: "fat", nutrients: { calories: 579, protein: 21, carbs: 22, fat: 50 }, servings: [{ name: "1 Handvoll (25g)", grams: 25 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Oliven\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "1 TL (5ml)", grams: 5 }, { name: "1 EL (15ml)", grams: 15 }, { name: "100ml", grams: 100 }] },
  { id: id(), name: "Erdnussbutter", category: "fat", nutrients: { calories: 588, protein: 25, carbs: 20, fat: 50 }, servings: [{ name: "1 EL (16g)", grams: 16 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Waln\xFCsse", category: "fat", nutrients: { calories: 654, protein: 15, carbs: 14, fat: 65 }, servings: [{ name: "1 Handvoll (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Chiasamen", category: "fat", nutrients: { calories: 486, protein: 17, carbs: 42, fat: 31 }, servings: [{ name: "1 EL (10g)", grams: 10 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cashewkerne", category: "fat", nutrients: { calories: 553, protein: 18, carbs: 30, fat: 44 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Macadamian\xFCsse", category: "fat", nutrients: { calories: 718, protein: 8, carbs: 14, fat: 76 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Leinsamen", category: "fat", nutrients: { calories: 534, protein: 18, carbs: 29, fat: 42 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Kokos\xF6l", category: "fat", nutrients: { calories: 862, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (14g)", grams: 14 }] },
  { id: id(), name: "Sonnenblumen\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Raps\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Sesam\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Butter", category: "fat", nutrients: { calories: 717, protein: 0.9, carbs: 0.1, fat: 81 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Butterschmalz (Ghee)", category: "fat", nutrients: { calories: 898, protein: 0.3, carbs: 0, fat: 99 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Margarine", category: "fat", nutrients: { calories: 717, protein: 0, carbs: 0.5, fat: 80 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Pekann\xFCsse", category: "fat", nutrients: { calories: 691, protein: 9, carbs: 14, fat: 72 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Pistazien", category: "fat", nutrients: { calories: 562, protein: 20, carbs: 28, fat: 45 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Erdn\xFCsse (ger\xF6stet)", category: "fat", nutrients: { calories: 585, protein: 24, carbs: 16, fat: 50 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Haseln\xFCsse", category: "fat", nutrients: { calories: 628, protein: 15, carbs: 17, fat: 61 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Sonnenblumenkerne", category: "fat", nutrients: { calories: 584, protein: 21, carbs: 20, fat: 51 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "K\xFCrbiskerne", category: "fat", nutrients: { calories: 559, protein: 30, carbs: 11, fat: 49 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Pinienkerne", category: "fat", nutrients: { calories: 673, protein: 14, carbs: 13, fat: 68 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Mandelmus", category: "fat", nutrients: { calories: 614, protein: 21, carbs: 19, fat: 56 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Cashewmus", category: "fat", nutrients: { calories: 585, protein: 18, carbs: 27, fat: 46 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Tahini (Sesammus)", category: "fat", nutrients: { calories: 595, protein: 17, carbs: 21, fat: 54 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Paran\xFCsse", category: "fat", nutrients: { calories: 656, protein: 14, carbs: 12, fat: 66 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kokosflocken", category: "fat", nutrients: { calories: 660, protein: 7, carbs: 15, fat: 64 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "K\xFCrbiskern\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  // =======================================================================
  // OBST
  // =======================================================================
  { id: id(), name: "Apfel", category: "fruit", nutrients: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2 }, servings: [{ name: "1 Stk. (150g)", grams: 150 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Banane", category: "fruit", nutrients: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 }, servings: [{ name: "1 Stk. (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Orange", category: "fruit", nutrients: { calories: 47, protein: 0.9, carbs: 12, fat: 0.1 }, servings: [{ name: "1 Stk. (130g)", grams: 130 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Weintrauben", category: "fruit", nutrients: { calories: 69, protein: 0.7, carbs: 18, fat: 0.2 }, servings: [{ name: "1 Tasse (150g)", grams: 150 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Mango", category: "fruit", nutrients: { calories: 60, protein: 0.8, carbs: 15, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (200g)", grams: 200 }] },
  { id: id(), name: "Wassermelone", category: "fruit", nutrients: { calories: 30, protein: 0.6, carbs: 8, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (280g)", grams: 280 }] },
  { id: id(), name: "Erdbeeren", category: "fruit", nutrients: { calories: 32, protein: 0.7, carbs: 8, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (150g)", grams: 150 }] },
  { id: id(), name: "Himbeeren", category: "fruit", nutrients: { calories: 52, protein: 1.2, carbs: 12, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (120g)", grams: 120 }] },
  { id: id(), name: "Blaubeeren", category: "fruit", nutrients: { calories: 57, protein: 0.7, carbs: 14, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (150g)", grams: 150 }] },
  { id: id(), name: "Brombeere", category: "fruit", nutrients: { calories: 43, protein: 1.4, carbs: 10, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Beerenmix", category: "fruit", nutrients: { calories: 45, protein: 1, carbs: 10, fat: 0.4 }, servings: [{ name: "1 Tasse (150g)", grams: 150 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Birne", category: "fruit", nutrients: { calories: 57, protein: 0.4, carbs: 15, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Pfirsich", category: "fruit", nutrients: { calories: 39, protein: 0.9, carbs: 10, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Nektarine", category: "fruit", nutrients: { calories: 44, protein: 1.1, carbs: 11, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (140g)", grams: 140 }] },
  { id: id(), name: "Mandarine", category: "fruit", nutrients: { calories: 53, protein: 0.8, carbs: 13, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (75g)", grams: 75 }] },
  { id: id(), name: "Clementine", category: "fruit", nutrients: { calories: 47, protein: 0.9, carbs: 12, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (65g)", grams: 65 }] },
  { id: id(), name: "Zitrone", category: "fruit", nutrients: { calories: 29, protein: 1.1, carbs: 9, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Limette", category: "fruit", nutrients: { calories: 30, protein: 0.7, carbs: 11, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Grapefruit", category: "fruit", nutrients: { calories: 42, protein: 0.8, carbs: 11, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1/2 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Kiwi", category: "fruit", nutrients: { calories: 61, protein: 1.1, carbs: 15, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (75g)", grams: 75 }] },
  { id: id(), name: "Ananas", category: "fruit", nutrients: { calories: 50, protein: 0.5, carbs: 13, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (120g)", grams: 120 }] },
  { id: id(), name: "Kirsche", category: "fruit", nutrients: { calories: 63, protein: 1.1, carbs: 16, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Pflaume", category: "fruit", nutrients: { calories: 46, protein: 0.7, carbs: 11, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (60g)", grams: 60 }] },
  { id: id(), name: "Aprikose", category: "fruit", nutrients: { calories: 48, protein: 1.4, carbs: 11, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (40g)", grams: 40 }] },
  { id: id(), name: "Papaya", category: "fruit", nutrients: { calories: 43, protein: 0.5, carbs: 11, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Granatapfel", category: "fruit", nutrients: { calories: 83, protein: 1.7, carbs: 19, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Feige (frisch)", category: "fruit", nutrients: { calories: 74, protein: 0.8, carbs: 19, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (50g)", grams: 50 }] },
  { id: id(), name: "Feige (getrocknet)", category: "fruit", nutrients: { calories: 249, protein: 3.3, carbs: 64, fat: 0.9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Dattel (getrocknet)", category: "fruit", nutrients: { calories: 282, protein: 2.5, carbs: 75, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (8g)", grams: 8 }] },
  { id: id(), name: "Honigmelone", category: "fruit", nutrients: { calories: 36, protein: 0.5, carbs: 9, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (150g)", grams: 150 }] },
  { id: id(), name: "Cantaloupe-Melone", category: "fruit", nutrients: { calories: 34, protein: 0.8, carbs: 8, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Johannisbeere (schwarz)", category: "fruit", nutrients: { calories: 63, protein: 1.4, carbs: 15, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Stachelbeere", category: "fruit", nutrients: { calories: 44, protein: 0.9, carbs: 10, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Maracuja", category: "fruit", nutrients: { calories: 97, protein: 2.2, carbs: 23, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kokosnuss (Fruchtfleisch)", category: "fruit", nutrients: { calories: 354, protein: 3, carbs: 15, fat: 33 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rosinen", category: "fruit", nutrients: { calories: 299, protein: 3.1, carbs: 79, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Cranberries (getrocknet)", category: "fruit", nutrients: { calories: 308, protein: 0.1, carbs: 83, fat: 1.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Aprikosen (getrocknet)", category: "fruit", nutrients: { calories: 241, protein: 3.4, carbs: 63, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Pflaumen (getrocknet)", category: "fruit", nutrients: { calories: 240, protein: 2.2, carbs: 64, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (30g)", grams: 30 }] },
  // =======================================================================
  // GEMÜSE
  // =======================================================================
  { id: id(), name: "Brokkoli", category: "vegetable", nutrients: { calories: 55, protein: 3.7, carbs: 11, fat: 0.6 }, servings: [{ name: "1 Tasse (90g)", grams: 90 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Spinat (frisch)", category: "vegetable", nutrients: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 }, servings: [{ name: "1 Tasse (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Spinat (gefroren)", category: "vegetable", nutrients: { calories: 22, protein: 2.7, carbs: 3.2, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Paprika (rot)", category: "vegetable", nutrients: { calories: 31, protein: 1, carbs: 6, fat: 0.3 }, servings: [{ name: "1 Stk. (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Paprika (gr\xFCn)", category: "vegetable", nutrients: { calories: 20, protein: 0.9, carbs: 4.6, fat: 0.2 }, servings: [{ name: "1 Stk. (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Paprika (gelb)", category: "vegetable", nutrients: { calories: 27, protein: 1, carbs: 6.3, fat: 0.2 }, servings: [{ name: "1 Stk. (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Gurke", category: "vegetable", nutrients: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 }, servings: [{ name: "1/2 Gurke (150g)", grams: 150 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Tomate", category: "vegetable", nutrients: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, servings: [{ name: "1 Stk. (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cherrytomaten", category: "vegetable", nutrients: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "10 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Karotte", category: "vegetable", nutrients: { calories: 41, protein: 0.9, carbs: 10, fat: 0.2 }, servings: [{ name: "1 Stk. (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Blumenkohl", category: "vegetable", nutrients: { calories: 25, protein: 1.9, carbs: 5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rote Bete", category: "vegetable", nutrients: { calories: 43, protein: 1.6, carbs: 10, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Gr\xFCne Bohnen", category: "vegetable", nutrients: { calories: 31, protein: 1.8, carbs: 7, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (125g)", grams: 125 }] },
  { id: id(), name: "Erbsen (frisch)", category: "vegetable", nutrients: { calories: 81, protein: 5.4, carbs: 14, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sellerie (Stauden)", category: "vegetable", nutrients: { calories: 16, protein: 0.7, carbs: 3, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stange (40g)", grams: 40 }] },
  { id: id(), name: "Knollensellerie", category: "vegetable", nutrients: { calories: 42, protein: 1.5, carbs: 9, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lauch (Porree)", category: "vegetable", nutrients: { calories: 61, protein: 1.5, carbs: 14, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Zwiebel", category: "vegetable", nutrients: { calories: 40, protein: 1.1, carbs: 9, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Rote Zwiebel", category: "vegetable", nutrients: { calories: 45, protein: 1.4, carbs: 10, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Fr\xFChlingszwiebeln", category: "vegetable", nutrients: { calories: 32, protein: 1.8, carbs: 7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Knoblauch", category: "vegetable", nutrients: { calories: 149, protein: 6, carbs: 33, fat: 0.5 }, servings: [{ name: "1 Zehe (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Wei\xDFkohl", category: "vegetable", nutrients: { calories: 25, protein: 1.3, carbs: 6, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rotkohl", category: "vegetable", nutrients: { calories: 31, protein: 1.4, carbs: 7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rosenkohl", category: "vegetable", nutrients: { calories: 43, protein: 3.4, carbs: 9, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kohlrabi", category: "vegetable", nutrients: { calories: 27, protein: 1.7, carbs: 6, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wirsing", category: "vegetable", nutrients: { calories: 27, protein: 2, carbs: 5, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "K\xFCrbis (Hokkaido)", category: "vegetable", nutrients: { calories: 63, protein: 1.7, carbs: 12, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "K\xFCrbis (Butternut)", category: "vegetable", nutrients: { calories: 45, protein: 1, carbs: 12, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Aubergine", category: "vegetable", nutrients: { calories: 25, protein: 1, carbs: 6, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (250g)", grams: 250 }] },
  { id: id(), name: "Zucchini", category: "vegetable", nutrients: { calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (200g)", grams: 200 }] },
  { id: id(), name: "Champignons", category: "vegetable", nutrients: { calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Steinpilze", category: "vegetable", nutrients: { calories: 82, protein: 5.4, carbs: 6, fat: 4.8 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Pfifferlinge", category: "vegetable", nutrients: { calories: 38, protein: 1.5, carbs: 7, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Shiitake-Pilze", category: "vegetable", nutrients: { calories: 34, protein: 2.2, carbs: 7, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Portobello-Pilze", category: "vegetable", nutrients: { calories: 22, protein: 2.1, carbs: 3.9, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (80g)", grams: 80 }] },
  { id: id(), name: "Spargel (gr\xFCn)", category: "vegetable", nutrients: { calories: 20, protein: 2.2, carbs: 3.9, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Spargel (wei\xDF)", category: "vegetable", nutrients: { calories: 18, protein: 1.9, carbs: 3.3, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Artischocke", category: "vegetable", nutrients: { calories: 47, protein: 3.3, carbs: 11, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Eisbergsalat", category: "vegetable", nutrients: { calories: 14, protein: 0.9, carbs: 3, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kopfsalat", category: "vegetable", nutrients: { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rucola", category: "vegetable", nutrients: { calories: 25, protein: 2.6, carbs: 3.7, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (20g)", grams: 20 }] },
  { id: id(), name: "Feldsalat", category: "vegetable", nutrients: { calories: 21, protein: 2, carbs: 2, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Fenchel", category: "vegetable", nutrients: { calories: 31, protein: 1.2, carbs: 7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Pastinake", category: "vegetable", nutrients: { calories: 75, protein: 1.2, carbs: 18, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Radieschen", category: "vegetable", nutrients: { calories: 16, protein: 0.7, carbs: 3.4, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mangold", category: "vegetable", nutrients: { calories: 19, protein: 1.8, carbs: 3.7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Gr\xFCnkohl", category: "vegetable", nutrients: { calories: 49, protein: 4.3, carbs: 9, fat: 0.9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Pak Choi", category: "vegetable", nutrients: { calories: 13, protein: 1.5, carbs: 2.2, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mais (frisch)", category: "vegetable", nutrients: { calories: 90, protein: 3, carbs: 19, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Kolben (200g)", grams: 200 }] },
  { id: id(), name: "Ingwer (frisch)", category: "vegetable", nutrients: { calories: 80, protein: 1.8, carbs: 18, fat: 0.8 }, servings: [{ name: "1 cm (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Chili (frisch)", category: "vegetable", nutrients: { calories: 40, protein: 1.9, carbs: 9, fat: 0.4 }, servings: [{ name: "1 Stk. (15g)", grams: 15 }, { name: "100g", grams: 100 }] },
  // =======================================================================
  // MILCHPRODUKTE & ALTERNATIVEN
  // =======================================================================
  { id: id(), name: "Magerquark", category: "dairy", nutrients: { calories: 68, protein: 12, carbs: 4, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (250g)", grams: 250 }, { name: "1 Becher (500g)", grams: 500 }] },
  { id: id(), name: "Quark (20% Fett)", category: "dairy", nutrients: { calories: 98, protein: 11, carbs: 3, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (250g)", grams: 250 }] },
  { id: id(), name: "Milch (3,5%)", category: "dairy", nutrients: { calories: 64, protein: 3.3, carbs: 4.8, fat: 3.5 }, servings: [{ name: "1 Glas (200ml)", grams: 200 }, { name: "100ml", grams: 100 }] },
  { id: id(), name: "Milch (1,5%)", category: "dairy", nutrients: { calories: 46, protein: 3.3, carbs: 4.8, fat: 1.5 }, servings: [{ name: "1 Glas (200ml)", grams: 200 }, { name: "100ml", grams: 100 }] },
  { id: id(), name: "Milch (fettarm, 0,1%)", category: "dairy", nutrients: { calories: 34, protein: 3.4, carbs: 4.7, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }] },
  { id: id(), name: "Griechischer Joghurt (10%)", category: "dairy", nutrients: { calories: 120, protein: 9, carbs: 4, fat: 10 }, servings: [{ name: "1 Portion (150g)", grams: 150 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Griechischer Joghurt (2%)", category: "dairy", nutrients: { calories: 70, protein: 10, carbs: 3.5, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Joghurt (1,5% Fett)", category: "dairy", nutrients: { calories: 60, protein: 3.5, carbs: 4.7, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Joghurt (3,5% Fett)", category: "dairy", nutrients: { calories: 68, protein: 3.5, carbs: 4.7, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Skyr (natur)", category: "dairy", nutrients: { calories: 63, protein: 11, carbs: 4, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (400g)", grams: 400 }] },
  { id: id(), name: "Kefir", category: "dairy", nutrients: { calories: 60, protein: 3.3, carbs: 4, fat: 3.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Buttermilch", category: "dairy", nutrients: { calories: 40, protein: 3.3, carbs: 5, fat: 0.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "K\xE4se (Gouda)", category: "dairy", nutrients: { calories: 356, protein: 25, carbs: 2, fat: 27 }, servings: [{ name: "1 Scheibe (25g)", grams: 25 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Emmentaler", category: "dairy", nutrients: { calories: 380, protein: 29, carbs: 0, fat: 29 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (30g)", grams: 30 }] },
  { id: id(), name: "Bergk\xE4se", category: "dairy", nutrients: { calories: 400, protein: 28, carbs: 0, fat: 32 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (30g)", grams: 30 }] },
  { id: id(), name: "Camembert", category: "dairy", nutrients: { calories: 280, protein: 21, carbs: 0, fat: 22 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Ecke (30g)", grams: 30 }] },
  { id: id(), name: "Brie", category: "dairy", nutrients: { calories: 334, protein: 21, carbs: 0.5, fat: 28 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Ecke (30g)", grams: 30 }] },
  { id: id(), name: "Parmesan", category: "dairy", nutrients: { calories: 431, protein: 38, carbs: 0, fat: 29 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Mozzarella", category: "dairy", nutrients: { calories: 280, protein: 28, carbs: 3.1, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Kugel (125g)", grams: 125 }] },
  { id: id(), name: "Feta-K\xE4se", category: "dairy", nutrients: { calories: 264, protein: 14, carbs: 4.1, fat: 21 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "H\xFCttenk\xE4se", category: "dairy", nutrients: { calories: 98, protein: 11, carbs: 3.4, fat: 4.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (200g)", grams: 200 }] },
  { id: id(), name: "Ricotta", category: "dairy", nutrients: { calories: 174, protein: 11, carbs: 3, fat: 13 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mascarpone", category: "dairy", nutrients: { calories: 412, protein: 5, carbs: 4, fat: 42 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Frischk\xE4se (Doppelrahm)", category: "dairy", nutrients: { calories: 230, protein: 8, carbs: 3, fat: 22 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Frischk\xE4se (light)", category: "dairy", nutrients: { calories: 110, protein: 12, carbs: 4, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Sahne (30%)", category: "dairy", nutrients: { calories: 288, protein: 2.3, carbs: 3.1, fat: 30 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Schmand (24%)", category: "dairy", nutrients: { calories: 228, protein: 2.6, carbs: 3, fat: 24 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Creme Fraiche (30%)", category: "dairy", nutrients: { calories: 292, protein: 2.4, carbs: 2.7, fat: 30 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Saure Sahne (10%)", category: "dairy", nutrients: { calories: 115, protein: 3, carbs: 4, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Hafermilch", category: "dairy", nutrients: { calories: 48, protein: 0.8, carbs: 6.8, fat: 1.5 }, servings: [{ name: "1 Glas (200ml)", grams: 200 }, { name: "100ml", grams: 100 }] },
  { id: id(), name: "Sojamilch", category: "dairy", nutrients: { calories: 54, protein: 3.3, carbs: 6, fat: 1.8 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Mandelmilch", category: "dairy", nutrients: { calories: 15, protein: 0.5, carbs: 0.5, fat: 1.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Kokosmilch", category: "dairy", nutrients: { calories: 230, protein: 2.3, carbs: 6, fat: 24 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Reismilch", category: "dairy", nutrients: { calories: 50, protein: 0.1, carbs: 10, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Sojajoghurt (natur)", category: "dairy", nutrients: { calories: 55, protein: 4, carbs: 2, fat: 3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Fruchtjoghurt (Erdbeere)", category: "dairy", nutrients: { calories: 95, protein: 3, carbs: 17, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Fruchtjoghurt (Kirsche)", category: "dairy", nutrients: { calories: 97, protein: 3, carbs: 17, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  // =======================================================================
  // SAUCEN & AUFSTRICHE
  // =======================================================================
  { id: id(), name: "Soja-Sauce", category: "sauce", nutrients: { calories: 53, protein: 8, carbs: 5, fat: 0.6 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "BBQ Sauce", category: "sauce", nutrients: { calories: 172, protein: 1, carbs: 42, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (18g)", grams: 18 }] },
  { id: id(), name: "Sriracha", category: "sauce", nutrients: { calories: 100, protein: 2, carbs: 22, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (5g)", grams: 5 }] },
  { id: id(), name: "Pesto (gr\xFCn)", category: "sauce", nutrients: { calories: 450, protein: 5, carbs: 4, fat: 45 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Pesto (rot)", category: "sauce", nutrients: { calories: 380, protein: 7, carbs: 8, fat: 36 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Mayonnaise (80%)", category: "sauce", nutrients: { calories: 720, protein: 1, carbs: 1, fat: 79 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Mayonnaise (light)", category: "sauce", nutrients: { calories: 260, protein: 1, carbs: 6, fat: 25 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Ketchup", category: "sauce", nutrients: { calories: 100, protein: 1.5, carbs: 22, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Ketchup (zuckerreduziert)", category: "sauce", nutrients: { calories: 45, protein: 1.5, carbs: 5, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Senf (mittelscharf)", category: "sauce", nutrients: { calories: 105, protein: 6, carbs: 4, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (5g)", grams: 5 }] },
  { id: id(), name: "Dijon-Senf", category: "sauce", nutrients: { calories: 130, protein: 7, carbs: 6, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (5g)", grams: 5 }] },
  { id: id(), name: "Tomatenmark", category: "sauce", nutrients: { calories: 82, protein: 4, carbs: 19, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Passierte Tomaten", category: "sauce", nutrients: { calories: 22, protein: 1, carbs: 4, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Packung (500g)", grams: 500 }] },
  { id: id(), name: "Sweet-Chili-Sauce", category: "sauce", nutrients: { calories: 215, protein: 0.5, carbs: 52, fat: 0.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Teriyaki-Sauce", category: "sauce", nutrients: { calories: 150, protein: 2, carbs: 35, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Guacamole", category: "sauce", nutrients: { calories: 150, protein: 2, carbs: 8, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Hummus", category: "sauce", nutrients: { calories: 250, protein: 8, carbs: 14, fat: 18 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Tzatziki", category: "sauce", nutrients: { calories: 95, protein: 3, carbs: 5, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Salsa-Sauce", category: "sauce", nutrients: { calories: 35, protein: 1, carbs: 7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Worcestershire-Sauce", category: "sauce", nutrients: { calories: 78, protein: 1, carbs: 19, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 TL (5ml)", grams: 5 }] },
  { id: id(), name: "Tabasko", category: "sauce", nutrients: { calories: 12, protein: 0.6, carbs: 2, fat: 0.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 TL (5ml)", grams: 5 }] },
  { id: id(), name: "Hoisin-Sauce", category: "sauce", nutrients: { calories: 220, protein: 3, carbs: 50, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Oyster-Sauce", category: "sauce", nutrients: { calories: 80, protein: 2, carbs: 17, fat: 0.3 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Fischsauce", category: "sauce", nutrients: { calories: 35, protein: 5, carbs: 4, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Salatdressing (Essig & \xD6l)", category: "sauce", nutrients: { calories: 450, protein: 0, carbs: 3, fat: 48 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Salatdressing (Joghurt)", category: "sauce", nutrients: { calories: 150, protein: 2, carbs: 10, fat: 11 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Caesar Dressing", category: "sauce", nutrients: { calories: 360, protein: 3, carbs: 5, fat: 37 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Balsamico-Essig", category: "sauce", nutrients: { calories: 88, protein: 0.5, carbs: 17, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Apfelessig", category: "sauce", nutrients: { calories: 22, protein: 0, carbs: 1, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Meerrettich (geraspelt)", category: "sauce", nutrients: { calories: 59, protein: 2.5, carbs: 11, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Nutella", category: "sauce", nutrients: { calories: 547, protein: 6, carbs: 57, fat: 33 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Marmelade (Erdbeere)", category: "sauce", nutrients: { calories: 260, protein: 0.5, carbs: 64, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Honig", category: "sauce", nutrients: { calories: 304, protein: 0.3, carbs: 82, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (21g)", grams: 21 }] },
  { id: id(), name: "Agavendicksaft", category: "sauce", nutrients: { calories: 310, protein: 0.1, carbs: 76, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (21g)", grams: 21 }] },
  // =======================================================================
  // KONSERVEN & EINGELEGTES
  // =======================================================================
  { id: id(), name: "Thunfisch (Dose, in Wasser)", category: "canned", nutrients: { calories: 116, protein: 26, carbs: 0, fat: 1 }, servings: [{ name: "1 Dose (185g)", grams: 185 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Thunfisch (Dose, in \xD6l)", category: "canned", nutrients: { calories: 198, protein: 27, carbs: 0, fat: 10 }, servings: [{ name: "1 Dose (185g)", grams: 185 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Sardinen (Dose, in \xD6l)", category: "canned", nutrients: { calories: 208, protein: 25, carbs: 0, fat: 11 }, servings: [{ name: "1 Dose (90g)", grams: 90 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Makrele (Dose, in Tomatensauce)", category: "canned", nutrients: { calories: 155, protein: 16, carbs: 3, fat: 9 }, servings: [{ name: "1 Dose (125g)", grams: 125 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Hering (Dose, in Sahnesauce)", category: "canned", nutrients: { calories: 195, protein: 14, carbs: 6, fat: 13 }, servings: [{ name: "1 Dose (200g)", grams: 200 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kidneybohnen (Dose)", category: "canned", nutrients: { calories: 90, protein: 7, carbs: 13, fat: 0.4 }, servings: [{ name: "1 Dose (400g)", grams: 400 }, { name: "100g (abgetropft)", grams: 100 }] },
  { id: id(), name: "Kichererbsen (Dose)", category: "canned", nutrients: { calories: 119, protein: 7, carbs: 20, fat: 2 }, servings: [{ name: "1 Dose (400g)", grams: 400 }, { name: "100g (abgetropft)", grams: 100 }] },
  { id: id(), name: "Linsen (Dose)", category: "canned", nutrients: { calories: 100, protein: 8, carbs: 17, fat: 0.4 }, servings: [{ name: "1 Dose (400g)", grams: 400 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Wei\xDFe Bohnen (Dose)", category: "canned", nutrients: { calories: 95, protein: 6, carbs: 15, fat: 0.4 }, servings: [{ name: "1 Dose (400g)", grams: 400 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Mais (Dose)", category: "canned", nutrients: { calories: 85, protein: 3, carbs: 15, fat: 1 }, servings: [{ name: "1 Dose (140g)", grams: 140 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Erbsen (Dose)", category: "canned", nutrients: { calories: 69, protein: 5, carbs: 11, fat: 0.3 }, servings: [{ name: "1 Dose (265g)", grams: 265 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Gr\xFCne Bohnen (Dose)", category: "canned", nutrients: { calories: 25, protein: 1.4, carbs: 5, fat: 0.2 }, servings: [{ name: "1 Dose (265g)", grams: 265 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Spinat (Dose)", category: "canned", nutrients: { calories: 19, protein: 2.5, carbs: 2, fat: 0.5 }, servings: [{ name: "1 Dose (265g)", grams: 265 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Tomaten (gesch\xE4lt, Dose)", category: "canned", nutrients: { calories: 19, protein: 1, carbs: 3.5, fat: 0.2 }, servings: [{ name: "1 Dose (400g)", grams: 400 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Tomaten (gew\xFCrfelt, Dose)", category: "canned", nutrients: { calories: 18, protein: 0.9, carbs: 3.4, fat: 0.2 }, servings: [{ name: "1 Dose (400g)", grams: 400 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Artischockenherzen (Dose)", category: "canned", nutrients: { calories: 29, protein: 2, carbs: 5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Pfirsiche (Dose, im Saft)", category: "canned", nutrients: { calories: 53, protein: 0.5, carbs: 13, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Ananas (Dose)", category: "canned", nutrients: { calories: 70, protein: 0.4, carbs: 18, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (565g)", grams: 565 }] },
  { id: id(), name: "Mandeln (ger\xF6stet, Dose)", category: "canned", nutrients: { calories: 620, protein: 23, carbs: 18, fat: 54 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Krabben (Dose)", category: "canned", nutrients: { calories: 84, protein: 17, carbs: 0.5, fat: 1.3 }, servings: [{ name: "1 Dose (170g)", grams: 170 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Muscheln (Dose)", category: "canned", nutrients: { calories: 82, protein: 12, carbs: 3, fat: 2 }, servings: [{ name: "1 Dose (130g)", grams: 130 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "G\xFCrkchen (Cornichons)", category: "canned", nutrients: { calories: 12, protein: 0.5, carbs: 2, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Essiggurken", category: "canned", nutrients: { calories: 15, protein: 0.7, carbs: 2.5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (50g)", grams: 50 }] },
  { id: id(), name: "Sauerkraut (Dose)", category: "canned", nutrients: { calories: 19, protein: 1, carbs: 4, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Rote Bete (Dose/Glas)", category: "canned", nutrients: { calories: 42, protein: 1.5, carbs: 9, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Oliven (gr\xFCn, Glas)", category: "canned", nutrients: { calories: 145, protein: 1, carbs: 4, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "10 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Oliven (schwarz, Dose)", category: "canned", nutrients: { calories: 115, protein: 0.8, carbs: 6, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "10 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Kapern (Glas)", category: "canned", nutrients: { calories: 23, protein: 2.4, carbs: 5, fat: 0.9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Sonnmatte Tomaten (Glas)", category: "canned", nutrients: { calories: 213, protein: 5, carbs: 23, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Kokosmilch (Dose)", category: "canned", nutrients: { calories: 230, protein: 2.3, carbs: 6, fat: 24 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (400ml)", grams: 400 }] },
  { id: id(), name: "Bohnen im Tomaten-Sugo (Dose)", category: "canned", nutrients: { calories: 78, protein: 5, carbs: 13, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Rindfleisch (Dose)", category: "canned", nutrients: { calories: 190, protein: 23, carbs: 0, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (340g)", grams: 340 }] },
  { id: id(), name: "Bockwurst (Dose)", category: "canned", nutrients: { calories: 275, protein: 12, carbs: 1, fat: 24 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (80g)", grams: 80 }] },
  // =======================================================================
  // TIEFKÜHLPRODUKTE
  // =======================================================================
  { id: id(), name: "Brokkoli (TK)", category: "frozen", nutrients: { calories: 33, protein: 2.8, carbs: 5.5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Erbsen (TK)", category: "frozen", nutrients: { calories: 73, protein: 5, carbs: 12, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Spinat (TK, gehackt)", category: "frozen", nutrients: { calories: 22, protein: 2.7, carbs: 3, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Blattspinat (TK)", category: "frozen", nutrients: { calories: 22, protein: 2.7, carbs: 3.2, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Edamame (TK, gesch\xE4lt)", category: "frozen", nutrients: { calories: 121, protein: 11, carbs: 9, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mais (TK)", category: "frozen", nutrients: { calories: 86, protein: 3.2, carbs: 19, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rote Bete (TK, vorgekocht)", category: "frozen", nutrients: { calories: 45, protein: 1.7, carbs: 10, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "M\xF6hren (TK)", category: "frozen", nutrients: { calories: 35, protein: 0.9, carbs: 8, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Blumenkohl (TK)", category: "frozen", nutrients: { calories: 24, protein: 1.9, carbs: 4.5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Paprika-Mix (TK)", category: "frozen", nutrients: { calories: 27, protein: 1.1, carbs: 5.6, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wokgem\xFCse (TK)", category: "frozen", nutrients: { calories: 38, protein: 2.5, carbs: 6, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Beerenmix (TK)", category: "frozen", nutrients: { calories: 45, protein: 1, carbs: 10, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (150g)", grams: 150 }] },
  { id: id(), name: "Himbeeren (TK)", category: "frozen", nutrients: { calories: 52, protein: 1.2, carbs: 12, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Blaubeeren (TK)", category: "frozen", nutrients: { calories: 57, protein: 0.7, carbs: 14, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mango (TK)", category: "frozen", nutrients: { calories: 60, protein: 0.8, carbs: 15, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "H\xFChnernuggets (TK)", category: "frozen", nutrients: { calories: 240, protein: 14, carbs: 18, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "6 Stk. (120g)", grams: 120 }] },
  { id: id(), name: "Fischst\xE4bchen (TK)", category: "frozen", nutrients: { calories: 230, protein: 12, carbs: 21, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (90g)", grams: 90 }] },
  { id: id(), name: "Schlemmerfilet (TK)", category: "frozen", nutrients: { calories: 200, protein: 14, carbs: 14, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (170g)", grams: 170 }] },
  { id: id(), name: "Pommes frites (TK)", category: "frozen", nutrients: { calories: 171, protein: 2.7, carbs: 27, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Kroketten (TK)", category: "frozen", nutrients: { calories: 185, protein: 2.5, carbs: 28, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Pizza (TK, Margherita)", category: "frozen", nutrients: { calories: 230, protein: 9, carbs: 32, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Pizza (360g)", grams: 360 }] },
  { id: id(), name: "Pizza (TK, Salami)", category: "frozen", nutrients: { calories: 257, protein: 10, carbs: 29, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Pizza (370g)", grams: 370 }] },
  { id: id(), name: "Lasagne (TK)", category: "frozen", nutrients: { calories: 138, protein: 7, carbs: 16, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (400g)", grams: 400 }] },
  { id: id(), name: "Eis (Vanille, TK)", category: "frozen", nutrients: { calories: 207, protein: 3.5, carbs: 24, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Kugel (50g)", grams: 50 }] },
  { id: id(), name: "Eis (Schokolade, TK)", category: "frozen", nutrients: { calories: 215, protein: 3, carbs: 24, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Kugel (50g)", grams: 50 }] },
  { id: id(), name: "Sorbet (Mango)", category: "frozen", nutrients: { calories: 97, protein: 0.4, carbs: 25, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Kugel (60g)", grams: 60 }] },
  { id: id(), name: "Rote-Linsen-Suppe (TK)", category: "frozen", nutrients: { calories: 75, protein: 5, carbs: 12, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  // =======================================================================
  // FERTIGGERICHTE & CONVENIENCE
  // =======================================================================
  { id: id(), name: "Instant-Nudeln", category: "readymeal", nutrients: { calories: 437, protein: 9, carbs: 63, fat: 17 }, servings: [{ name: "1 Packung (85g)", grams: 85 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cup Noodles", category: "readymeal", nutrients: { calories: 395, protein: 8, carbs: 60, fat: 14 }, servings: [{ name: "1 Becher (64g)", grams: 64 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Knorr Fix \u2013 Spaghetti Bolognese", category: "readymeal", nutrients: { calories: 65, protein: 3, carbs: 12, fat: 0.8 }, servings: [{ name: "100g (zubereitet)", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Knorr Fix \u2013 Chili con Carne", category: "readymeal", nutrients: { calories: 110, protein: 7, carbs: 15, fat: 2.5 }, servings: [{ name: "100g (zubereitet)", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Dosensuppe (Tomatensuppe)", category: "readymeal", nutrients: { calories: 62, protein: 1.4, carbs: 12, fat: 1.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (400ml)", grams: 400 }] },
  { id: id(), name: "Dosensuppe (H\xFChnersuppe)", category: "readymeal", nutrients: { calories: 55, protein: 3, carbs: 7, fat: 1.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (400ml)", grams: 400 }] },
  { id: id(), name: "Fertig-Bolognese (Glas)", category: "readymeal", nutrients: { calories: 95, protein: 6, carbs: 9, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Glas (350g)", grams: 350 }] },
  { id: id(), name: "Fertig-Tomatensauce (Glas)", category: "readymeal", nutrients: { calories: 65, protein: 2, carbs: 10, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Glas (400g)", grams: 400 }] },
  { id: id(), name: "Fertig-Curry (Korma, Dose)", category: "readymeal", nutrients: { calories: 95, protein: 4, carbs: 8, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Reistopf (Mikrowelle)", category: "readymeal", nutrients: { calories: 140, protein: 3, carbs: 30, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Packung (250g)", grams: 250 }] },
  { id: id(), name: "Dosenravioli", category: "readymeal", nutrients: { calories: 95, protein: 4, carbs: 15, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (425g)", grams: 425 }] },
  { id: id(), name: "Erbswurst (Instant)", category: "readymeal", nutrients: { calories: 378, protein: 25, carbs: 45, fat: 12 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kartoffelp\xFCreepulver", category: "readymeal", nutrients: { calories: 355, protein: 8, carbs: 75, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion zub. (200g)", grams: 200 }] },
  { id: id(), name: "Instant-Oatmeal (Hafer To Go)", category: "readymeal", nutrients: { calories: 380, protein: 12, carbs: 62, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (70g)", grams: 70 }] },
  { id: id(), name: "Kochbeutel-Reis", category: "readymeal", nutrients: { calories: 348, protein: 7, carbs: 79, fat: 0.5 }, servings: [{ name: "100g trocken", grams: 100 }, { name: "1 Beutel (125g)", grams: 125 }] },
  { id: id(), name: "Fertigpizza (Flammkuchen)", category: "readymeal", nutrients: { calories: 265, protein: 8, carbs: 35, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (170g)", grams: 170 }] },
  { id: id(), name: "Mac and Cheese (Fertigpackung)", category: "readymeal", nutrients: { calories: 148, protein: 5.5, carbs: 22, fat: 5 }, servings: [{ name: "100g zubereitet", grams: 100 }, { name: "1 Portion (225g)", grams: 225 }] },
  { id: id(), name: "Fertig-Eintopf (Linseneintopf)", category: "readymeal", nutrients: { calories: 82, protein: 5, carbs: 13, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Fertig-Eintopf (Erbseneintopf)", category: "readymeal", nutrients: { calories: 78, protein: 5, carbs: 10, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Fertig-Eintopf (Gulasch)", category: "readymeal", nutrients: { calories: 88, protein: 6, carbs: 8, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  // =======================================================================
  // FAST FOOD & RESTAURANT
  // =======================================================================
  { id: id(), name: "Big Mac", category: "fastfood", nutrients: { calories: 257, protein: 13, carbs: 22, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (215g)", grams: 215 }] },
  { id: id(), name: "McChicken", category: "fastfood", nutrients: { calories: 250, protein: 12, carbs: 26, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (190g)", grams: 190 }] },
  { id: id(), name: "Cheeseburger", category: "fastfood", nutrients: { calories: 303, protein: 15, carbs: 33, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (130g)", grams: 130 }] },
  { id: id(), name: "Pommes frites (mittel, Fast Food)", category: "fastfood", nutrients: { calories: 320, protein: 4, carbs: 42, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (117g)", grams: 117 }] },
  { id: id(), name: "Chicken McNuggets (9 Stk.)", category: "fastfood", nutrients: { calories: 245, protein: 15, carbs: 14, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "9 Stk. (162g)", grams: 162 }] },
  { id: id(), name: "D\xF6ner Kebab (Fladenbrot)", category: "fastfood", nutrients: { calories: 230, protein: 12, carbs: 24, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (350g)", grams: 350 }] },
  { id: id(), name: "Currywurst (mit Pommes)", category: "fastfood", nutrients: { calories: 270, protein: 9, carbs: 25, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Pizza (Margherita, Restaurant)", category: "fastfood", nutrients: { calories: 250, protein: 11, carbs: 34, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (100g)", grams: 100 }] },
  { id: id(), name: "Pizza (Salami, Restaurant)", category: "fastfood", nutrients: { calories: 280, protein: 12, carbs: 33, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (100g)", grams: 100 }] },
  { id: id(), name: "Pizza (Hawaii, Restaurant)", category: "fastfood", nutrients: { calories: 263, protein: 12, carbs: 35, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (100g)", grams: 100 }] },
  { id: id(), name: "Gyros (mit So\xDFe)", category: "fastfood", nutrients: { calories: 220, protein: 15, carbs: 10, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Falafel (3 Stk.)", category: "fastfood", nutrients: { calories: 333, protein: 13, carbs: 32, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (90g)", grams: 90 }] },
  { id: id(), name: "Wok-Gericht (H\xFChnchen-Gem\xFCse)", category: "fastfood", nutrients: { calories: 115, protein: 10, carbs: 10, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Sushi (Nigiri, Lachs, 2 Stk.)", category: "fastfood", nutrients: { calories: 65, protein: 4, carbs: 10, fat: 1 }, servings: [{ name: "2 Stk. (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Sushi (Maki, 6 Stk.)", category: "fastfood", nutrients: { calories: 120, protein: 5, carbs: 22, fat: 1.5 }, servings: [{ name: "6 Stk. (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Hot Dog", category: "fastfood", nutrients: { calories: 290, protein: 11, carbs: 27, fat: 16 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Wrap (Chicken Caesar)", category: "fastfood", nutrients: { calories: 235, protein: 14, carbs: 25, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (250g)", grams: 250 }] },
  { id: id(), name: "Panini (K\xE4se-Schinken)", category: "fastfood", nutrients: { calories: 310, protein: 14, carbs: 32, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (200g)", grams: 200 }] },
  { id: id(), name: "Burger King Whopper", category: "fastfood", nutrients: { calories: 256, protein: 13, carbs: 21, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (270g)", grams: 270 }] },
  { id: id(), name: "Fritierte Zwiebelringe", category: "fastfood", nutrients: { calories: 411, protein: 6, carbs: 41, fat: 26 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (100g)", grams: 100 }] },
  { id: id(), name: "Nachos (mit K\xE4se)", category: "fastfood", nutrients: { calories: 450, protein: 9, carbs: 45, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (120g)", grams: 120 }] },
  // =======================================================================
  // BÄCKEREI & GEBÄCK
  // =======================================================================
  { id: id(), name: "Muffin (Blaubeere)", category: "bakery", nutrients: { calories: 358, protein: 5, carbs: 52, fat: 15 }, servings: [{ name: "1 Stk. (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Muffin (Schoko)", category: "bakery", nutrients: { calories: 390, protein: 5, carbs: 55, fat: 17 }, servings: [{ name: "1 Stk. (110g)", grams: 110 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Donut (glasiert)", category: "bakery", nutrients: { calories: 406, protein: 5, carbs: 48, fat: 22 }, servings: [{ name: "1 Stk. (70g)", grams: 70 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Croissant (Butter)", category: "bakery", nutrients: { calories: 406, protein: 8, carbs: 45, fat: 21 }, servings: [{ name: "1 Stk. (70g)", grams: 70 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Zimtschnecke", category: "bakery", nutrients: { calories: 390, protein: 6, carbs: 55, fat: 17 }, servings: [{ name: "1 Stk. (130g)", grams: 130 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Berliner (Pfannkuchen)", category: "bakery", nutrients: { calories: 320, protein: 5, carbs: 43, fat: 14 }, servings: [{ name: "1 Stk. (85g)", grams: 85 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Apfeltasche", category: "bakery", nutrients: { calories: 295, protein: 4, carbs: 40, fat: 13 }, servings: [{ name: "1 Stk. (80g)", grams: 80 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "K\xE4sekuchen", category: "bakery", nutrients: { calories: 320, protein: 8, carbs: 25, fat: 21 }, servings: [{ name: "1 St\xFCck (125g)", grams: 125 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Apfelkuchen", category: "bakery", nutrients: { calories: 240, protein: 2, carbs: 35, fat: 10 }, servings: [{ name: "1 St\xFCck (125g)", grams: 125 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Schwarzw\xE4lder Kirschtorte", category: "bakery", nutrients: { calories: 328, protein: 3.5, carbs: 37, fat: 18 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Tiramisu", category: "bakery", nutrients: { calories: 330, protein: 5, carbs: 27, fat: 22 }, servings: [{ name: "1 Portion (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Pancakes (mit Ahornsirup)", category: "bakery", nutrients: { calories: 215, protein: 5, carbs: 36, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Waffel (Belgische)", category: "bakery", nutrients: { calories: 350, protein: 6, carbs: 46, fat: 16 }, servings: [{ name: "1 Stk. (90g)", grams: 90 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "French Toast", category: "bakery", nutrients: { calories: 229, protein: 8, carbs: 26, fat: 11 }, servings: [{ name: "1 Scheibe (70g)", grams: 70 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Brezeln (weich)", category: "bakery", nutrients: { calories: 265, protein: 8, carbs: 54, fat: 1.5 }, servings: [{ name: "1 Stk. (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Brioche", category: "bakery", nutrients: { calories: 368, protein: 9, carbs: 46, fat: 17 }, servings: [{ name: "1 Scheibe (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Strudel (Apfel)", category: "bakery", nutrients: { calories: 238, protein: 3, carbs: 40, fat: 8 }, servings: [{ name: "1 Portion (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  // =======================================================================
  // SNACKS & SÜSSWAREN
  // =======================================================================
  { id: id(), name: "Kartoffelchips", category: "snack", nutrients: { calories: 536, protein: 7, carbs: 53, fat: 35 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (25g)", grams: 25 }] },
  { id: id(), name: "Tortilla Chips", category: "snack", nutrients: { calories: 480, protein: 7, carbs: 58, fat: 25 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (25g)", grams: 25 }] },
  { id: id(), name: "Popcorn (Air-Popped)", category: "snack", nutrients: { calories: 387, protein: 13, carbs: 78, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (8g)", grams: 8 }] },
  { id: id(), name: "Popcorn (Butter)", category: "snack", nutrients: { calories: 459, protein: 8, carbs: 57, fat: 24 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tasse (8g)", grams: 8 }] },
  { id: id(), name: "Reiswaffel", category: "snack", nutrients: { calories: 386, protein: 8, carbs: 84, fat: 2.8 }, servings: [{ name: "1 Stk. (9g)", grams: 9 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Salzstangen", category: "snack", nutrients: { calories: 380, protein: 11, carbs: 78, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "10 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Cracker (Dinkel)", category: "snack", nutrients: { calories: 420, protein: 11, carbs: 62, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Nachos", category: "snack", nutrients: { calories: 481, protein: 7, carbs: 62, fat: 23 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (30g)", grams: 30 }] },
  { id: id(), name: "Erdnussflips", category: "snack", nutrients: { calories: 500, protein: 14, carbs: 45, fat: 31 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Beef Jerky", category: "snack", nutrients: { calories: 410, protein: 33, carbs: 11, fat: 25 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Beutel (30g)", grams: 30 }] },
  { id: id(), name: "Proteinriegel", category: "snack", nutrients: { calories: 350, protein: 35, carbs: 30, fat: 12 }, servings: [{ name: "1 Riegel (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "M\xFCsliriegel", category: "snack", nutrients: { calories: 420, protein: 8, carbs: 60, fat: 16 }, servings: [{ name: "1 Riegel (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "M\xFCsliriegel (low sugar)", category: "snack", nutrients: { calories: 350, protein: 6, carbs: 50, fat: 13 }, servings: [{ name: "1 Riegel (35g)", grams: 35 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kind Bar", category: "snack", nutrients: { calories: 430, protein: 8, carbs: 44, fat: 25 }, servings: [{ name: "1 Riegel (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Gummib\xE4rchen", category: "sweets", nutrients: { calories: 343, protein: 7, carbs: 77, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (25g)", grams: 25 }] },
  { id: id(), name: "Lakritz", category: "sweets", nutrients: { calories: 324, protein: 4, carbs: 74, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stangen (30g)", grams: 30 }] },
  { id: id(), name: "Haribo Goldb\xE4ren", category: "sweets", nutrients: { calories: 343, protein: 7, carbs: 77, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Beutel (200g)", grams: 200 }] },
  { id: id(), name: "Schokolade (Vollmilch)", category: "sweets", nutrients: { calories: 535, protein: 8, carbs: 59, fat: 30 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Riegel (20g)", grams: 20 }] },
  { id: id(), name: "Schokolade (Zartbitter 70%)", category: "sweets", nutrients: { calories: 570, protein: 8, carbs: 46, fat: 43 }, servings: [{ name: "100g", grams: 100 }, { name: "1 St\xFCck (10g)", grams: 10 }] },
  { id: id(), name: "Schokolade (Wei\xDF)", category: "sweets", nutrients: { calories: 539, protein: 6, carbs: 59, fat: 32 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Riegel (20g)", grams: 20 }] },
  { id: id(), name: "Mars-Riegel", category: "sweets", nutrients: { calories: 449, protein: 4, carbs: 70, fat: 17 }, servings: [{ name: "1 Stk. (51g)", grams: 51 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Snickers", category: "sweets", nutrients: { calories: 488, protein: 8, carbs: 60, fat: 24 }, servings: [{ name: "1 Stk. (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Twix", category: "sweets", nutrients: { calories: 498, protein: 5, carbs: 63, fat: 25 }, servings: [{ name: "1 Riegel (25g)", grams: 25 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kitkat", category: "sweets", nutrients: { calories: 518, protein: 6, carbs: 61, fat: 27 }, servings: [{ name: "1 Finger (11g)", grams: 11 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Oreo-Kekse", category: "sweets", nutrients: { calories: 471, protein: 5, carbs: 70, fat: 20 }, servings: [{ name: "3 Stk. (34g)", grams: 34 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Butterkeks", category: "sweets", nutrients: { calories: 430, protein: 7, carbs: 74, fat: 12 }, servings: [{ name: "1 Keks (8g)", grams: 8 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Spekulatius", category: "sweets", nutrients: { calories: 444, protein: 6, carbs: 71, fat: 15 }, servings: [{ name: "2 Stk. (20g)", grams: 20 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Lebkuchen", category: "sweets", nutrients: { calories: 380, protein: 6, carbs: 72, fat: 7 }, servings: [{ name: "1 Stk. (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Eiscreme (Vanille)", category: "snack", nutrients: { calories: 207, protein: 3.5, carbs: 24, fat: 11 }, servings: [{ name: "1 Kugel (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Eiscreme (Schoko)", category: "snack", nutrients: { calories: 215, protein: 3, carbs: 24, fat: 12 }, servings: [{ name: "1 Kugel (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Magnum (Vanille-Mandel)", category: "snack", nutrients: { calories: 313, protein: 4, carbs: 28, fat: 21 }, servings: [{ name: "1 Stk. (86g)", grams: 86 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Eis am Stiel (Wassereis)", category: "snack", nutrients: { calories: 68, protein: 0.3, carbs: 17, fat: 0 }, servings: [{ name: "1 Stk. (80g)", grams: 80 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Vollmilch-Pralinen", category: "sweets", nutrients: { calories: 545, protein: 5, carbs: 58, fat: 33 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Marshmallows", category: "sweets", nutrients: { calories: 318, protein: 2, carbs: 81, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "4 Stk. (28g)", grams: 28 }] },
  { id: id(), name: "Nougat-Creme", category: "sweets", nutrients: { calories: 547, protein: 6, carbs: 57, fat: 33 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  // =======================================================================
  // GETRÄNKE
  // =======================================================================
  { id: id(), name: "Wasser (still)", category: "drink", nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Wasser (Sprudel)", category: "drink", nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Kaffee (schwarz)", category: "drink", nutrients: { calories: 2, protein: 0.1, carbs: 0.3, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (200ml)", grams: 200 }] },
  { id: id(), name: "Cappuccino", category: "drink", nutrients: { calories: 40, protein: 2, carbs: 3, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (180ml)", grams: 180 }] },
  { id: id(), name: "Latte Macchiato", category: "drink", nutrients: { calories: 62, protein: 3.5, carbs: 6, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (300ml)", grams: 300 }] },
  { id: id(), name: "Espresso", category: "drink", nutrients: { calories: 9, protein: 0.6, carbs: 1.5, fat: 0.2 }, servings: [{ name: "1 Tasse (30ml)", grams: 30 }, { name: "100ml", grams: 100 }] },
  { id: id(), name: "Gr\xFCner Tee", category: "drink", nutrients: { calories: 1, protein: 0.2, carbs: 0, fat: 0 }, servings: [{ name: "1 Tasse (240ml)", grams: 240 }] },
  { id: id(), name: "Schwarzer Tee", category: "drink", nutrients: { calories: 1, protein: 0.1, carbs: 0.2, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (220ml)", grams: 220 }] },
  { id: id(), name: "Kamillentee", category: "drink", nutrients: { calories: 1, protein: 0, carbs: 0.2, fat: 0 }, servings: [{ name: "1 Tasse (240ml)", grams: 240 }] },
  { id: id(), name: "Pfefferminztee", category: "drink", nutrients: { calories: 2, protein: 0.1, carbs: 0.4, fat: 0 }, servings: [{ name: "1 Tasse (240ml)", grams: 240 }] },
  { id: id(), name: "Orangensaft", category: "drink", nutrients: { calories: 45, protein: 0.7, carbs: 10, fat: 0.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Apfelsaft", category: "drink", nutrients: { calories: 46, protein: 0.1, carbs: 11, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Multivitaminsaft", category: "drink", nutrients: { calories: 50, protein: 0.5, carbs: 12, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Traubensaft", category: "drink", nutrients: { calories: 60, protein: 0.5, carbs: 15, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Tomatensaft", category: "drink", nutrients: { calories: 17, protein: 0.8, carbs: 3.5, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Cola", category: "drink", nutrients: { calories: 42, protein: 0, carbs: 11, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (330ml)", grams: 330 }] },
  { id: id(), name: "Cola (Zero)", category: "drink", nutrients: { calories: 1, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (330ml)", grams: 330 }] },
  { id: id(), name: "Sprite / Lemonade", category: "drink", nutrients: { calories: 38, protein: 0, carbs: 9.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (330ml)", grams: 330 }] },
  { id: id(), name: "Fanta (Orange)", category: "drink", nutrients: { calories: 42, protein: 0, carbs: 11, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (330ml)", grams: 330 }] },
  { id: id(), name: "Energy Drink (Red Bull)", category: "drink", nutrients: { calories: 45, protein: 0.5, carbs: 11, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (250ml)", grams: 250 }] },
  { id: id(), name: "Energy Drink (Sugar-Free)", category: "drink", nutrients: { calories: 5, protein: 0.5, carbs: 0.3, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (250ml)", grams: 250 }] },
  { id: id(), name: "Bier (Pils)", category: "drink", nutrients: { calories: 43, protein: 0.5, carbs: 3.6, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Bier (Weizen)", category: "drink", nutrients: { calories: 45, protein: 0.6, carbs: 3.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (500ml)", grams: 500 }] },
  { id: id(), name: "Rotwein", category: "drink", nutrients: { calories: 85, protein: 0.1, carbs: 2.6, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (150ml)", grams: 150 }] },
  { id: id(), name: "Wei\xDFwein (trocken)", category: "drink", nutrients: { calories: 82, protein: 0.1, carbs: 2.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (150ml)", grams: 150 }] },
  { id: id(), name: "Sekt (trocken)", category: "drink", nutrients: { calories: 80, protein: 0.2, carbs: 1.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (100ml)", grams: 100 }] },
  { id: id(), name: "Prosecco", category: "drink", nutrients: { calories: 68, protein: 0.2, carbs: 1.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (100ml)", grams: 100 }] },
  { id: id(), name: "Wodka", category: "drink", nutrients: { calories: 231, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Shot (20ml)", grams: 20 }] },
  { id: id(), name: "Gin", category: "drink", nutrients: { calories: 263, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Shot (20ml)", grams: 20 }] },
  { id: id(), name: "Whiskey", category: "drink", nutrients: { calories: 250, protein: 0, carbs: 0.1, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Shot (20ml)", grams: 20 }] },
  { id: id(), name: "Rum", category: "drink", nutrients: { calories: 231, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Shot (20ml)", grams: 20 }] },
  { id: id(), name: "Proteinshake (Vanille)", category: "drink", nutrients: { calories: 145, protein: 24, carbs: 10, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (330ml)", grams: 330 }] },
  { id: id(), name: "Smoothie (gr\xFCner, spinach-banana)", category: "drink", nutrients: { calories: 72, protein: 1.5, carbs: 16, fat: 0.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Kakao (Trinkschokolade)", category: "drink", nutrients: { calories: 65, protein: 3, carbs: 8, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (200ml)", grams: 200 }] },
  { id: id(), name: "Eistee (Zitrone)", category: "drink", nutrients: { calories: 39, protein: 0, carbs: 10, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Kokoswasser", category: "drink", nutrients: { calories: 19, protein: 0.7, carbs: 3.7, fat: 0.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Packung (330ml)", grams: 330 }] },
  { id: id(), name: "Mineralwasser mit Geschmack", category: "drink", nutrients: { calories: 8, protein: 0, carbs: 2, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (500ml)", grams: 500 }] },
  // =======================================================================
  // GEWÜRZE & BACKEN
  // =======================================================================
  { id: id(), name: "Salz", category: "spice", nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "1 Prise (1g)", grams: 1 }, { name: "1 TL (5g)", grams: 5 }] },
  { id: id(), name: "Pfeffer (schwarz)", category: "spice", nutrients: { calories: 251, protein: 10, carbs: 64, fat: 3 }, servings: [{ name: "1 Prise (0.5g)", grams: 0.5 }, { name: "1 TL (2g)", grams: 2 }] },
  { id: id(), name: "Paprika (edels\xFC\xDF)", category: "spice", nutrients: { calories: 282, protein: 14, carbs: 54, fat: 12 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kurkuma", category: "spice", nutrients: { calories: 354, protein: 8, carbs: 65, fat: 10 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kreuzk\xFCmmel", category: "spice", nutrients: { calories: 375, protein: 18, carbs: 44, fat: 22 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Oregano", category: "spice", nutrients: { calories: 265, protein: 9, carbs: 69, fat: 4 }, servings: [{ name: "1 TL (1.5g)", grams: 1.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Basilikum (frisch)", category: "spice", nutrients: { calories: 23, protein: 3.2, carbs: 2.7, fat: 0.6 }, servings: [{ name: "1 Handvoll (10g)", grams: 10 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Petersilie (frisch)", category: "spice", nutrients: { calories: 36, protein: 3, carbs: 6, fat: 0.8 }, servings: [{ name: "1 EL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Schnittlauch", category: "spice", nutrients: { calories: 30, protein: 3.3, carbs: 4.4, fat: 0.7 }, servings: [{ name: "1 EL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Thymian (frisch)", category: "spice", nutrients: { calories: 101, protein: 6, carbs: 24, fat: 1.7 }, servings: [{ name: "1 TL (1g)", grams: 1 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Rosmarin (frisch)", category: "spice", nutrients: { calories: 131, protein: 3.3, carbs: 21, fat: 5.9 }, servings: [{ name: "1 Zweig (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Curry-Pulver", category: "spice", nutrients: { calories: 325, protein: 13, carbs: 55, fat: 14 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Zimt (gemahlen)", category: "spice", nutrients: { calories: 247, protein: 4, carbs: 81, fat: 1.2 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Muskat (gemahlen)", category: "spice", nutrients: { calories: 525, protein: 6, carbs: 49, fat: 36 }, servings: [{ name: "1 Prise (0.3g)", grams: 0.3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kakao-Pulver (unges\xFC\xDFt)", category: "spice", nutrients: { calories: 228, protein: 20, carbs: 58, fat: 14 }, servings: [{ name: "1 EL (6g)", grams: 6 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Backpulver", category: "spice", nutrients: { calories: 53, protein: 0, carbs: 28, fat: 0 }, servings: [{ name: "1 P\xE4ckchen (15g)", grams: 15 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Zucker (wei\xDF)", category: "spice", nutrients: { calories: 400, protein: 0, carbs: 100, fat: 0 }, servings: [{ name: "1 TL (4g)", grams: 4 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Zucker (braun)", category: "spice", nutrients: { calories: 380, protein: 0, carbs: 95, fat: 0 }, servings: [{ name: "1 TL (4g)", grams: 4 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "S\xFC\xDFungsmittel (Erythrit)", category: "spice", nutrients: { calories: 0, protein: 0, carbs: 100, fat: 0 }, servings: [{ name: "1 TL (4g)", grams: 4 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Stevia (Tafels\xFC\xDFe)", category: "spice", nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "1 Tablette (1g)", grams: 1 }] },
  // =======================================================================
  // FRÜHSTÜCKS-SPEZIALITÄTEN
  // =======================================================================
  { id: id(), name: "Overnight Oats (natur)", category: "breakfast", nutrients: { calories: 175, protein: 7, carbs: 28, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Porridge (zubereitet)", category: "breakfast", nutrients: { calories: 140, protein: 5, carbs: 26, fat: 2.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Avocado Toast", category: "breakfast", nutrients: { calories: 240, protein: 6, carbs: 24, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Egg Benedict", category: "breakfast", nutrients: { calories: 257, protein: 14, carbs: 20, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (180g)", grams: 180 }] },
  { id: id(), name: "R\xFChrei (klassisch)", category: "breakfast", nutrients: { calories: 160, protein: 12, carbs: 1, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Eier (120g)", grams: 120 }] },
  { id: id(), name: "Omelett (plain)", category: "breakfast", nutrients: { calories: 154, protein: 11, carbs: 1, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Eier (110g)", grams: 110 }] },
  { id: id(), name: "Smoothie Bowl (Beeren)", category: "breakfast", nutrients: { calories: 165, protein: 4, carbs: 34, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Bowl (300g)", grams: 300 }] },
  { id: id(), name: "Acai Bowl", category: "breakfast", nutrients: { calories: 180, protein: 3.5, carbs: 35, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Bowl (250g)", grams: 250 }] },
  { id: id(), name: "Chia Pudding", category: "breakfast", nutrients: { calories: 185, protein: 5, carbs: 25, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Bircherm\xFCsli", category: "breakfast", nutrients: { calories: 175, protein: 5, carbs: 30, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  // =======================================================================
  // WEITERE GEMÜSE (Exoten & Spezialitäten)
  // =======================================================================
  { id: id(), name: "Yam-Wurzel", category: "vegetable", nutrients: { calories: 118, protein: 1.5, carbs: 28, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Taro-Wurzel", category: "vegetable", nutrients: { calories: 112, protein: 1.5, carbs: 27, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Batate (S\xFC\xDFkartoffel)", category: "vegetable", nutrients: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Maniok", category: "vegetable", nutrients: { calories: 160, protein: 1.4, carbs: 38, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Bambussprossen", category: "vegetable", nutrients: { calories: 27, protein: 2.6, carbs: 5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sojasprossen", category: "vegetable", nutrients: { calories: 30, protein: 3, carbs: 6, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Endivie", category: "vegetable", nutrients: { calories: 17, protein: 1.3, carbs: 3.4, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Chicor\xE9e", category: "vegetable", nutrients: { calories: 23, protein: 1.7, carbs: 4.7, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Romanesco", category: "vegetable", nutrients: { calories: 25, protein: 2, carbs: 5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Paksoi (Bok Choy)", category: "vegetable", nutrients: { calories: 13, protein: 1.5, carbs: 2.2, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rettich (wei\xDF)", category: "vegetable", nutrients: { calories: 16, protein: 0.7, carbs: 3.4, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Meerrettich (frisch)", category: "vegetable", nutrients: { calories: 59, protein: 2.5, carbs: 11, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Tomatillo", category: "vegetable", nutrients: { calories: 32, protein: 1, carbs: 6, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Bataatbl\xE4tter", category: "vegetable", nutrients: { calories: 22, protein: 2.5, carbs: 4, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  // =======================================================================
  // MILCH & ALTERNATIVEN WEITERE
  // =======================================================================
  { id: id(), name: "Quark (40% Fett)", category: "dairy", nutrients: { calories: 120, protein: 10, carbs: 3, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (250g)", grams: 250 }] },
  { id: id(), name: "Joghurt (0,1% Fett)", category: "dairy", nutrients: { calories: 52, protein: 3.5, carbs: 4.7, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Sahne-Joghurt", category: "dairy", nutrients: { calories: 120, protein: 3, carbs: 4.5, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Kondensmilch (10%)", category: "dairy", nutrients: { calories: 135, protein: 7, carbs: 10, fat: 10 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Kondensmilch (s\xFC\xDF, 9%)", category: "dairy", nutrients: { calories: 328, protein: 7, carbs: 54, fat: 9 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Milchpulver", category: "dairy", nutrients: { calories: 496, protein: 26, carbs: 39, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (8g)", grams: 8 }] },
  { id: id(), name: "Cashew-Joghurt", category: "dairy", nutrients: { calories: 75, protein: 1.5, carbs: 6, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kokosjogurt", category: "dairy", nutrients: { calories: 92, protein: 0.8, carbs: 7, fat: 7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Ziegen-Joghurt", category: "dairy", nutrients: { calories: 59, protein: 3.6, carbs: 4.5, fat: 3.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Ziegenk\xE4se (frisch)", category: "dairy", nutrients: { calories: 268, protein: 18, carbs: 0, fat: 21 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (30g)", grams: 30 }] },
  { id: id(), name: "Halloumi", category: "dairy", nutrients: { calories: 321, protein: 21, carbs: 1.5, fat: 26 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (60g)", grams: 60 }] },
  { id: id(), name: "Manchego", category: "dairy", nutrients: { calories: 395, protein: 26, carbs: 0.5, fat: 32 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (20g)", grams: 20 }] },
  { id: id(), name: "Gouda (jung)", category: "dairy", nutrients: { calories: 356, protein: 25, carbs: 2, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (25g)", grams: 25 }] },
  { id: id(), name: "Cheddar", category: "dairy", nutrients: { calories: 403, protein: 25, carbs: 1.3, fat: 33 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (25g)", grams: 25 }] },
  // =======================================================================
  // WEITERE FERTIGGERICHTE & SPEZIALITÄTEN
  // =======================================================================
  { id: id(), name: "Wok-Gem\xFCse (Fix)", category: "readymeal", nutrients: { calories: 45, protein: 2.5, carbs: 7, fat: 1 }, servings: [{ name: "100g zubereitet", grams: 100 }] },
  { id: id(), name: "Herzhafte Linsensuppe", category: "readymeal", nutrients: { calories: 85, protein: 5, carbs: 14, fat: 1.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (300ml)", grams: 300 }] },
  { id: id(), name: "Fertig-Couscous (Gem\xFCse)", category: "readymeal", nutrients: { calories: 120, protein: 4, carbs: 22, fat: 2 }, servings: [{ name: "100g zubereitet", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Fertig-Risotto (Parmesan)", category: "readymeal", nutrients: { calories: 145, protein: 5, carbs: 25, fat: 3 }, servings: [{ name: "100g zubereitet", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Fertig-Paella", category: "readymeal", nutrients: { calories: 135, protein: 7, carbs: 22, fat: 3 }, servings: [{ name: "100g zubereitet", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Vegetarisches Chili", category: "readymeal", nutrients: { calories: 90, protein: 5, carbs: 15, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Burger (Hausgemacht)", category: "readymeal", nutrients: { calories: 280, protein: 17, carbs: 25, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Burger (250g)", grams: 250 }] },
  { id: id(), name: "Tacos (mit Rindfleisch)", category: "readymeal", nutrients: { calories: 195, protein: 11, carbs: 18, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Quesadilla (K\xE4se)", category: "readymeal", nutrients: { calories: 285, protein: 11, carbs: 27, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (180g)", grams: 180 }] },
  { id: id(), name: "Chicken Tikka Masala", category: "readymeal", nutrients: { calories: 135, protein: 13, carbs: 8, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Thai-Curry (H\xFChnchen)", category: "readymeal", nutrients: { calories: 120, protein: 10, carbs: 9, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Ramen (Suppe)", category: "readymeal", nutrients: { calories: 145, protein: 7, carbs: 22, fat: 4 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Sch\xFCssel (500ml)", grams: 500 }] },
  { id: id(), name: "Pad Thai", category: "readymeal", nutrients: { calories: 163, protein: 7, carbs: 24, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Spaghetti Carbonara", category: "readymeal", nutrients: { calories: 220, protein: 10, carbs: 28, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Griechischer Bauernsalat", category: "readymeal", nutrients: { calories: 135, protein: 4, carbs: 6, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Caesar Salad (mit H\xE4hnchen)", category: "readymeal", nutrients: { calories: 155, protein: 11, carbs: 6, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (280g)", grams: 280 }] },
  // =======================================================================
  // WEITERE PROTEIN-VARIANTEN
  // =======================================================================
  { id: id(), name: "H\xE4hnchenbrust-Aufschnitt", category: "protein", nutrients: { calories: 99, protein: 21, carbs: 0.5, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (40g)", grams: 40 }] },
  { id: id(), name: "Truthahn-Aufschnitt", category: "protein", nutrients: { calories: 105, protein: 20, carbs: 1, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (40g)", grams: 40 }] },
  { id: id(), name: "H\xFChnerleber", category: "protein", nutrients: { calories: 119, protein: 17, carbs: 1, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rinderleber", category: "protein", nutrients: { calories: 135, protein: 21, carbs: 5, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rinderherz", category: "protein", nutrients: { calories: 112, protein: 17, carbs: 0, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lachsforelle", category: "protein", nutrients: { calories: 168, protein: 20, carbs: 0, fat: 9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Rotbarsch", category: "protein", nutrients: { calories: 97, protein: 19, carbs: 0, fat: 2.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Dorade", category: "protein", nutrients: { calories: 96, protein: 18, carbs: 0, fat: 2.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (200g)", grams: 200 }] },
  { id: id(), name: "Wolfsbarsch", category: "protein", nutrients: { calories: 97, protein: 18, carbs: 0, fat: 2.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Froschkeulen", category: "protein", nutrients: { calories: 73, protein: 16, carbs: 0, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schnecken (Weinbergschnecken)", category: "protein", nutrients: { calories: 90, protein: 16, carbs: 2, fat: 1.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Erbsenprotein-Burger", category: "protein", nutrients: { calories: 238, protein: 21, carbs: 9, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Patty (110g)", grams: 110 }] },
  { id: id(), name: "Reisprotein-Pulver", category: "protein", nutrients: { calories: 370, protein: 75, carbs: 12, fat: 3 }, servings: [{ name: "1 Portion (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Hanfprotein-Pulver", category: "protein", nutrients: { calories: 350, protein: 50, carbs: 20, fat: 10 }, servings: [{ name: "1 Portion (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Putenhackfleisch", category: "protein", nutrients: { calories: 157, protein: 21, carbs: 0, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Frikadelle (Rindfleisch)", category: "protein", nutrients: { calories: 245, protein: 18, carbs: 5, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Frikadelle (Hackfleisch gemischt)", category: "protein", nutrients: { calories: 260, protein: 17, carbs: 6, fat: 19 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (100g)", grams: 100 }] },
  { id: id(), name: "Cevapcici", category: "protein", nutrients: { calories: 235, protein: 18, carbs: 2, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "5 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Schnitzel Wiener Art", category: "protein", nutrients: { calories: 287, protein: 20, carbs: 15, fat: 16 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (180g)", grams: 180 }] },
  { id: id(), name: "Kassler (Schwein, ger\xE4uchert)", category: "protein", nutrients: { calories: 164, protein: 22, carbs: 0, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (60g)", grams: 60 }] },
  // =======================================================================
  // WEITERE GETREIDEPRODUKTE
  // =======================================================================
  { id: id(), name: "Weizenkeime", category: "carbs", nutrients: { calories: 360, protein: 26, carbs: 52, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Kleie (Weizenkleie)", category: "carbs", nutrients: { calories: 216, protein: 15, carbs: 64, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Haferkleie", category: "carbs", nutrients: { calories: 246, protein: 17, carbs: 66, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Flohsamenschalen", category: "carbs", nutrients: { calories: 141, protein: 2, carbs: 79, fat: 0.7 }, servings: [{ name: "1 TL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Tapioka-St\xE4rke", category: "carbs", nutrients: { calories: 358, protein: 0, carbs: 91, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Speisest\xE4rke", category: "carbs", nutrients: { calories: 381, protein: 0.5, carbs: 91, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (12g)", grams: 12 }] },
  { id: id(), name: "Grie\xDF (Weizen)", category: "carbs", nutrients: { calories: 360, protein: 12, carbs: 74, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (80g)", grams: 80 }] },
  { id: id(), name: "Maismehl", category: "carbs", nutrients: { calories: 361, protein: 7, carbs: 79, fat: 2.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kartoffelst\xE4rke", category: "carbs", nutrients: { calories: 357, protein: 0, carbs: 83, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (12g)", grams: 12 }] },
  { id: id(), name: "Zwieback", category: "carbs", nutrients: { calories: 394, protein: 10, carbs: 80, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (10g)", grams: 10 }] },
  { id: id(), name: "Paniermehl", category: "carbs", nutrients: { calories: 371, protein: 12, carbs: 76, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  // =======================================================================
  // SUPPEN & EINTÖPFE
  // =======================================================================
  { id: id(), name: "Gem\xFCsebr\xFChe (selbst gekocht)", category: "readymeal", nutrients: { calories: 10, protein: 0.5, carbs: 2, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (250ml)", grams: 250 }] },
  { id: id(), name: "H\xFChnerbr\xFChe (selbst gekocht)", category: "readymeal", nutrients: { calories: 15, protein: 1.5, carbs: 0.5, fat: 0.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (250ml)", grams: 250 }] },
  { id: id(), name: "Zwiebelsuppe (franz\xF6sisch)", category: "readymeal", nutrients: { calories: 55, protein: 2, carbs: 8, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (300ml)", grams: 300 }] },
  { id: id(), name: "K\xFCrbiscremesuppe", category: "readymeal", nutrients: { calories: 60, protein: 1.5, carbs: 10, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (300ml)", grams: 300 }] },
  { id: id(), name: "Tomatensuppe (cremig)", category: "readymeal", nutrients: { calories: 72, protein: 1.8, carbs: 11, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (300ml)", grams: 300 }] },
  { id: id(), name: "Minestrone", category: "readymeal", nutrients: { calories: 55, protein: 2.5, carbs: 9, fat: 1.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (350ml)", grams: 350 }] },
  { id: id(), name: "Kartoffelsuppe", category: "readymeal", nutrients: { calories: 65, protein: 2, carbs: 12, fat: 1.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (300ml)", grams: 300 }] },
  { id: id(), name: "Boullion-W\xFCrfel", category: "readymeal", nutrients: { calories: 267, protein: 13, carbs: 38, fat: 7 }, servings: [{ name: "1 W\xFCrfel (10g)", grams: 10 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Rindereintopf", category: "readymeal", nutrients: { calories: 85, protein: 7, carbs: 8, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Gem\xFCseeintopf", category: "readymeal", nutrients: { calories: 50, protein: 2, carbs: 9, fat: 0.8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Borschtsch", category: "readymeal", nutrients: { calories: 65, protein: 2, carbs: 10, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (300ml)", grams: 300 }] },
  // =======================================================================
  // INTERNATIONALE KÜCHE
  // =======================================================================
  { id: id(), name: "Tofu Scramble", category: "protein", nutrients: { calories: 130, protein: 10, carbs: 6, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Bibimbap (koreanisch)", category: "readymeal", nutrients: { calories: 148, protein: 8, carbs: 22, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Miso-Suppe", category: "readymeal", nutrients: { calories: 40, protein: 3, carbs: 5, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Sch\xFCssel (300ml)", grams: 300 }] },
  { id: id(), name: "Kimchi", category: "vegetable", nutrients: { calories: 15, protein: 1.5, carbs: 2.5, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "2 EL (30g)", grams: 30 }] },
  { id: id(), name: "Nori-Bl\xE4tter", category: "vegetable", nutrients: { calories: 35, protein: 5, carbs: 5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Blatt (3g)", grams: 3 }] },
  { id: id(), name: "Miso-Paste", category: "sauce", nutrients: { calories: 199, protein: 12, carbs: 26, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Sambal Oelek", category: "sauce", nutrients: { calories: 54, protein: 2, carbs: 10, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (5g)", grams: 5 }] },
  { id: id(), name: "Curry-Paste (gr\xFCn)", category: "sauce", nutrients: { calories: 120, protein: 3, carbs: 8, fat: 9 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Curry-Paste (rot)", category: "sauce", nutrients: { calories: 110, protein: 3, carbs: 7, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Harissa", category: "sauce", nutrients: { calories: 90, protein: 3, carbs: 10, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Gochujang", category: "sauce", nutrients: { calories: 204, protein: 4, carbs: 44, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (10g)", grams: 10 }] },
  { id: id(), name: "Tahini (Sesammus, fl\xFCssig)", category: "sauce", nutrients: { calories: 595, protein: 17, carbs: 21, fat: 54 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Baba Ganoush", category: "sauce", nutrients: { calories: 95, protein: 3, carbs: 8, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Zhoug (Koriander-Chili)", category: "sauce", nutrients: { calories: 120, protein: 2, carbs: 4, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Chimichurri", category: "sauce", nutrients: { calories: 250, protein: 1, carbs: 4, fat: 26 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Romesco-Sauce", category: "sauce", nutrients: { calories: 180, protein: 4, carbs: 10, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Aioli", category: "sauce", nutrients: { calories: 450, protein: 1, carbs: 3, fat: 48 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Tkemali (georgische Pflaumenso\xDFe)", category: "sauce", nutrients: { calories: 65, protein: 0.5, carbs: 16, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  // =======================================================================
  // MEHR OBST
  // =======================================================================
  { id: id(), name: "Drachenfrucht (Pitaya)", category: "fruit", nutrients: { calories: 60, protein: 1.2, carbs: 13, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1/2 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Jackfrucht (reif)", category: "fruit", nutrients: { calories: 95, protein: 1.7, carbs: 23, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Longan", category: "fruit", nutrients: { calories: 60, protein: 1.3, carbs: 15, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lychee", category: "fruit", nutrients: { calories: 66, protein: 0.8, carbs: 17, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "5 Stk. (50g)", grams: 50 }] },
  { id: id(), name: "Rambutan", category: "fruit", nutrients: { calories: 68, protein: 0.9, carbs: 16, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Starfrucht (Karambole)", category: "fruit", nutrients: { calories: 31, protein: 1, carbs: 7, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Tamarinde", category: "fruit", nutrients: { calories: 239, protein: 2.8, carbs: 63, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Calamansi (Philippin. Limette)", category: "fruit", nutrients: { calories: 30, protein: 0.7, carbs: 10, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kumquat", category: "fruit", nutrients: { calories: 71, protein: 1.9, carbs: 16, fat: 0.9 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Guave", category: "fruit", nutrients: { calories: 68, protein: 2.6, carbs: 14, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (55g)", grams: 55 }] },
  { id: id(), name: "Durian", category: "fruit", nutrients: { calories: 147, protein: 1.5, carbs: 27, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Avocado (reif, weich)", category: "fruit", nutrients: { calories: 160, protein: 2, carbs: 9, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1/2 Stk. (75g)", grams: 75 }] },
  { id: id(), name: "Physalis", category: "fruit", nutrients: { calories: 53, protein: 1.9, carbs: 11, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }, { name: "5 Stk. (25g)", grams: 25 }] },
  { id: id(), name: "Limequat", category: "fruit", nutrients: { calories: 41, protein: 0.8, carbs: 12, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "A\xE7a\xED (gefroren, Fruchtmark)", category: "fruit", nutrients: { calories: 60, protein: 2, carbs: 6, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Packung (100g)", grams: 100 }] },
  { id: id(), name: "Schwarzdorn (Schlehe)", category: "fruit", nutrients: { calories: 54, protein: 0.8, carbs: 14, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Holunderbeeren", category: "fruit", nutrients: { calories: 73, protein: 0.7, carbs: 18, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mirabelle", category: "fruit", nutrients: { calories: 53, protein: 0.9, carbs: 12, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "5 Stk. (50g)", grams: 50 }] },
  { id: id(), name: "Reineclaude", category: "fruit", nutrients: { calories: 50, protein: 0.8, carbs: 12, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  // =======================================================================
  // MEHR GEMÜSE & KRÄUTER
  // =======================================================================
  { id: id(), name: "Okra", category: "vegetable", nutrients: { calories: 33, protein: 2, carbs: 7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Bitter Melon (Bitterk\xFCrbis)", category: "vegetable", nutrients: { calories: 17, protein: 1, carbs: 4, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lotussamen", category: "vegetable", nutrients: { calories: 89, protein: 4.1, carbs: 17, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lotoswurzel", category: "vegetable", nutrients: { calories: 74, protein: 2.6, carbs: 17, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wasserkastanie", category: "vegetable", nutrients: { calories: 97, protein: 2, carbs: 24, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Enoki-Pilze", category: "vegetable", nutrients: { calories: 37, protein: 2.7, carbs: 8, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Austernpilze", category: "vegetable", nutrients: { calories: 33, protein: 3.3, carbs: 6, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kr\xE4uterseitlinge", category: "vegetable", nutrients: { calories: 35, protein: 3, carbs: 6, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Tr\xFCffel (schwarz)", category: "vegetable", nutrients: { calories: 92, protein: 6, carbs: 17, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "5g", grams: 5 }] },
  { id: id(), name: "Mungobohnen (gekeimt)", category: "vegetable", nutrients: { calories: 30, protein: 3, carbs: 6, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schnittbohnen", category: "vegetable", nutrients: { calories: 28, protein: 2, carbs: 5.5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Stangenbohnen", category: "vegetable", nutrients: { calories: 31, protein: 2, carbs: 5.7, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Dicke Bohnen (Saubohnen)", category: "vegetable", nutrients: { calories: 88, protein: 8, carbs: 14, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Zuckerschoten", category: "vegetable", nutrients: { calories: 42, protein: 2.8, carbs: 8, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Spitzkohl", category: "vegetable", nutrients: { calories: 22, protein: 1.2, carbs: 4.5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Blattsalat-Mix", category: "vegetable", nutrients: { calories: 18, protein: 1.5, carbs: 3, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Mair\xFCbe", category: "vegetable", nutrients: { calories: 28, protein: 0.9, carbs: 6, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schwarzwurzel", category: "vegetable", nutrients: { calories: 82, protein: 3.3, carbs: 18, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Topinambur", category: "vegetable", nutrients: { calories: 73, protein: 2, carbs: 17, fat: 0 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Erbsen (getrocknet)", category: "vegetable", nutrients: { calories: 339, protein: 25, carbs: 61, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  // =======================================================================
  // MEHR KONSERVEN
  // =======================================================================
  { id: id(), name: "Spargel (Dose, wei\xDF)", category: "canned", nutrients: { calories: 16, protein: 1.5, carbs: 3, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (340g)", grams: 340 }] },
  { id: id(), name: "Champignons (Dose)", category: "canned", nutrients: { calories: 18, protein: 1.8, carbs: 2.5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Bambussprossen (Dose)", category: "canned", nutrients: { calories: 27, protein: 2.6, carbs: 5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wasserkastanien (Dose)", category: "canned", nutrients: { calories: 97, protein: 2, carbs: 24, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Mangop\xFCree (Dose)", category: "canned", nutrients: { calories: 65, protein: 0.5, carbs: 17, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kirschen (Dose, im Saft)", category: "canned", nutrients: { calories: 54, protein: 0.8, carbs: 14, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Birnen (Dose, im Saft)", category: "canned", nutrients: { calories: 33, protein: 0.3, carbs: 9, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Apfelmus (Glas, unges\xFC\xDFt)", category: "canned", nutrients: { calories: 42, protein: 0.3, carbs: 11, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (100g)", grams: 100 }] },
  { id: id(), name: "Gew\xFCrzgurken (Glas)", category: "canned", nutrients: { calories: 15, protein: 0.7, carbs: 2.5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (60g)", grams: 60 }] },
  { id: id(), name: "Kartoffeln (Dose, vorgekocht)", category: "canned", nutrients: { calories: 55, protein: 1.5, carbs: 13, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Erbsen-M\xF6hren-Mix (Dose)", category: "canned", nutrients: { calories: 55, protein: 3, carbs: 10, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  // =======================================================================
  // NOCH MEHR SNACKS & PROTEIN-SNACKS
  // =======================================================================
  { id: id(), name: "K\xE4se-Cracker", category: "snack", nutrients: { calories: 490, protein: 10, carbs: 58, fat: 25 }, servings: [{ name: "100g", grams: 100 }, { name: "5 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Vollkorn-Cracker", category: "snack", nutrients: { calories: 405, protein: 12, carbs: 60, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Reiswaffel (Schokolade)", category: "snack", nutrients: { calories: 430, protein: 7, carbs: 68, fat: 16 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Pringles (Original)", category: "snack", nutrients: { calories: 534, protein: 5, carbs: 55, fat: 34 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Lays Chips (Classic)", category: "snack", nutrients: { calories: 536, protein: 7, carbs: 53, fat: 35 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (28g)", grams: 28 }] },
  { id: id(), name: "Vegane Proteinriegel", category: "snack", nutrients: { calories: 340, protein: 20, carbs: 38, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Riegel (55g)", grams: 55 }] },
  { id: id(), name: "Protein-Pudding", category: "snack", nutrients: { calories: 85, protein: 15, carbs: 5, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (200g)", grams: 200 }] },
  { id: id(), name: "Quark-Riegel", category: "snack", nutrients: { calories: 195, protein: 15, carbs: 22, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (65g)", grams: 65 }] },
  { id: id(), name: "Nuss-Mix (gesalzen)", category: "snack", nutrients: { calories: 607, protein: 17, carbs: 18, fat: 56 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Trail Mix (Nuss-Trockenfr\xFCchte)", category: "snack", nutrients: { calories: 498, protein: 11, carbs: 53, fat: 29 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (40g)", grams: 40 }] },
  { id: id(), name: "Sesamstangen", category: "snack", nutrients: { calories: 450, protein: 12, carbs: 60, fat: 19 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (15g)", grams: 15 }] },
  { id: id(), name: "Joghurt-Schokolinsen", category: "sweets", nutrients: { calories: 490, protein: 6, carbs: 65, fat: 23 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Schokoladentr\xFCffel", category: "sweets", nutrients: { calories: 520, protein: 4, carbs: 55, fat: 31 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Stk. (25g)", grams: 25 }] },
  { id: id(), name: "Walnuss-Brownie", category: "sweets", nutrients: { calories: 415, protein: 5, carbs: 52, fat: 21 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (80g)", grams: 80 }] },
  { id: id(), name: "Erdnuss-Krokant", category: "sweets", nutrients: { calories: 518, protein: 13, carbs: 55, fat: 30 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Marzipan", category: "sweets", nutrients: { calories: 479, protein: 10, carbs: 57, fat: 25 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (25g)", grams: 25 }] },
  { id: id(), name: "Nougat", category: "sweets", nutrients: { calories: 510, protein: 7, carbs: 60, fat: 28 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Ferrero Rocher", category: "sweets", nutrients: { calories: 574, protein: 7, carbs: 49, fat: 39 }, servings: [{ name: "1 Kugel (12.5g)", grams: 12.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "After Eight", category: "sweets", nutrients: { calories: 388, protein: 2.9, carbs: 74, fat: 9 }, servings: [{ name: "2 Stk. (23g)", grams: 23 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Weingummi-Tiere", category: "sweets", nutrients: { calories: 330, protein: 7, carbs: 75, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  // =======================================================================
  // MEHR FAST FOOD & RESTAURANTS
  // =======================================================================
  { id: id(), name: "Shawarma (H\xFChnchen)", category: "fastfood", nutrients: { calories: 215, protein: 14, carbs: 22, fat: 8 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (300g)", grams: 300 }] },
  { id: id(), name: "Kebap (Lamm)", category: "fastfood", nutrients: { calories: 250, protein: 15, carbs: 20, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Crispy Chicken Burger", category: "fastfood", nutrients: { calories: 295, protein: 16, carbs: 30, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (185g)", grams: 185 }] },
  { id: id(), name: "Fish & Chips", category: "fastfood", nutrients: { calories: 268, protein: 10, carbs: 30, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (400g)", grams: 400 }] },
  { id: id(), name: "Chicken Wings (Buffalo)", category: "fastfood", nutrients: { calories: 290, protein: 19, carbs: 5, fat: 22 }, servings: [{ name: "100g", grams: 100 }, { name: "6 Stk. (180g)", grams: 180 }] },
  { id: id(), name: "Burrito (Rind, gro\xDFe)", category: "fastfood", nutrients: { calories: 193, protein: 12, carbs: 22, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (350g)", grams: 350 }] },
  { id: id(), name: "Naan Pizza (K\xE4se)", category: "fastfood", nutrients: { calories: 285, protein: 12, carbs: 38, fat: 10 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Schnitzel (Restaurant)", category: "fastfood", nutrients: { calories: 260, protein: 18, carbs: 15, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Gegrillter Lachs (Restaurant)", category: "fastfood", nutrients: { calories: 190, protein: 22, carbs: 0, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Steak Frites (Restaurant)", category: "fastfood", nutrients: { calories: 255, protein: 16, carbs: 20, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Pasta Arrabiata", category: "fastfood", nutrients: { calories: 165, protein: 6, carbs: 30, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Risotto (Restaurant)", category: "fastfood", nutrients: { calories: 155, protein: 5, carbs: 28, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Gratinierter Blumenkohl", category: "fastfood", nutrients: { calories: 115, protein: 6, carbs: 10, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Moussaka", category: "fastfood", nutrients: { calories: 185, protein: 10, carbs: 12, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (350g)", grams: 350 }] },
  { id: id(), name: "Chicken Noodle Soup (Restaurant)", category: "fastfood", nutrients: { calories: 55, protein: 4, carbs: 7, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Sch\xFCssel (350ml)", grams: 350 }] },
  // =======================================================================
  // MEHR BACKWAREN & KUCHEN
  // =======================================================================
  { id: id(), name: "Brot (Mehrkorn)", category: "bakery", nutrients: { calories: 255, protein: 10, carbs: 44, fat: 4 }, servings: [{ name: "1 Scheibe (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Brot (Sauerteig)", category: "bakery", nutrients: { calories: 248, protein: 8, carbs: 48, fat: 2 }, servings: [{ name: "1 Scheibe (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Focaccia", category: "bakery", nutrients: { calories: 285, protein: 8, carbs: 41, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 St\xFCck (80g)", grams: 80 }] },
  { id: id(), name: "Bagel (plain)", category: "bakery", nutrients: { calories: 270, protein: 10, carbs: 52, fat: 2 }, servings: [{ name: "1 Stk. (98g)", grams: 98 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Bagel (Sesam)", category: "bakery", nutrients: { calories: 285, protein: 10, carbs: 52, fat: 3.5 }, servings: [{ name: "1 Stk. (105g)", grams: 105 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Streuselkuchen", category: "bakery", nutrients: { calories: 360, protein: 5, carbs: 52, fat: 16 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Hefekuchen (Rosinen)", category: "bakery", nutrients: { calories: 295, protein: 7, carbs: 50, fat: 8 }, servings: [{ name: "1 Scheibe (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Christstollen", category: "bakery", nutrients: { calories: 441, protein: 7, carbs: 61, fat: 19 }, servings: [{ name: "1 Scheibe (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Panettone", category: "bakery", nutrients: { calories: 355, protein: 7, carbs: 52, fat: 13 }, servings: [{ name: "1 Scheibe (80g)", grams: 80 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Sandkuchen", category: "bakery", nutrients: { calories: 430, protein: 6, carbs: 55, fat: 21 }, servings: [{ name: "1 Scheibe (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Schoko-Brownie", category: "bakery", nutrients: { calories: 415, protein: 5, carbs: 55, fat: 21 }, servings: [{ name: "1 Stk. (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cheesecake (New York)", category: "bakery", nutrients: { calories: 333, protein: 6, carbs: 27, fat: 23 }, servings: [{ name: "1 St\xFCck (125g)", grams: 125 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cr\xEApe (plain)", category: "bakery", nutrients: { calories: 215, protein: 7, carbs: 28, fat: 9 }, servings: [{ name: "1 Stk. (70g)", grams: 70 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cr\xEApe (Nutella)", category: "bakery", nutrients: { calories: 325, protein: 7, carbs: 45, fat: 14 }, servings: [{ name: "1 Stk. (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Obsttorte", category: "bakery", nutrients: { calories: 235, protein: 4, carbs: 38, fat: 8 }, servings: [{ name: "1 St\xFCck (120g)", grams: 120 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Schokoladenkuchen (Saftiger)", category: "bakery", nutrients: { calories: 380, protein: 5, carbs: 50, fat: 19 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Roulade (Biskuit, gef\xFCllt)", category: "bakery", nutrients: { calories: 345, protein: 5, carbs: 51, fat: 14 }, servings: [{ name: "1 Scheibe (60g)", grams: 60 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Milchschnitte", category: "bakery", nutrients: { calories: 358, protein: 8, carbs: 46, fat: 17 }, servings: [{ name: "1 Stk. (28g)", grams: 28 }, { name: "100g", grams: 100 }] },
  // =======================================================================
  // MEHR GETRÄNKE
  // =======================================================================
  { id: id(), name: "Frisch gepresster O-Saft", category: "drink", nutrients: { calories: 42, protein: 0.7, carbs: 10, fat: 0.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Smoothie (Tropische Fr\xFCchte)", category: "drink", nutrients: { calories: 75, protein: 1, carbs: 18, fat: 0.3 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (250ml)", grams: 250 }] },
  { id: id(), name: "Kombucha (natur)", category: "drink", nutrients: { calories: 18, protein: 0, carbs: 4, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Milchkaffee (Flat White)", category: "drink", nutrients: { calories: 58, protein: 3, carbs: 5, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Becher (240ml)", grams: 240 }] },
  { id: id(), name: "Matcha Latte", category: "drink", nutrients: { calories: 65, protein: 3, carbs: 7, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Becher (240ml)", grams: 240 }] },
  { id: id(), name: "Oat Milk Latte", category: "drink", nutrients: { calories: 65, protein: 2, carbs: 8, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Becher (300ml)", grams: 300 }] },
  { id: id(), name: "Cold Brew Kaffee", category: "drink", nutrients: { calories: 5, protein: 0.3, carbs: 0.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (250ml)", grams: 250 }] },
  { id: id(), name: "Ingwer-Zitronen-Tee", category: "drink", nutrients: { calories: 8, protein: 0.1, carbs: 2, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Tasse (250ml)", grams: 250 }] },
  { id: id(), name: "Rooibos-Tee", category: "drink", nutrients: { calories: 2, protein: 0, carbs: 0.5, fat: 0 }, servings: [{ name: "1 Tasse (240ml)", grams: 240 }] },
  { id: id(), name: "Hibiskus-Tee", category: "drink", nutrients: { calories: 5, protein: 0, carbs: 1.5, fat: 0 }, servings: [{ name: "1 Tasse (240ml)", grams: 240 }] },
  { id: id(), name: "S\xE4uerlicher Apfelessig-Drink", category: "drink", nutrients: { calories: 15, protein: 0, carbs: 3.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Shot (30ml)", grams: 30 }] },
  { id: id(), name: "Aloe-Vera-Drink", category: "drink", nutrients: { calories: 25, protein: 0.1, carbs: 6, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (500ml)", grams: 500 }] },
  { id: id(), name: "Aguas Frescas (Hibiskus)", category: "drink", nutrients: { calories: 30, protein: 0, carbs: 7.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Maracuja-Saft", category: "drink", nutrients: { calories: 46, protein: 0.4, carbs: 11, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Kirschsaft", category: "drink", nutrients: { calories: 55, protein: 0.8, carbs: 14, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Cranberrysaft", category: "drink", nutrients: { calories: 45, protein: 0.1, carbs: 12, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Bier (Alkoholfrei)", category: "drink", nutrients: { calories: 20, protein: 0.4, carbs: 4, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Radler", category: "drink", nutrients: { calories: 25, protein: 0.2, carbs: 5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (500ml)", grams: 500 }] },
  { id: id(), name: "Aperol Spritz", category: "drink", nutrients: { calories: 58, protein: 0, carbs: 6, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Hugo (Holunderbl\xFCte)", category: "drink", nutrients: { calories: 68, protein: 0.2, carbs: 9, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Mojito", category: "drink", nutrients: { calories: 90, protein: 0, carbs: 12, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Pi\xF1a Colada", category: "drink", nutrients: { calories: 155, protein: 0.5, carbs: 20, fat: 5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Protein Shake (Schokolade)", category: "drink", nutrients: { calories: 148, protein: 25, carbs: 9, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "BCAA-Drink", category: "drink", nutrients: { calories: 15, protein: 3, carbs: 0.5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (400ml)", grams: 400 }] },
  { id: id(), name: "Pre-Workout Drink", category: "drink", nutrients: { calories: 35, protein: 1, carbs: 7, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Portion (350ml)", grams: 350 }] },
  { id: id(), name: "Molke (Whey, fl\xFCssig)", category: "drink", nutrients: { calories: 25, protein: 4, carbs: 2, fat: 0.2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Kefir-Drink (Mango)", category: "drink", nutrients: { calories: 68, protein: 3, carbs: 12, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Ayran", category: "drink", nutrients: { calories: 45, protein: 2.5, carbs: 3.5, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Becher (250ml)", grams: 250 }] },
  { id: id(), name: "Lassi (Mango)", category: "drink", nutrients: { calories: 80, protein: 2.5, carbs: 15, fat: 1.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Chilipulver-Wasser (ACV Shot)", category: "drink", nutrients: { calories: 3, protein: 0, carbs: 0.7, fat: 0 }, servings: [{ name: "1 Shot (30ml)", grams: 30 }] },
  // =======================================================================
  // WEITERE PROTEINE – VEGANE PRODUKTE
  // =======================================================================
  { id: id(), name: "Veganes Hack (OmniMeat)", category: "protein", nutrients: { calories: 135, protein: 17, carbs: 5, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Vegane Wurst (Beyond)", category: "protein", nutrients: { calories: 195, protein: 18, carbs: 4, fat: 12 }, servings: [{ name: "1 Stk. (68g)", grams: 68 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Vegane Chicken Strips", category: "protein", nutrients: { calories: 175, protein: 17, carbs: 6, fat: 9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Jackfrucht (jung, in Salzlake)", category: "protein", nutrients: { calories: 35, protein: 1.2, carbs: 8, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Veganer K\xE4se (Cheddar-Art)", category: "dairy", nutrients: { calories: 320, protein: 4, carbs: 6, fat: 30 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (20g)", grams: 20 }] },
  { id: id(), name: "Vegane Butter", category: "fat", nutrients: { calories: 700, protein: 0, carbs: 1, fat: 76 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Cashew-Creme (vegan)", category: "dairy", nutrients: { calories: 265, protein: 5, carbs: 12, fat: 23 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Haferquark (vegan)", category: "dairy", nutrients: { calories: 62, protein: 3, carbs: 9, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (250g)", grams: 250 }] },
  // =======================================================================
  // MILCHPRODUKTE – DESSERTS & SPEZIALITÄTEN
  // =======================================================================
  { id: id(), name: "Panna Cotta", category: "dairy", nutrients: { calories: 210, protein: 3, carbs: 22, fat: 13 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (130g)", grams: 130 }] },
  { id: id(), name: "Joghurt mit Granola (Fertigpackung)", category: "dairy", nutrients: { calories: 175, protein: 5, carbs: 28, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Packung (200g)", grams: 200 }] },
  { id: id(), name: "Vanillepudding", category: "dairy", nutrients: { calories: 117, protein: 3.5, carbs: 19, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (125g)", grams: 125 }] },
  { id: id(), name: "Schokoladenpudding", category: "dairy", nutrients: { calories: 128, protein: 3.5, carbs: 21, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (125g)", grams: 125 }] },
  { id: id(), name: "Cr\xE8me br\xFBl\xE9e", category: "dairy", nutrients: { calories: 267, protein: 4, carbs: 22, fat: 18 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (120g)", grams: 120 }] },
  { id: id(), name: "Mousse au Chocolat", category: "dairy", nutrients: { calories: 288, protein: 5, carbs: 26, fat: 19 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (80g)", grams: 80 }] },
  { id: id(), name: "Joghurt (Kinderjoghurt)", category: "dairy", nutrients: { calories: 110, protein: 3, carbs: 18, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (100g)", grams: 100 }] },
  { id: id(), name: "Schokopudding (Fertig)", category: "dairy", nutrients: { calories: 110, protein: 3, carbs: 17, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (125g)", grams: 125 }] },
  { id: id(), name: "Rote Gr\xFCtze", category: "dairy", nutrients: { calories: 65, protein: 1, carbs: 15, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  // =======================================================================
  // FRISCHES FLEISCH – WEITERE VARIANTEN
  // =======================================================================
  { id: id(), name: "Entenleber (Foie Gras)", category: "protein", nutrients: { calories: 444, protein: 11, carbs: 5, fat: 43 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (30g)", grams: 30 }] },
  { id: id(), name: "Blutswurst", category: "protein", nutrients: { calories: 296, protein: 14, carbs: 9, fat: 24 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (40g)", grams: 40 }] },
  { id: id(), name: "Leberwurst (grob)", category: "protein", nutrients: { calories: 305, protein: 12, carbs: 3, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (25g)", grams: 25 }] },
  { id: id(), name: "Teewurst", category: "protein", nutrients: { calories: 415, protein: 14, carbs: 1, fat: 39 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Rinderroastbeef (kalt)", category: "protein", nutrients: { calories: 135, protein: 22, carbs: 0, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (60g)", grams: 60 }] },
  { id: id(), name: "Landjaeger", category: "protein", nutrients: { calories: 410, protein: 25, carbs: 1, fat: 34 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (40g)", grams: 40 }] },
  { id: id(), name: "Bratwurst (N\xFCrnberger)", category: "protein", nutrients: { calories: 320, protein: 17, carbs: 2, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (75g)", grams: 75 }] },
  { id: id(), name: "Bierschinken", category: "protein", nutrients: { calories: 195, protein: 14, carbs: 5, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (25g)", grams: 25 }] },
  { id: id(), name: "Fleischk\xE4se (Leberkaas)", category: "protein", nutrients: { calories: 295, protein: 13, carbs: 3, fat: 26 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (60g)", grams: 60 }] },
  // =======================================================================
  // WEITERE SPEISEFETTE & ÖLE
  // =======================================================================
  { id: id(), name: "Avocado\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Traubenkern\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Schwarzk\xFCmmel\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 TL (5ml)", grams: 5 }] },
  { id: id(), name: "Lein\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (10ml)", grams: 10 }] },
  { id: id(), name: "Kokosbutter", category: "fat", nutrients: { calories: 690, protein: 6, carbs: 25, fat: 68 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "MCT-\xD6l", category: "fat", nutrients: { calories: 862, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Paranuss-\xD6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Haselnuss\xF6l", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  // =======================================================================
  // GEWÜRZE & KRÄUTER ERWEITERT
  // =======================================================================
  { id: id(), name: "Garam Masala", category: "spice", nutrients: { calories: 379, protein: 14, carbs: 50, fat: 14 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Koriandersamen (gemahlen)", category: "spice", nutrients: { calories: 298, protein: 12, carbs: 55, fat: 18 }, servings: [{ name: "1 TL (2.5g)", grams: 2.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Fenchelsamen", category: "spice", nutrients: { calories: 345, protein: 15, carbs: 52, fat: 15 }, servings: [{ name: "1 TL (2g)", grams: 2 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Sternanis", category: "spice", nutrients: { calories: 337, protein: 18, carbs: 50, fat: 16 }, servings: [{ name: "1 Stk. (1.5g)", grams: 1.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Lorbeerbl\xE4tter", category: "spice", nutrients: { calories: 313, protein: 8, carbs: 75, fat: 8 }, servings: [{ name: "1 Blatt (0.5g)", grams: 0.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "K\xFCmmel", category: "spice", nutrients: { calories: 333, protein: 17, carbs: 50, fat: 14 }, servings: [{ name: "1 TL (2g)", grams: 2 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Majoran (getrocknet)", category: "spice", nutrients: { calories: 271, protein: 12, carbs: 61, fat: 7 }, servings: [{ name: "1 TL (1.5g)", grams: 1.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Salbei (getrocknet)", category: "spice", nutrients: { calories: 315, protein: 10, carbs: 61, fat: 12 }, servings: [{ name: "1 TL (1.5g)", grams: 1.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Chiliflocken", category: "spice", nutrients: { calories: 282, protein: 13, carbs: 50, fat: 12 }, servings: [{ name: "1 TL (2.5g)", grams: 2.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Cayennepfeffer", category: "spice", nutrients: { calories: 318, protein: 12, carbs: 57, fat: 17 }, servings: [{ name: "1 Prise (0.3g)", grams: 0.3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kardamom", category: "spice", nutrients: { calories: 311, protein: 11, carbs: 68, fat: 7 }, servings: [{ name: "1 Kapsel (1g)", grams: 1 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Safran", category: "spice", nutrients: { calories: 310, protein: 11, carbs: 65, fat: 5.9 }, servings: [{ name: "1 Prise (0.1g)", grams: 0.1 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Vanilleschote", category: "spice", nutrients: { calories: 288, protein: 7, carbs: 63, fat: 6 }, servings: [{ name: "1 Schote (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Dill (frisch)", category: "spice", nutrients: { calories: 43, protein: 3.5, carbs: 7, fat: 1.1 }, servings: [{ name: "1 EL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Koriander (frisch)", category: "spice", nutrients: { calories: 23, protein: 2.1, carbs: 3.7, fat: 0.5 }, servings: [{ name: "1 Handvoll (10g)", grams: 10 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Minze (frisch)", category: "spice", nutrients: { calories: 70, protein: 3.7, carbs: 15, fat: 0.9 }, servings: [{ name: "1 Zweig (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Estragon (frisch)", category: "spice", nutrients: { calories: 295, protein: 23, carbs: 50, fat: 7 }, servings: [{ name: "1 EL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Lavendel (Bl\xFCten, getrocknet)", category: "spice", nutrients: { calories: 49, protein: 2, carbs: 10, fat: 0.8 }, servings: [{ name: "1 TL (1g)", grams: 1 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Bockshornklee", category: "spice", nutrients: { calories: 323, protein: 23, carbs: 58, fat: 6 }, servings: [{ name: "1 TL (4g)", grams: 4 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Anis (gemahlen)", category: "spice", nutrients: { calories: 337, protein: 18, carbs: 50, fat: 16 }, servings: [{ name: "1 TL (2g)", grams: 2 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Hefeflocken (N\xE4hrhefe)", category: "spice", nutrients: { calories: 325, protein: 50, carbs: 35, fat: 4 }, servings: [{ name: "1 EL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  // =======================================================================
  // WEITERE HÜLSENFRÜCHTE & GETREIDE
  // =======================================================================
  { id: id(), name: "Mungobohnen (trocken)", category: "protein", nutrients: { calories: 347, protein: 24, carbs: 63, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Azukibohnen (gekocht)", category: "protein", nutrients: { calories: 128, protein: 8, carbs: 25, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kichererbsen (trocken)", category: "protein", nutrients: { calories: 364, protein: 19, carbs: 61, fat: 6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Bohnen schwarz (trocken)", category: "protein", nutrients: { calories: 341, protein: 21, carbs: 62, fat: 1.4 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Linsen orange (trocken)", category: "protein", nutrients: { calories: 353, protein: 25, carbs: 63, fat: 1.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sojabohnen (gekocht)", category: "protein", nutrients: { calories: 173, protein: 17, carbs: 10, fat: 9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Flaschenbohnen", category: "protein", nutrients: { calories: 31, protein: 2, carbs: 5.7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Linsensprossen", category: "protein", nutrients: { calories: 106, protein: 9, carbs: 22, fat: 0.6 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Alfalfa-Sprossen", category: "vegetable", nutrients: { calories: 23, protein: 4, carbs: 2, fat: 0.7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  // =======================================================================
  // FRÜHSTÜCKSCEREALIEN ERWEITERT
  // =======================================================================
  { id: id(), name: "Cheerios", category: "breakfast", nutrients: { calories: 376, protein: 12, carbs: 74, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (28g)", grams: 28 }] },
  { id: id(), name: "Frosted Flakes", category: "breakfast", nutrients: { calories: 380, protein: 5, carbs: 90, fat: 0.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (28g)", grams: 28 }] },
  { id: id(), name: "Crunchy M\xFCsli (Honig)", category: "breakfast", nutrients: { calories: 445, protein: 8, carbs: 65, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (50g)", grams: 50 }] },
  { id: id(), name: "Grape Nuts", category: "breakfast", nutrients: { calories: 356, protein: 13, carbs: 84, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (58g)", grams: 58 }] },
  { id: id(), name: "Weizenflakes", category: "breakfast", nutrients: { calories: 341, protein: 11, carbs: 74, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (30g)", grams: 30 }] },
  { id: id(), name: "Schokom\xFCsli", category: "breakfast", nutrients: { calories: 450, protein: 7, carbs: 65, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (50g)", grams: 50 }] },
  { id: id(), name: "Fr\xFChst\xFCcksriegel (Fitnessriegel)", category: "breakfast", nutrients: { calories: 395, protein: 11, carbs: 58, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Riegel (37g)", grams: 37 }] },
  { id: id(), name: "Dinkelkissen (Schoko)", category: "breakfast", nutrients: { calories: 440, protein: 8, carbs: 64, fat: 18 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (50g)", grams: 50 }] },
  { id: id(), name: "Hafer (Warm, gezuckert)", category: "breakfast", nutrients: { calories: 195, protein: 5, carbs: 35, fat: 4.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Fr\xFChst\xFCcksei (pochiert)", category: "breakfast", nutrients: { calories: 147, protein: 12, carbs: 0.7, fat: 10 }, servings: [{ name: "1 Stk. (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  // =======================================================================
  // WEITERE TIEFKÜHLPRODUKTE
  // =======================================================================
  { id: id(), name: "H\xE4hnchenbrust (TK, Gew\xFCrz)", category: "frozen", nutrients: { calories: 142, protein: 27, carbs: 2, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Lachsfilet (TK)", category: "frozen", nutrients: { calories: 182, protein: 18, carbs: 0, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (130g)", grams: 130 }] },
  { id: id(), name: "Scampi (TK, roh)", category: "frozen", nutrients: { calories: 85, protein: 18, carbs: 0.5, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Meeresfr\xFCchtemix (TK)", category: "frozen", nutrients: { calories: 90, protein: 15, carbs: 2, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Fischfilet (TK, Tilapia)", category: "frozen", nutrients: { calories: 90, protein: 18, carbs: 0, fat: 2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (150g)", grams: 150 }] },
  { id: id(), name: "Rindergulasch (TK, vorgegart)", category: "frozen", nutrients: { calories: 130, protein: 18, carbs: 4, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Spinat-Ricotta-Gnocchi (TK)", category: "frozen", nutrients: { calories: 175, protein: 7, carbs: 28, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (300g)", grams: 300 }] },
  { id: id(), name: "Gem\xFCse-Burger-Patty (TK)", category: "frozen", nutrients: { calories: 165, protein: 7, carbs: 22, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Patty (110g)", grams: 110 }] },
  { id: id(), name: "Dim Sum (TK, Garnelen)", category: "frozen", nutrients: { calories: 148, protein: 8, carbs: 21, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "4 Stk. (80g)", grams: 80 }] },
  { id: id(), name: "Maultaschen (TK)", category: "frozen", nutrients: { calories: 192, protein: 9, carbs: 26, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (70g)", grams: 70 }] },
  { id: id(), name: "Tortellini (TK, K\xE4se-Schinken)", category: "frozen", nutrients: { calories: 262, protein: 11, carbs: 39, fat: 7 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (250g)", grams: 250 }] },
  { id: id(), name: "Bl\xE4tterteig (TK)", category: "frozen", nutrients: { calories: 430, protein: 7, carbs: 44, fat: 26 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Rollen (275g)", grams: 275 }] },
  { id: id(), name: "Bananenscheiben (TK)", category: "frozen", nutrients: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Erdbeeren (TK)", category: "frozen", nutrients: { calories: 32, protein: 0.7, carbs: 8, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  // =======================================================================
  // WEITERE KONSERVEN
  // =======================================================================
  { id: id(), name: "Lachspaste (Tube)", category: "canned", nutrients: { calories: 155, protein: 12, carbs: 2, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Tube (100g)", grams: 100 }] },
  { id: id(), name: "Sardellenpaste", category: "canned", nutrients: { calories: 200, protein: 15, carbs: 2, fat: 15 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (5g)", grams: 5 }] },
  { id: id(), name: "Thunfisch-Creme (Dose)", category: "canned", nutrients: { calories: 175, protein: 16, carbs: 3, fat: 11 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Corned Beef (Dose)", category: "canned", nutrients: { calories: 250, protein: 22, carbs: 0, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (340g)", grams: 340 }] },
  { id: id(), name: "Linseneintopf (Dose)", category: "canned", nutrients: { calories: 82, protein: 5, carbs: 13, fat: 1.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Curry-H\xFChnchen (Dose)", category: "canned", nutrients: { calories: 120, protein: 12, carbs: 6, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Sojasprossen (Dose)", category: "canned", nutrients: { calories: 28, protein: 2.9, carbs: 5.9, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Paprika (Dose, eingelegt)", category: "canned", nutrients: { calories: 24, protein: 1, carbs: 5, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Maisk\xF6lbchen (Dose, mini)", category: "canned", nutrients: { calories: 28, protein: 2, carbs: 5.5, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sauerkrautsaft", category: "canned", nutrients: { calories: 11, protein: 0.8, carbs: 1.8, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Feldsalat (Dose)", category: "canned", nutrients: { calories: 17, protein: 1.8, carbs: 2, fat: 0.3 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Linsen mit Gem\xFCse (Dose)", category: "canned", nutrients: { calories: 88, protein: 6, carbs: 14, fat: 1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Spinatsuppe (Dose)", category: "canned", nutrients: { calories: 45, protein: 2, carbs: 6, fat: 1.8 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (400ml)", grams: 400 }] },
  { id: id(), name: "Pilzecremesuppe (Dose)", category: "canned", nutrients: { calories: 70, protein: 1.5, carbs: 8, fat: 3.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (400ml)", grams: 400 }] },
  // =======================================================================
  // SONSTIGE LEBENSMITTEL
  // =======================================================================
  { id: id(), name: "Spirulina-Pulver", category: "protein", nutrients: { calories: 290, protein: 57, carbs: 24, fat: 8 }, servings: [{ name: "1 TL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Chlorella-Pulver", category: "protein", nutrients: { calories: 411, protein: 58, carbs: 23, fat: 9 }, servings: [{ name: "1 TL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Collagen-Pulver", category: "protein", nutrients: { calories: 370, protein: 90, carbs: 1, fat: 1 }, servings: [{ name: "1 EL (10g)", grams: 10 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Konjak-Nudeln (Shirataki)", category: "carbs", nutrients: { calories: 9, protein: 0.3, carbs: 2, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Konjak-Reis", category: "carbs", nutrients: { calories: 9, protein: 0.3, carbs: 2, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (200g)", grams: 200 }] },
  { id: id(), name: "Palm\xF6l (roh)", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Kakaobutter", category: "fat", nutrients: { calories: 884, protein: 0, carbs: 0, fat: 100 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Rohkakao-Nibs", category: "snack", nutrients: { calories: 497, protein: 12, carbs: 44, fat: 42 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Gojibeeren (getrocknet)", category: "fruit", nutrients: { calories: 349, protein: 14, carbs: 78, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (15g)", grams: 15 }] },
  { id: id(), name: "Maca-Pulver", category: "carbs", nutrients: { calories: 325, protein: 14, carbs: 72, fat: 2 }, servings: [{ name: "1 TL (5g)", grams: 5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Ashwagandha-Pulver", category: "spice", nutrients: { calories: 245, protein: 5, carbs: 53, fat: 1 }, servings: [{ name: "1 TL (3g)", grams: 3 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Matcha-Pulver", category: "spice", nutrients: { calories: 324, protein: 30, carbs: 39, fat: 5 }, servings: [{ name: "1 TL (2g)", grams: 2 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Kefirpilz (Wasserkefir)", category: "drink", nutrients: { calories: 20, protein: 0, carbs: 5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }] },
  { id: id(), name: "Apfelmus (selbst gemacht)", category: "fruit", nutrients: { calories: 52, protein: 0.2, carbs: 13, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Erdnussflips (light)", category: "snack", nutrients: { calories: 410, protein: 10, carbs: 50, fat: 22 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Beerenjoghurt (vegan, Kokosbasis)", category: "dairy", nutrients: { calories: 90, protein: 1, carbs: 14, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Becher (150g)", grams: 150 }] },
  { id: id(), name: "Kochschinken (fettreduziert)", category: "protein", nutrients: { calories: 80, protein: 17, carbs: 0.8, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Scheibe (25g)", grams: 25 }] },
  { id: id(), name: "Speck (Pancetta)", category: "protein", nutrients: { calories: 417, protein: 15, carbs: 0, fat: 40 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (20g)", grams: 20 }] },
  { id: id(), name: "Schweinshaxe (gebraten)", category: "protein", nutrients: { calories: 295, protein: 25, carbs: 0, fat: 21 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (350g)", grams: 350 }] },
  { id: id(), name: "Gekochte H\xFChnerbrust (fertig)", category: "protein", nutrients: { calories: 155, protein: 29, carbs: 0, fat: 3.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  // =======================================================================
  // ABSCHLUSS-BATCH – WEITERE HÄUFIGE LEBENSMITTEL
  // =======================================================================
  { id: id(), name: "Schollenfilet (paniert)", category: "protein", nutrients: { calories: 220, protein: 14, carbs: 16, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Filet (150g)", grams: 150 }] },
  { id: id(), name: "Krabbencocktail", category: "protein", nutrients: { calories: 145, protein: 11, carbs: 8, fat: 7 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Crevetten (gegrillt)", category: "protein", nutrients: { calories: 119, protein: 24, carbs: 1, fat: 2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Eiwei\xDFbrot", category: "carbs", nutrients: { calories: 210, protein: 20, carbs: 28, fat: 3 }, servings: [{ name: "1 Scheibe (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Reiscracker (natur)", category: "snack", nutrients: { calories: 397, protein: 8, carbs: 82, fat: 3 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (10g)", grams: 10 }] },
  { id: id(), name: "Falafel (hausgemacht)", category: "protein", nutrients: { calories: 333, protein: 13, carbs: 32, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (75g)", grams: 75 }] },
  { id: id(), name: "Veganes Mett", category: "protein", nutrients: { calories: 165, protein: 15, carbs: 4, fat: 10 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Lachs-Aufschnitt (Gravlax)", category: "protein", nutrients: { calories: 196, protein: 20, carbs: 1, fat: 12 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Scheiben (50g)", grams: 50 }] },
  { id: id(), name: "Lammhackfleisch", category: "protein", nutrients: { calories: 235, protein: 18, carbs: 0, fat: 18 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Ente (Brust, gebraten)", category: "protein", nutrients: { calories: 337, protein: 19, carbs: 0, fat: 28 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Brust (180g)", grams: 180 }] },
  { id: id(), name: "Kabeljauzunge", category: "protein", nutrients: { calories: 80, protein: 17, carbs: 0, fat: 0.8 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Sesamkrokant", category: "sweets", nutrients: { calories: 500, protein: 12, carbs: 60, fat: 26 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (20g)", grams: 20 }] },
  { id: id(), name: "Karamellbonbons", category: "sweets", nutrients: { calories: 380, protein: 2, carbs: 80, fat: 5 }, servings: [{ name: "100g", grams: 100 }, { name: "3 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Fruchtgummis (Trolli)", category: "sweets", nutrients: { calories: 325, protein: 6, carbs: 73, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Nougatschokolade (Milka)", category: "sweets", nutrients: { calories: 510, protein: 6, carbs: 62, fat: 27 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Riegel (22g)", grams: 22 }] },
  { id: id(), name: "Bounty", category: "sweets", nutrients: { calories: 471, protein: 3, carbs: 60, fat: 24 }, servings: [{ name: "1 Riegel (28.5g)", grams: 28.5 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Dextrose (Traubenzucker)", category: "sweets", nutrients: { calories: 400, protein: 0, carbs: 100, fat: 0 }, servings: [{ name: "100g", grams: 100 }, { name: "1 T\xE4felchen (3g)", grams: 3 }] },
  { id: id(), name: "Fr\xFChlingszwiebeln (Dose)", category: "canned", nutrients: { calories: 32, protein: 1.8, carbs: 7, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Schwarze Bohnen (Dose)", category: "canned", nutrients: { calories: 90, protein: 7, carbs: 13.5, fat: 0.4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Dose (400g)", grams: 400 }] },
  { id: id(), name: "Papaya-Chutney", category: "canned", nutrients: { calories: 215, protein: 0.3, carbs: 55, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Mango-Chutney", category: "canned", nutrients: { calories: 235, protein: 0.4, carbs: 60, fat: 0.1 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Pfirsich-Chutney", category: "canned", nutrients: { calories: 200, protein: 0.5, carbs: 50, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Tahini Dressing", category: "sauce", nutrients: { calories: 325, protein: 8, carbs: 18, fat: 27 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Ponzu Sauce", category: "sauce", nutrients: { calories: 60, protein: 2, carbs: 11, fat: 0.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Beurre blanc (Wei\xDFweinsauce)", category: "sauce", nutrients: { calories: 415, protein: 1.5, carbs: 3, fat: 45 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Hollandaise (fertig)", category: "sauce", nutrients: { calories: 460, protein: 2, carbs: 2, fat: 49 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "B\xE9chamel (hausgemacht)", category: "sauce", nutrients: { calories: 115, protein: 4, carbs: 10, fat: 7 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (20ml)", grams: 20 }] },
  { id: id(), name: "Gravy (Bratensauce)", category: "sauce", nutrients: { calories: 60, protein: 2.5, carbs: 7, fat: 2.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (20ml)", grams: 20 }] },
  { id: id(), name: "Cocktailsauce", category: "sauce", nutrients: { calories: 260, protein: 1, carbs: 16, fat: 22 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Ranch Dressing", category: "sauce", nutrients: { calories: 455, protein: 1, carbs: 4, fat: 48 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Thousand Island Dressing", category: "sauce", nutrients: { calories: 380, protein: 1, carbs: 15, fat: 36 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (15ml)", grams: 15 }] },
  { id: id(), name: "Chestnut Spread (Maronenp\xFCree)", category: "sauce", nutrients: { calories: 258, protein: 2.5, carbs: 58, fat: 1.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Bruschetta-Topping (Dose)", category: "canned", nutrients: { calories: 60, protein: 1.5, carbs: 9, fat: 2.5 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (20g)", grams: 20 }] },
  { id: id(), name: "Balsamico-Creme", category: "sauce", nutrients: { calories: 180, protein: 0.5, carbs: 43, fat: 0.3 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 TL (5ml)", grams: 5 }] },
  { id: id(), name: "H\xFChnerbruststreifen (gegrillt)", category: "protein", nutrients: { calories: 165, protein: 30, carbs: 1, fat: 4 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Portion (150g)", grams: 150 }] },
  { id: id(), name: "Lammkeule (gebraten)", category: "protein", nutrients: { calories: 195, protein: 27, carbs: 0, fat: 9 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Kalbsleber", category: "protein", nutrients: { calories: 140, protein: 20, carbs: 4, fat: 5 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "Wiener W\xFCrstchen (H\xFChnerfleisch)", category: "protein", nutrients: { calories: 195, protein: 13, carbs: 2, fat: 15 }, servings: [{ name: "1 Stk. (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "S\xFClze (Aspik)", category: "protein", nutrients: { calories: 65, protein: 12, carbs: 2, fat: 1 }, servings: [{ name: "100g", grams: 100 }] },
  { id: id(), name: "H\xFChnerschenkel (TK, mariniert)", category: "frozen", nutrients: { calories: 188, protein: 20, carbs: 3, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (200g)", grams: 200 }] },
  { id: id(), name: "Beef Jerky (original)", category: "snack", nutrients: { calories: 286, protein: 33, carbs: 11, fat: 11 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Beutel (25g)", grams: 25 }] },
  { id: id(), name: "Gemischte N\xFCsse (ungesalzen)", category: "fat", nutrients: { calories: 612, protein: 16, carbs: 18, fat: 56 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (30g)", grams: 30 }] },
  { id: id(), name: "Kokoschips (ger\xF6stet)", category: "snack", nutrients: { calories: 620, protein: 5, carbs: 20, fat: 60 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Handvoll (15g)", grams: 15 }] },
  { id: id(), name: "Sesamkerne (wei\xDF)", category: "fat", nutrients: { calories: 573, protein: 18, carbs: 23, fat: 50 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (10g)", grams: 10 }] },
  { id: id(), name: "Mohnkuchen", category: "bakery", nutrients: { calories: 370, protein: 7, carbs: 52, fat: 16 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Nussecken", category: "bakery", nutrients: { calories: 440, protein: 7, carbs: 48, fat: 26 }, servings: [{ name: "1 Stk. (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Mandelh\xF6rnchen", category: "bakery", nutrients: { calories: 450, protein: 9, carbs: 50, fat: 25 }, servings: [{ name: "1 Stk. (50g)", grams: 50 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Bienenstich", category: "bakery", nutrients: { calories: 365, protein: 6, carbs: 48, fat: 17 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Schwarzw\xE4lder Kirsch (St\xFCck)", category: "bakery", nutrients: { calories: 330, protein: 4, carbs: 38, fat: 18 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Walnusskuchen", category: "bakery", nutrients: { calories: 445, protein: 8, carbs: 50, fat: 25 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Mohnbr\xF6tchen", category: "bakery", nutrients: { calories: 278, protein: 9, carbs: 52, fat: 3.5 }, servings: [{ name: "1 Stk. (65g)", grams: 65 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "R\xFCblitorte (Karottenkuchen)", category: "bakery", nutrients: { calories: 360, protein: 5, carbs: 48, fat: 18 }, servings: [{ name: "1 St\xFCck (100g)", grams: 100 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Protein-Pancakes", category: "breakfast", nutrients: { calories: 265, protein: 22, carbs: 32, fat: 6 }, servings: [{ name: "100g", grams: 100 }, { name: "2 Stk. (150g)", grams: 150 }] },
  { id: id(), name: "Granola-Bar (Hafer)", category: "breakfast", nutrients: { calories: 395, protein: 7, carbs: 61, fat: 14 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (40g)", grams: 40 }] },
  { id: id(), name: "Fr\xFChst\xFCckswurst (Mettwurst)", category: "protein", nutrients: { calories: 350, protein: 16, carbs: 0, fat: 31 }, servings: [{ name: "100g", grams: 100 }, { name: "1 EL (25g)", grams: 25 }] },
  { id: id(), name: "Schwarzbrot (Pumpernickel-Art)", category: "carbs", nutrients: { calories: 175, protein: 6, carbs: 36, fat: 1 }, servings: [{ name: "1 Scheibe (30g)", grams: 30 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Eibr\xF6tchen", category: "bakery", nutrients: { calories: 295, protein: 11, carbs: 50, fat: 6 }, servings: [{ name: "1 Stk. (75g)", grams: 75 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "M\xFCsliriegel (Schoko-Nuss)", category: "snack", nutrients: { calories: 462, protein: 7, carbs: 60, fat: 22 }, servings: [{ name: "1 Riegel (40g)", grams: 40 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Fruchtschnitten", category: "snack", nutrients: { calories: 350, protein: 3, carbs: 72, fat: 4 }, servings: [{ name: "1 Stk. (25g)", grams: 25 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Energieb\xE4llchen (Datteln-N\xFCsse)", category: "snack", nutrients: { calories: 395, protein: 8, carbs: 58, fat: 17 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Kokosriegel (Bounty-Art)", category: "sweets", nutrients: { calories: 475, protein: 3, carbs: 62, fat: 24 }, servings: [{ name: "100g", grams: 100 }, { name: "1 Stk. (30g)", grams: 30 }] },
  { id: id(), name: "Gelatine (Blatt)", category: "spice", nutrients: { calories: 335, protein: 87, carbs: 0, fat: 0 }, servings: [{ name: "1 Blatt (1.7g)", grams: 1.7 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Maisst\xE4rke", category: "spice", nutrients: { calories: 381, protein: 0.5, carbs: 91, fat: 0.1 }, servings: [{ name: "1 EL (12g)", grams: 12 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Trockenhefe", category: "spice", nutrients: { calories: 325, protein: 40, carbs: 42, fat: 7 }, servings: [{ name: "1 P\xE4ckchen (7g)", grams: 7 }, { name: "100g", grams: 100 }] },
  { id: id(), name: "Natron", category: "spice", nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "1 TL (3g)", grams: 3 }] },
  { id: id(), name: "Ahornsirup", category: "sauce", nutrients: { calories: 260, protein: 0, carbs: 67, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 EL (20ml)", grams: 20 }] },
  { id: id(), name: "Kokosbl\xFCtenzucker", category: "spice", nutrients: { calories: 377, protein: 0.3, carbs: 95, fat: 0.2 }, servings: [{ name: "100g", grams: 100 }, { name: "1 TL (4g)", grams: 4 }] },
  { id: id(), name: "Stevia-Fl\xFCssigs\xFC\xDFe", category: "spice", nutrients: { calories: 0, protein: 0, carbs: 0, fat: 0 }, servings: [{ name: "10 Tropfen (0.5ml)", grams: 0.5 }] },
  { id: id(), name: "Apfel-Birnen-Saft", category: "drink", nutrients: { calories: 46, protein: 0.1, carbs: 12, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Kirsch-Nektar", category: "drink", nutrients: { calories: 55, protein: 0.3, carbs: 14, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Bananenmilch", category: "drink", nutrients: { calories: 72, protein: 2.5, carbs: 13, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Erdbeermilch", category: "drink", nutrients: { calories: 68, protein: 3, carbs: 12, fat: 1.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Schokomilch", category: "drink", nutrients: { calories: 80, protein: 3, carbs: 13, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] },
  { id: id(), name: "Buttermilch-Drink (Erdbeer)", category: "drink", nutrients: { calories: 55, protein: 2.5, carbs: 9, fat: 1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (500ml)", grams: 500 }] },
  { id: id(), name: "Bier (Craft, IPA)", category: "drink", nutrients: { calories: 55, protein: 0.7, carbs: 5, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (330ml)", grams: 330 }] },
  { id: id(), name: "Hard Seltzer", category: "drink", nutrients: { calories: 30, protein: 0, carbs: 2, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (330ml)", grams: 330 }] },
  { id: id(), name: "Kaffeegetr\xE4nk (Frappuccino)", category: "drink", nutrients: { calories: 110, protein: 2, carbs: 19, fat: 3 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (250ml)", grams: 250 }] },
  { id: id(), name: "Milchtee (Bubble Tea, Taro)", category: "drink", nutrients: { calories: 95, protein: 1.5, carbs: 20, fat: 1.5 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Becher (500ml)", grams: 500 }] },
  { id: id(), name: "Ingwershot", category: "drink", nutrients: { calories: 45, protein: 0.8, carbs: 10, fat: 0.5 }, servings: [{ name: "1 Shot (60ml)", grams: 60 }, { name: "100ml", grams: 100 }] },
  { id: id(), name: "Rote-Bete-Saft", category: "drink", nutrients: { calories: 40, protein: 1, carbs: 9, fat: 0.1 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (200ml)", grams: 200 }] },
  { id: id(), name: "Spinat-Smoothie (green)", category: "drink", nutrients: { calories: 50, protein: 2, carbs: 9, fat: 0.8 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Proteinshake (Erdbeere)", category: "drink", nutrients: { calories: 140, protein: 24, carbs: 11, fat: 2 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Flasche (330ml)", grams: 330 }] },
  { id: id(), name: "Guarana-Drink", category: "drink", nutrients: { calories: 42, protein: 0, carbs: 11, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Dose (250ml)", grams: 250 }] },
  { id: id(), name: "Chlorophyll-Wasser", category: "drink", nutrients: { calories: 5, protein: 0, carbs: 1, fat: 0 }, servings: [{ name: "100ml", grams: 100 }, { name: "1 Glas (250ml)", grams: 250 }] }
];

// src/lib/mealAiShared.ts
function parseDataUrl(dataUrl) {
  const m = dataUrl.trim().match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return null;
  return { mimeType: m[1].trim() || "image/jpeg", data: m[2].replace(/\s/g, "") };
}
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}
function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/\(.*\)/g, "").trim();
}
function findBestFoodMatch(foodName) {
  const normalized = normalizeName(foodName);
  let bestMatch = null;
  let bestScore = Infinity;
  const threshold = 3;
  for (const food of FOOD_DATABASE) {
    const foodNormalized = normalizeName(food.name);
    const distance = levenshteinDistance(normalized, foodNormalized);
    if (foodNormalized === normalized) {
      return food;
    }
    if (distance < bestScore && distance <= threshold) {
      bestScore = distance;
      bestMatch = food;
    }
    if (foodNormalized.includes(normalized) || normalized.includes(foodNormalized.split(" ")[0])) {
      if (distance < bestScore) {
        bestScore = distance;
        bestMatch = food;
      }
    }
  }
  return bestMatch;
}
function convertToGrams(amount, unit) {
  const unitLower = unit.toLowerCase();
  if (unitLower.includes("g") || unitLower.includes("gram")) return amount;
  if (unitLower.includes("oz")) return amount * 28.35;
  if (unitLower.includes("lb")) return amount * 453.6;
  if (unitLower.includes("ml") || unitLower.includes("l")) return amount;
  if (unitLower.includes("cup") || unitLower.includes("tasse")) return amount * 240;
  if (unitLower.includes("tbsp") || unitLower.includes("el")) return amount * 15;
  if (unitLower.includes("tsp") || unitLower.includes("tl")) return amount * 5;
  return amount;
}
function buildMealAnalysisUserPrompt(input, hasImage) {
  const foodDatabaseInfo = `
Du hast Zugriff auf eine Lebensmittel-Datenbank mit standardisierten Eintr\xE4gen.
WICHTIG: Nur Lebensmittel logged, die genau in dieser Datenbank existieren!

Beispiele aus der Datenbank:
- H\xFChnerbrust (roh), H\xFChnerbrust (gebraten), H\xFChnerbrust (paniert)
- Kabeljau (Dorsch), Lachsfilet (frisch), Lachs (ger\xE4uchert)
- Brokkoli, Spinat (frisch), Paprika (rot), Paprika (gr\xFCn)
- Banana, Apfel, Erdbeeren, Blaubeeren
- Kaffee (schwarz), Cappuccino, Latte Macchiato
- Reis (Langkorn, gekocht), Vollkornbrot, Nudeln (gekocht)

REGELN:
1. Nur Items aus der Datenbank \u2014 falls ein Item nicht existiert, skip it!
2. Nutze die EXAKTE Bezeichnung aus der Datenbank
3. Format JSON mit ingredients: name, amount, unit (g), calories, protein, carbs, fat pro gew\xE4hlter Menge
`;
  return `${foodDatabaseInfo}

Analysiere diese Mahlzeit ${hasImage ? "aus der Beschreibung und/oder dem Foto" : "aus der Beschreibung"}.
Beschreibung: "${input}"

Extrahiere ALLE Zutaten und matched sie EXACT mit Datenbank-Eintr\xE4gen.

Antworte NUR mit JSON ohne zus\xE4tzlichen Text:
{
  "ingredients": [
    {
      "name": "Exakter Name aus Datenbank",
      "amount": 100,
      "unit": "g",
      "calories": 150,
      "protein": 5,
      "carbs": 20,
      "fat": 2
    }
  ]
}`;
}
function extractIngredientsFromAiContent(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    const ing = parsed.ingredients;
    if (!Array.isArray(ing)) return [];
    return ing.map((raw) => {
      const o = raw;
      const name = typeof o.name === "string" ? o.name : "";
      const amount = typeof o.amount === "number" ? o.amount : parseFloat(String(o.amount ?? "0")) || 0;
      const unit = typeof o.unit === "string" ? o.unit : "g";
      if (!name.trim()) return null;
      return { name: name.trim(), amount, unit };
    }).filter((x) => x !== null);
  } catch {
    return [];
  }
}
function parseSimpleDescription(description) {
  const items = [];
  const chunks = description.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const m = chunk.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb)?$/i);
    if (m) {
      const amt = parseFloat(m[2].replace(",", "."));
      items.push({ name: m[1].trim(), amount: amt, unit: m[3] || "g" });
    } else if (chunk.length > 1 && chunk.length < 120) {
      items.push({ name: chunk, amount: 100, unit: "g" });
    }
  }
  return items;
}
function mapParsedToIngredients(items) {
  const validatedIngredients = [];
  for (const item of items) {
    const matchedFood = findBestFoodMatch(item.name);
    if (!matchedFood) {
      console.warn(`mealAi: no DB match for "${item.name}"`);
      continue;
    }
    const gramsAmount = convertToGrams(item.amount, item.unit || "g");
    let selectedServing = matchedFood.servings[0];
    let closestDifference = Math.abs(selectedServing.grams - gramsAmount);
    for (const serving of matchedFood.servings) {
      const diff = Math.abs(serving.grams - gramsAmount);
      if (diff < closestDifference) {
        closestDifference = diff;
        selectedServing = serving;
      }
    }
    const ratio = selectedServing.grams / 100;
    validatedIngredients.push({
      id: matchedFood.id,
      name: matchedFood.name,
      amount: selectedServing.grams,
      unit: "g",
      servingName: selectedServing.name,
      calories: Math.round(matchedFood.nutrients.calories * ratio),
      protein: Math.round(matchedFood.nutrients.protein * ratio * 10) / 10,
      carbs: Math.round(matchedFood.nutrients.carbs * ratio * 10) / 10,
      fat: Math.round(matchedFood.nutrients.fat * ratio * 10) / 10
    });
  }
  return validatedIngredients;
}

// server.ts
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
var { Pool } = pg;
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "fitness_tracker",
  user: process.env.POSTGRES_USER || "vrtx",
  password: process.env.POSTGRES_PASSWORD || "vrtx_secret"
});
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(100) NOT NULL DEFAULT '',
      email          VARCHAR(200) UNIQUE NOT NULL,
      password_hash  VARCHAR(256),
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name   VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url      TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded      BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership     VARCHAR(20) NOT NULL DEFAULT 'pro'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'dark'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS goals          JSONB NOT NULL DEFAULT '{"type":"maintain","dailySteps":10000,"dailyCalories":2500}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS measurements   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS workout_plan   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_preferences JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_history JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coaching_active BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_extras JSONB NOT NULL DEFAULT '{}'::jsonb`
  ];
  for (const sql of migrations) {
    await pool.query(sql);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workouts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      subtype        VARCHAR(50),
      duration       INTEGER NOT NULL DEFAULT 0,
      calories_burned INTEGER NOT NULL DEFAULT 0,
      date           DATE NOT NULL DEFAULT CURRENT_DATE,
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes          TEXT,
      shared         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      template_mode  VARCHAR(20) NOT NULL DEFAULT 'workout',
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      week_plan      JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'workout'`);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS week_plan JSONB`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal       VARCHAR(200) NOT NULL,
      category   VARCHAR(30),
      calories   NUMERIC NOT NULL DEFAULT 0,
      protein    NUMERIC NOT NULL DEFAULT 0,
      carbs      NUMERIC NOT NULL DEFAULT 0,
      fat        NUMERIC NOT NULL DEFAULT 0,
      date       DATE NOT NULL DEFAULT CURRENT_DATE,
      ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS quantity NUMERIC`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(200) NOT NULL,
      category      VARCHAR(30),
      ingredients   JSONB NOT NULL DEFAULT '[]'::jsonb,
      total_calories NUMERIC NOT NULL DEFAULT 0,
      total_protein  NUMERIC NOT NULL DEFAULT 0,
      total_carbs    NUMERIC NOT NULL DEFAULT 0,
      total_fat      NUMERIC NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS yields_portions INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      image_url  TEXT,
      likes      INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      type       VARCHAR(20) NOT NULL DEFAULT 'manual',
      workout_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body          TEXT NOT NULL,
      read_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON direct_messages (sender_id, recipient_id, created_at DESC)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_plans (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type           VARCHAR(20) NOT NULL,           -- 'workout' | 'nutrition'
      status         VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active'|'paused'|'cancelled'|'completed'
      discipline     VARCHAR(60),                    -- workout discipline
      plan_mode      VARCHAR(20) NOT NULL,           -- 'ongoing' | 'event'
      event_name     VARCHAR(200),
      event_date     DATE,
      event_distance VARCHAR(100),
      current_week   INTEGER NOT NULL DEFAULT 1,
      onboarding_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_schedules (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      start_date   DATE,
      schedule     JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_reports (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      report       JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);
  console.log("\u2705 Database schema ready");
}
function mapUser(row) {
  const pe = typeof row.profile_extras === "string" ? JSON.parse(row.profile_extras || "{}") : row.profile_extras || {};
  const pref = row.theme_preference || "dark";
  let themeVariant = pe.themeVariant || (pref === "dark" ? "dark_standard" : "light_standard");
  if (themeVariant === "default") themeVariant = pref === "dark" ? "dark_standard" : "light_standard";
  if (themeVariant === "midnight") themeVariant = "dark_deep";
  if (themeVariant === "classic_light") themeVariant = "light_warm";
  return {
    uid: row.id.toString(),
    displayName: row.display_name || row.name || "",
    email: row.email,
    photoURL: row.photo_url || "",
    bio: row.bio || "",
    onboarded: row.onboarded ?? false,
    membership: row.membership || "free",
    accountCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : void 0,
    themePreference: pref,
    themeVariant,
    goals: row.goals || { type: "maintain", dailySteps: 1e4, dailyCalories: 2500 },
    measurements: row.measurements || null,
    workoutPlan: row.workout_plan || null,
    coachPreferences: row.coach_preferences || null,
    weightHistory: row.weight_history || [],
    coachingActive: row.coaching_active || false,
    freeWorkoutSchedule: pe.freeWorkoutSchedule ?? void 0,
    dailyWaterLog: pe.dailyWaterLog ?? void 0,
    dailyActivityLog: pe.dailyActivityLog ?? void 0,
    checkIns: pe.checkIns ?? void 0,
    favoriteMealTemplateIds: pe.favoriteMealTemplateIds ?? void 0,
    reminderSettings: pe.reminderSettings ?? void 0,
    bodyMeasurements: pe.bodyMeasurements ?? void 0
  };
}
function mapWorkout(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Other",
    subtype: row.subtype,
    duration: row.duration || 0,
    caloriesBurned: row.calories_burned || 0,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    exercises: row.exercises || [],
    notes: row.notes || "",
    shared: row.shared || false
  };
}
function mapTemplate(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Strength",
    templateMode: row.template_mode || "workout",
    exercises: row.exercises || [],
    weekPlan: row.week_plan || null
  };
}
function mapNutrition(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    meal: row.meal,
    category: row.category || "snack",
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    ingredients: row.ingredients || [],
    quantity: row.quantity != null ? Number(row.quantity) : void 0,
    unit: row.unit || void 0
  };
}
function mapMealTemplate(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    category: row.category || "snack",
    ingredients: row.ingredients || [],
    totalCalories: Number(row.total_calories),
    totalProtein: Number(row.total_protein),
    totalCarbs: Number(row.total_carbs),
    totalFat: Number(row.total_fat),
    yieldsPortions: Math.max(1, parseInt(String(row.yields_portions ?? 1), 10) || 1)
  };
}
function mapPost(row) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    userName: row.user_name || "",
    userPhoto: row.user_photo || "",
    content: row.content,
    imageUrl: row.image_url,
    likes: (row.likes || []).map(String),
    type: row.type || "manual",
    workoutId: row.workout_id,
    createdAt: row.created_at
  };
}
var JWT_SECRET = process.env.JWT_SECRET || "vrtx-dev-secret-change-me";
var ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
var ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin";
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Basic ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user, ...rest] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  if (user === ADMIN_USER && rest.join(":") === ADMIN_PASS) {
    next();
    return;
  }
  res.status(401).json({ error: "Invalid credentials" });
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/ai/status", (_req, res) => {
    const caps = resolveAiCapabilities();
    res.json({
      enabled: caps.enabled,
      provider: caps.provider,
      mistralConfigured: caps.mistralConfigured,
      geminiConfigured: caps.geminiConfigured
    });
  });
  app.post("/api/ai/analyze-meal", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const { input, imageDataUrl } = req.body;
    const text = (input ?? "").trim();
    let image;
    if (imageDataUrl) {
      const parsedUrl = parseDataUrl(imageDataUrl);
      if (parsedUrl) image = { mimeType: parsedUrl.mimeType, data: parsedUrl.data };
    }
    if (!text && !image) {
      res.status(400).json({ error: "Beschreibung oder Bild erforderlich." });
      return;
    }
    try {
      const prompt = buildMealAnalysisUserPrompt(
        text || "Analysiere das Foto der Mahlzeit.",
        Boolean(image)
      );
      const raw = await completeMealAnalysis(prompt, image);
      let parsedItems = extractIngredientsFromAiContent(raw);
      if (!parsedItems.length) parsedItems = parseSimpleDescription(raw);
      if (!parsedItems.length && text) parsedItems = parseSimpleDescription(text);
      const ingredients = mapParsedToIngredients(parsedItems);
      res.json({ ingredients });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Meal analysis failed";
      console.error("analyze-meal:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/ai/generate-workout-template", requireAuth, async (req, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
      return;
    }
    const body = req.body;
    const equipment = Array.isArray(body.equipment) ? body.equipment : [];
    const duration = typeof body.duration === "number" ? body.duration : 60;
    const type = body.type === "Cardio" || body.type === "Hybrid" ? body.type : "Strength";
    const equipmentList = equipment.length > 0 ? equipment.join(", ") : "bodyweight only";
    const prompt = `You are an elite personal trainer. Generate a complete, scientifically structured ${type} workout template.

Constraints:
- Available equipment: ${equipmentList}
- Session duration: ~${duration} minutes (including warm-up)
- Workout type: ${type}
${body.specialRequests ? `- Special requests: ${body.specialRequests}` : ""}

Rules for the response:
- Include 6\u201312 exercises depending on duration
- Use supersets where appropriate for efficiency (mark with same supersetGroup letter: "A", "B", etc.)
- Provide detailed set structures: warmup sets, working sets, dropsets, failure sets where appropriate
- Prescribe realistic weights (in kg) based on average intermediate athlete
- Include exercise notes with form cues and intensity tips
- For Cardio: include zone-based intervals (duration, pace zone)
- For Hybrid: mix compound strength + conditioning

Return ONLY a valid JSON object matching exactly this structure:
{
  "name": "Descriptive Workout Name",
  "type": "${type}",
  "description": "1\u20132 sentence overview of the session focus",
  "exercises": [
    {
      "name": "Exercise Name",
      "supersetGroup": "A",
      "notes": "Form cue or pairing instruction",
      "sets": [
        { "reps": 10, "weight": 40, "completed": false, "type": "warmup" },
        { "reps": 8,  "weight": 60, "completed": false, "type": "normal" }
      ]
    }
  ]
}

Set type options: "warmup", "normal", "dropset", "failure"
If an exercise has no superset partner, omit the supersetGroup field entirely.
For cardio exercises use: { "reps": duration_in_seconds, "weight": 0, "completed": false, "type": "normal" } and put the zone/pace info in notes.`;
    try {
      const text = await completeWorkoutTemplateJson(prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ error: "Could not parse AI workout response" });
        return;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      res.json({
        name: parsed.name || "AI Generated Workout",
        type: parsed.type || type,
        description: parsed.description,
        exercises: parsed.exercises || []
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Workout generation failed";
      console.error("generate-workout-template:", err);
      res.status(500).json({ error: msg });
    }
  });
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, email, password, age, gender } = req.body;
      if (!name || !email || !password) {
        res.status(400).json({ error: "All fields required" });
        return;
      }
      const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
      if (existing.rows.length) {
        res.status(409).json({ error: "auth/email-already-in-use" });
        return;
      }
      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        "INSERT INTO users (name, email, password_hash, display_name, membership) VALUES ($1,$2,$3,$1,'pro') RETURNING *",
        [name, email, hash]
      );
      const user = result.rows[0];
      if (age || gender) {
        const initialMeasurements = { age: age || null, gender: gender || null };
        await pool.query(
          "UPDATE users SET measurements=$2, updated_at=NOW() WHERE id=$1",
          [user.id, JSON.stringify(initialMeasurements)]
        );
        user.measurements = initialMeasurements;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await pool.query("SELECT * FROM users WHERE email=$1 AND is_active=true", [email]);
      if (!result.rows.length) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const user = result.rows[0];
      if (!user.password_hash) {
        res.status(401).json({ error: "Use Google sign-in" });
        return;
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });
  app.get("/api/profile", requireAuth, async (req, res) => {
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(mapUser(result.rows[0]));
  });
  app.patch("/api/profile", requireAuth, async (req, res) => {
    const extrasKeys = [
      "freeWorkoutSchedule",
      "dailyWaterLog",
      "checkIns",
      "favoriteMealTemplateIds",
      "themeVariant",
      "reminderSettings",
      "bodyMeasurements",
      "dailyActivityLog"
    ];
    const pePatch = {};
    for (const k of extrasKeys) {
      if (k in req.body) pePatch[k] = req.body[k];
    }
    if (Object.keys(pePatch).length) {
      const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
      const prev = typeof cur.rows[0]?.profile_extras === "string" ? JSON.parse(cur.rows[0].profile_extras || "{}") : cur.rows[0]?.profile_extras || {};
      const merged = { ...prev, ...pePatch };
      await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
        req.userId,
        JSON.stringify(merged)
      ]);
    }
    const allowed = {
      displayName: "display_name",
      photoURL: "photo_url",
      bio: "bio",
      onboarded: "onboarded",
      membership: "membership",
      themePreference: "theme_preference",
      goals: "goals",
      measurements: "measurements",
      workoutPlan: "workout_plan",
      coachPreferences: "coach_preferences",
      weightHistory: "weight_history",
      coachingActive: "coaching_active"
    };
    const sets = [];
    const vals = [req.userId];
    for (const [key, col] of Object.entries(allowed)) {
      if (key in req.body) {
        const v = req.body[key];
        vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
        sets.push(`${col}=$${vals.length}`);
      }
    }
    if (sets.length) {
      await pool.query(`UPDATE users SET ${sets.join(",")},updated_at=NOW() WHERE id=$1`, vals);
    }
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
    res.json(mapUser(result.rows[0]));
  });
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT id, display_name, name, photo_url FROM users WHERE id=$1",
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const u = result.rows[0];
    res.json({ uid: u.id.toString(), displayName: u.display_name || u.name, photoURL: u.photo_url || "" });
  });
  app.get("/api/users/:id/social", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    if (Number.isNaN(uid)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [followers, following, rel] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE following_id=$1`, [uid]),
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE follower_id=$1`, [uid]),
      pool.query(`SELECT 1 FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, uid])
    ]);
    res.json({
      followers: followers.rows[0]?.c ?? 0,
      following: following.rows[0]?.c ?? 0,
      youFollow: rel.rows.length > 0
    });
  });
  app.post("/api/users/:id/follow", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    if (Number.isNaN(target) || target === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    await pool.query(
      `INSERT INTO user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.userId, target]
    );
    res.json({ ok: true });
  });
  app.delete("/api/users/:id/follow", requireAuth, async (req, res) => {
    const target = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, target]);
    res.json({ ok: true });
  });
  app.get("/api/users/:id/posts", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 80`,
      [uid]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.get("/api/posts/liked", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE $1 = ANY(p.likes) ORDER BY p.created_at DESC LIMIT 80`,
      [req.userId]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.get("/api/messages/inbox", requireAuth, async (req, res) => {
    const result = await pool.query(
      `WITH partners AS (
         SELECT DISTINCT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS oid
         FROM direct_messages WHERE sender_id=$1 OR recipient_id=$1
       )
       SELECT u.id, u.display_name, u.name, u.photo_url,
         (SELECT body FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_body,
         (SELECT created_at FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_at
       FROM partners p JOIN users u ON u.id=p.oid
       ORDER BY last_at DESC NULLS LAST`,
      [req.userId]
    );
    res.json(
      result.rows.map((r) => ({
        userId: r.id.toString(),
        displayName: r.display_name || r.name || "",
        photoURL: r.photo_url || "",
        lastMessage: r.last_body || "",
        lastAt: r.last_at
      }))
    );
  });
  app.get("/api/messages/thread/:userId", requireAuth, async (req, res) => {
    const other = parseInt(req.params.userId, 10);
    const result = await pool.query(
      `SELECT id, sender_id, recipient_id, body, created_at FROM direct_messages
       WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
       ORDER BY created_at ASC LIMIT 300`,
      [req.userId, other]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        senderId: r.sender_id.toString(),
        recipientId: r.recipient_id.toString(),
        body: r.body,
        createdAt: r.created_at
      }))
    );
  });
  app.post("/api/messages", requireAuth, async (req, res) => {
    const { recipientId, body } = req.body;
    const rid = parseInt(String(recipientId || ""), 10);
    const text = (body || "").trim().slice(0, 4e3);
    if (!text || Number.isNaN(rid) || rid === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.userId, rid, text]
    );
    res.json({ id: ins.rows[0].id, createdAt: ins.rows[0].created_at });
  });
  app.get("/api/workouts", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapWorkout));
  });
  app.post("/api/workouts", requireAuth, async (req, res) => {
    const { name, type, subtype, duration, caloriesBurned, date, exercises, notes, shared } = req.body;
    const result = await pool.query(
      `INSERT INTO workouts (user_id,name,type,subtype,duration,calories_burned,date,exercises,notes,shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        req.userId,
        name,
        type,
        subtype,
        duration || 0,
        caloriesBurned || 0,
        date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(exercises || []),
        notes,
        shared || false
      ]
    );
    res.json({ id: result.rows[0].id });
  });
  app.put("/api/workouts/:id", requireAuth, async (req, res) => {
    const { name, duration, caloriesBurned, exercises, notes, shared } = req.body;
    await pool.query(
      `UPDATE workouts SET name=$2,duration=$3,calories_burned=$4,exercises=$5,notes=$6,shared=$7,updated_at=NOW()
       WHERE id=$1 AND user_id=$8`,
      [req.params.id, name, duration, caloriesBurned, JSON.stringify(exercises || []), notes, shared, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/workouts/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM workouts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/workout-templates", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM workout_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapTemplate));
  });
  app.post("/api/workout-templates", requireAuth, async (req, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    const result = await pool.query(
      "INSERT INTO workout_templates (user_id,name,type,template_mode,exercises,week_plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [req.userId, name, type, templateMode || "workout", JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null]
    );
    res.json({ id: result.rows[0].id });
  });
  app.put("/api/workout-templates/:id", requireAuth, async (req, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    await pool.query(
      "UPDATE workout_templates SET name=$2,type=$3,template_mode=$4,exercises=$5,week_plan=$6 WHERE id=$1 AND user_id=$7",
      [req.params.id, name, type, templateMode || "workout", JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/workout-templates/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM workout_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/nutrition", requireAuth, async (req, res) => {
    const { date } = req.query;
    let query = "SELECT * FROM nutrition WHERE user_id=$1";
    const vals = [req.userId];
    if (date) {
      vals.push(date);
      query += ` AND date=$${vals.length}`;
    } else {
      query += " AND date >= CURRENT_DATE - INTERVAL '30 days'";
    }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, vals);
    res.json(result.rows.map(mapNutrition));
  });
  app.post("/api/nutrition", requireAuth, async (req, res) => {
    const { meal, category, calories, protein, carbs, fat, date, ingredients, quantity, unit } = req.body;
    const result = await pool.query(
      `INSERT INTO nutrition (user_id,meal,category,calories,protein,carbs,fat,date,ingredients,quantity,unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        req.userId,
        meal,
        category,
        calories || 0,
        protein || 0,
        carbs || 0,
        fat || 0,
        date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        JSON.stringify(ingredients || []),
        quantity != null && quantity !== "" ? Number(quantity) : null,
        unit || null
      ]
    );
    res.json({ id: result.rows[0].id });
  });
  app.delete("/api/nutrition/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM nutrition WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/meal-templates", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM meal_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapMealTemplate));
  });
  app.post("/api/meal-templates", requireAuth, async (req, res) => {
    const { name, category, ingredients, totalCalories, totalProtein, totalCarbs, totalFat, yieldsPortions } = req.body;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions || 1), 10) || 1));
    await pool.query(
      `INSERT INTO meal_templates (user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req.userId,
        name,
        category,
        JSON.stringify(ingredients || []),
        totalCalories || 0,
        totalProtein || 0,
        totalCarbs || 0,
        totalFat || 0,
        yp
      ]
    );
    res.json({ ok: true });
  });
  app.delete("/api/meal-templates/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM meal_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.get("/api/posts", requireAuth, async (_req, res) => {
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       ORDER BY p.created_at DESC LIMIT 50`
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });
  app.post("/api/posts", requireAuth, async (req, res) => {
    const { content, imageUrl, type, workoutId } = req.body;
    const result = await pool.query(
      "INSERT INTO posts (user_id,content,image_url,type,workout_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [req.userId, content, imageUrl, type || "manual", workoutId]
    );
    res.json({ id: result.rows[0].id });
  });
  app.delete("/api/posts/:id", requireAuth, async (req, res) => {
    await pool.query("DELETE FROM posts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });
  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_append(likes,$2) WHERE id=$1 AND NOT ($2=ANY(likes))",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/posts/:id/like", requireAuth, async (req, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_remove(likes,$2) WHERE id=$1",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });
  app.get("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT c.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM post_comments c JOIN users u ON u.id=c.user_id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      postId: r.post_id,
      userId: r.user_id.toString(),
      userName: r.user_name || r.user_name_fallback || "",
      userPhoto: r.user_photo || "",
      content: r.content,
      createdAt: r.created_at
    })));
  });
  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const { content } = req.body;
    await pool.query(
      "INSERT INTO post_comments (post_id,user_id,content) VALUES ($1,$2,$3)",
      [req.params.id, req.userId, content]
    );
    res.json({ ok: true });
  });
  app.delete("/api/posts/:postId/comments/:commentId", requireAuth, async (req, res) => {
    await pool.query(
      "DELETE FROM post_comments WHERE id=$1 AND user_id=$2",
      [req.params.commentId, req.userId]
    );
    res.json({ ok: true });
  });
  async function callMistral(messages) {
    return completeCoachJson(messages);
  }
  function buildWorkoutPrompt(plan, weekNumber, lastReport, startDayName) {
    const ob = plan.onboarding_data;
    const weeksUntilEvent = plan.event_date ? Math.round((new Date(plan.event_date).getTime() - Date.now()) / (7 * 24 * 3600 * 1e3)) : null;
    const isTaper = weeksUntilEvent !== null && weeksUntilEvent <= 2;
    const adaptationBlock = lastReport ? `
LAST WEEK PERFORMANCE (Week ${weekNumber - 1}):
- Overall rating: ${lastReport.overallRating}/10
- Completion rate: ${lastReport.completionRate}%
- Assessment: ${lastReport.summary}
- Strengths: ${(lastReport.performanceHighlights || []).join("; ")}
- Weaknesses: ${(lastReport.areasToImprove || []).join("; ")}
- Coach recommendation: ${lastReport.recommendation}
- Specific changes requested: ${(lastReport.nextWeekChanges || []).join("; ")}
- Strategy: ${lastReport.nextWeekStrategy}

\u2192 ADAPT THIS WEEK ACCORDINGLY: ${lastReport.recommendation === "increase_volume" ? "Increase training volume by ~10% and push intensity." : lastReport.recommendation === "reduce_volume" ? "Reduce total volume by ~15%, keep quality high." : lastReport.recommendation === "deload" ? "DELOAD WEEK: cut volume by 40%, reduce weights 20%, no high-intensity work." : "Continue with similar structure, implement the specific changes listed above."}` : "";
    return `You are an elite performance coach specializing in ${ob.discipline || plan.discipline}.
Generate a detailed training plan for Week ${weekNumber}.

ATHLETE PROFILE:
- Age: ${ob.age}, Gender: ${ob.gender}
- Fitness Level: ${ob.fitnessLevel}
- Training style: ${ob.trainingStyle || "strength"}, Vibe: ${ob.workoutVibe || "classic_lifting"}
- Sports: ${(ob.sports || []).join(", ") || "n/a"}
- Available ${ob.trainingDays} days/week, sessions up to ${ob.sessionDuration} minutes
- Equipment: ${(ob.equipment || []).join(", ") || "bodyweight only"}
- Injuries/limitations: ${ob.injuries || "none"}
- Current performance/bests: ${ob.currentBests || "not specified"}
- Extra wishes: ${ob.extraWishes || "none"}
${adaptationBlock}

PLAN CONFIGURATION:
- Discipline: ${plan.discipline}
- Mode: ${plan.plan_mode === "event" ? "Event-based" : "Ongoing"}
${plan.plan_mode === "event" ? `- Event: ${plan.event_name} | ${plan.event_distance || ""} | Date: ${plan.event_date} | Weeks remaining: ${weeksUntilEvent}` : ""}
${isTaper ? "\u26A0\uFE0F TAPER WEEK: Reduce volume by 40-50%, maintain intensity. Focus on recovery. Short, sharp sessions only." : ""}

${weekNumber === 1 ? `THIS IS WEEK 1 \u2014 ASSESSMENT WEEK:
The primary goal is to COLLECT BASELINE DATA, not to push the athlete hard.
- Include proper assessment sessions: test sets, time trials, max-rep tests
- Keep overall volume at 60-70% of normal
- Note clearly in each session what is being assessed and why
- Provide specific instructions for the athlete to note down their results (weight used, time, reps)
- These results will be used by the AI to calibrate future weeks
${startDayName ? `TODAY IS ${startDayName.toUpperCase()}. This is a PARTIAL first week. Only schedule sessions from ${startDayName} onwards (do NOT create sessions for days before today). Reduce the total number of sessions for this first week accordingly. Days before ${startDayName} should be Rest days.` : ""}` : `This is Week ${weekNumber}. Apply progression and the adaptations above.`}

Respond with ONLY valid JSON (no markdown):
{
  "weekFocus": "string",
  "coachNotes": "string (2-3 sentences explaining strategy and any adaptations from last week)",
  "schedule": [
    {
      "day": "Monday",
      "isRest": false,
      "sessionType": "Strength|Cardio|Intervals|Technique|Recovery|Cross-training",
      "title": "string",
      "description": "string",
      "estimatedDuration": 60,
      "intensity": "low|moderate|high|very_high",
      "rpe": 7,
      "warmup": "string",
      "exercises": [
        { "name": "string", "sets": 3, "reps": "8-10", "rest": "90s", "weight": "70% 1RM", "notes": "string" }
      ],
      "cardio": { "type": "run|bike|swim|row", "duration": "string", "distance": "string", "pace": "string", "zones": "Zone 2 aerobic" },
      "cooldown": "string",
      "notes": "string"
    }
  ]
}

Include exactly 7 days. Rest days: isRest=true, empty exercises array. Be specific with weights, paces, zones based on fitness level.`;
  }
  function buildNutritionPrompt(plan, weekNumber, lastReport) {
    const ob = plan.onboarding_data;
    const adaptationBlock = lastReport ? `
LAST WEEK NUTRITION PERFORMANCE (Week ${weekNumber - 1}):
- Rating: ${lastReport.overallRating}/10, Completion: ${lastReport.completionRate}%
- Assessment: ${lastReport.summary}
- Changes needed: ${(lastReport.nextWeekChanges || []).join("; ")}
- Strategy: ${lastReport.nextWeekStrategy}

\u2192 ADJUST macros, timing, or meal structure based on this feedback.` : "";
    return `You are an elite sports nutritionist.
Generate a detailed nutrition plan for Week ${weekNumber}.

ATHLETE PROFILE:
- Age: ${ob.age}, Gender: ${ob.gender}, Weight: ${ob.weight}kg, Height: ${ob.height}cm
- Goal: ${ob.nutritionGoal}
- Activity level: ${ob.activityLevel}
- Dietary restrictions: ${(ob.restrictions || []).join(", ") || "none"}
- Allergies: ${ob.allergies || "none"}
- Cooking time: ${ob.cookingTime}
- Meals per day: ${ob.mealsPerDay}
- Food preferences: ${ob.foodPreferences || "varied"}
- Budget: ${ob.budget || "medium"}
${adaptationBlock}

This is Week ${weekNumber}. ${weekNumber === 1 ? "Establish baseline targets." : "Adjust macros and meal structure based on feedback above."}

Respond with ONLY valid JSON (no markdown):
{
  "weekFocus": "string",
  "coachNotes": "string",
  "dailyTargets": { "calories": 2400, "protein": 180, "carbs": 270, "fat": 80 },
  "mealPlan": [
    {
      "day": "Monday",
      "totalCalories": 2400,
      "meals": [
        {
          "type": "breakfast|lunch|dinner|snack",
          "title": "string",
          "description": "string",
          "prepTime": "10 min",
          "calories": 450,
          "protein": 35,
          "carbs": 45,
          "fat": 12,
          "ingredients": ["string"],
          "notes": "string"
        }
      ]
    }
  ],
  "shoppingListHighlights": ["string"],
  "supplementRecommendations": ["string"]
}

Include all 7 days. Be specific, practical, and realistic.`;
  }
  function buildReportPrompt(plan, schedule, completedWorkouts, nutritionEntries, prevReport) {
    const ob = plan.onboarding_data;
    const workoutSummary = completedWorkouts.length > 0 ? completedWorkouts.map((w) => `- ${w.date}: ${w.name} (${w.duration}min, ${w.calories_burned}kcal)`).join("\n") : "No workouts logged this week.";
    const nutritionSummary = nutritionEntries.length > 0 ? `Total entries: ${nutritionEntries.length}, Avg calories: ${Math.round(nutritionEntries.reduce((s, e) => s + Number(e.calories), 0) / Math.max(1, nutritionEntries.length))}kcal` : "No nutrition logged this week.";
    const prevWeekComparison = prevReport ? `
COMPARISON WITH WEEK ${plan.current_week - 1}:
- Last week's rating: ${prevReport.overallRating}/10
- Last week's completion: ${prevReport.completionRate}%
- Last week's coach message: "${prevReport.coachMessage?.substring(0, 200)}..."
- What was planned to change: ${(prevReport.nextWeekChanges || []).join("; ")}
- Did those changes happen? Evaluate honestly in your report.` : "";
    return `You are a direct, honest personal coach writing a WEEKLY REVIEW for your athlete. This is their formal weekly report.

ATHLETE: ${ob.age}y ${ob.gender}, Level: ${ob.fitnessLevel || ob.activityLevel}, Discipline: ${plan.discipline || ob.nutritionGoal}
PLAN: Week ${plan.current_week}, Mode: ${plan.plan_mode}
${prevWeekComparison}

PLANNED SCHEDULE THIS WEEK:
${JSON.stringify(schedule?.schedule?.map((d) => ({ day: d.day, type: d.sessionType || d.meals?.length, title: d.title, duration: d.estimatedDuration })), null, 2)}

ACTUAL COMPLETED WORKOUTS:
${workoutSummary}

NUTRITION THIS WEEK:
${nutritionSummary}

Write a FULL honest weekly report. Compare to last week if data available. Be specific \u2014 mention actual numbers, actual sessions. Don't sugarcoat. The athlete needs real feedback to improve.
nextWeekChanges should be very specific actionable adjustments with reasoning (e.g. "Increase squat volume from 12 to 16 sets because you underloaded last week").

Respond with ONLY valid JSON (no markdown):
{
  "overallRating": 7,
  "coachMessage": "string (personal, direct message, 4-6 sentences, mention specific sessions and numbers)",
  "summary": "string (3-4 sentences honest overall assessment, include week-over-week comparison if available)",
  "performanceHighlights": ["string (specific)"],
  "areasToImprove": ["string (specific with reasoning)"],
  "weekOverWeekComparison": "string (compare to last week \u2014 better/worse/same, and why)",
  "completionRate": 80,
  "nextWeekStrategy": "string (explain the WHY behind next week's approach)",
  "nextWeekChanges": ["string (very specific: what changes and why)"],
  "recommendation": "continue|reduce_volume|increase_volume|deload"
}`;
  }
  app.get("/api/coach/plans", requireAuth, async (req, res) => {
    const plans = await pool.query(
      `SELECT p.*,
              (SELECT row_to_json(s) FROM coach_weekly_schedules s WHERE s.plan_id=p.id AND s.week_number=p.current_week LIMIT 1) AS current_schedule,
              (SELECT row_to_json(r) FROM coach_weekly_reports r WHERE r.plan_id=p.id ORDER BY r.week_number DESC LIMIT 1) AS latest_report
       FROM coach_plans p WHERE p.user_id=$1 ORDER BY p.created_at DESC`,
      [req.userId]
    );
    res.json(plans.rows);
  });
  app.get("/api/coach/plans/:id", requireAuth, async (req, res) => {
    const plan = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!plan.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const schedules = await pool.query("SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 ORDER BY week_number", [req.params.id]);
    const reports = await pool.query("SELECT * FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC", [req.params.id]);
    res.json({ ...plan.rows[0], schedules: schedules.rows, reports: reports.rows });
  });
  app.post("/api/coach/plans", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const { type, discipline, planMode, eventName, eventDate, eventDistance, onboardingData } = req.body;
      const planResult = await pool.query(
        `INSERT INTO coach_plans (user_id,type,discipline,plan_mode,event_name,event_date,event_distance,onboarding_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.userId, type, discipline, planMode, eventName, eventDate || null, eventDistance, JSON.stringify(onboardingData)]
      );
      const plan = planResult.rows[0];
      const today = /* @__PURE__ */ new Date();
      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const todayName = DAY_NAMES[today.getDay()];
      const isPartialWeek = today.getDay() !== 1;
      const prompt = type === "nutrition" ? buildNutritionPrompt(plan, 1) : buildWorkoutPrompt(plan, 1, void 0, isPartialWeek ? todayName : void 0);
      const raw = await callMistral([{ role: "user", content: prompt }]);
      const schedule = JSON.parse(raw);
      const startDate = today;
      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$3",
        [plan.id, startDate.toISOString().split("T")[0], JSON.stringify(schedule)]
      );
      res.json({ planId: plan.id, schedule });
    } catch (err) {
      console.error("coach/plans POST error:", err);
      res.status(500).json({ error: err.message || "Failed to create plan" });
    }
  });
  app.patch("/api/coach/plans/:id", requireAuth, async (req, res) => {
    const { status } = req.body;
    await pool.query(
      "UPDATE coach_plans SET status=$2, updated_at=NOW() WHERE id=$1 AND user_id=$3",
      [req.params.id, status, req.userId]
    );
    res.json({ ok: true });
  });
  app.delete("/api/coach/plans/:id", requireAuth, async (req, res) => {
    try {
      const check = await pool.query(
        "SELECT status FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId]
      );
      if (!check.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (check.rows[0].status !== "cancelled") {
        res.status(400).json({ error: "Only cancelled plans can be deleted. Cancel the plan first." });
        return;
      }
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/coach/plans/:id/next-week", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const nextWeek = plan.current_week + 1;
      const prompt = plan.type === "nutrition" ? buildNutritionPrompt(plan, nextWeek) : buildWorkoutPrompt(plan, nextWeek);
      const raw = await callMistral([{ role: "user", content: prompt }]);
      const schedule = JSON.parse(raw);
      const startDate = /* @__PURE__ */ new Date();
      startDate.setDate(startDate.getDate() + (7 - startDate.getDay() + 1));
      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$4",
        [plan.id, nextWeek, startDate.toISOString().split("T")[0], JSON.stringify(schedule)]
      );
      await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [plan.id, nextWeek]);
      res.json({ weekNumber: nextWeek, schedule });
    } catch (err) {
      console.error("next-week error:", err);
      res.status(500).json({ error: err.message || "Failed to generate next week" });
    }
  });
  app.post("/api/coach/plans/:id/weekly-report", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week]
      );
      const schedule = schedResult.rows[0];
      const monday = /* @__PURE__ */ new Date();
      monday.setDate(monday.getDate() - monday.getDay() + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const [workoutsResult, nutritionResult] = await Promise.all([
        pool.query("SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3", [
          req.userId,
          monday.toISOString().split("T")[0],
          sunday.toISOString().split("T")[0]
        ]),
        pool.query("SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3", [
          req.userId,
          monday.toISOString().split("T")[0],
          sunday.toISOString().split("T")[0]
        ])
      ]);
      const prevReportResult = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week - 1]
      );
      const prevReport = prevReportResult.rows[0]?.report ?? null;
      const prompt = buildReportPrompt(plan, schedule, workoutsResult.rows, nutritionResult.rows, prevReport);
      const raw = await callMistral([{ role: "user", content: prompt }]);
      const report = JSON.parse(raw);
      await pool.query(
        "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
        [plan.id, plan.current_week, JSON.stringify(report)]
      );
      res.json(report);
    } catch (err) {
      console.error("weekly-report error:", err);
      res.status(500).json({ error: err.message || "Failed to generate report" });
    }
  });
  app.patch("/api/coach/plans/:id/schedules/:weekNum/reorder", requireAuth, async (req, res) => {
    try {
      const planCheck = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planCheck.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const schedResult = await pool.query(
        "SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum)]
      );
      if (!schedResult.rows.length) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const { days } = req.body;
      const existing = schedResult.rows[0].schedule;
      const updated = { ...existing, schedule: days };
      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum), JSON.stringify(updated)]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/coach/plans/:id/auto-advance", requireAuth, async (req, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein g\xFCltiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      if (plan.status !== "active") {
        res.json({ advanced: false, reason: "Plan not active" });
        return;
      }
      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, plan.current_week]
      );
      if (!schedResult.rows.length) {
        res.json({ advanced: false, reason: "No current schedule" });
        return;
      }
      const currentSched = schedResult.rows[0];
      const schedStart = new Date(currentSched.start_date);
      const schedEnd = new Date(schedStart);
      schedEnd.setDate(schedStart.getDate() + 7);
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      if (today < schedEnd) {
        res.json({ advanced: false, reason: "Current week still active", daysLeft: Math.ceil((schedEnd.getTime() - today.getTime()) / 864e5) });
        return;
      }
      let report;
      const existingReport = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, plan.current_week]
      );
      if (existingReport.rows.length) {
        report = existingReport.rows[0].report;
      } else {
        const monday = new Date(schedStart);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const [workoutsResult, nutritionResult] = await Promise.all([
          pool.query("SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3", [req.userId, monday.toISOString().split("T")[0], sunday.toISOString().split("T")[0]]),
          pool.query("SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3", [req.userId, monday.toISOString().split("T")[0], sunday.toISOString().split("T")[0]])
        ]);
        const prevReportResult = await pool.query(
          "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
          [req.params.id, plan.current_week - 1]
        );
        const prevReport = prevReportResult.rows[0]?.report ?? null;
        const reportPrompt = buildReportPrompt(plan, currentSched, workoutsResult.rows, nutritionResult.rows, prevReport);
        const rawReport = await callMistral([{ role: "user", content: reportPrompt }]);
        report = JSON.parse(rawReport);
        await pool.query(
          "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
          [req.params.id, plan.current_week, JSON.stringify(report)]
        );
      }
      const nextWeek = plan.current_week + 1;
      const existingNext = await pool.query(
        "SELECT week_number FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, nextWeek]
      );
      let nextSchedule;
      if (!existingNext.rows.length) {
        const prompt = plan.type === "nutrition" ? buildNutritionPrompt(plan, nextWeek, report) : buildWorkoutPrompt(plan, nextWeek, report);
        const raw = await callMistral([{ role: "user", content: prompt }]);
        nextSchedule = JSON.parse(raw);
        const nextMonday = new Date(schedStart);
        nextMonday.setDate(schedStart.getDate() + 7);
        await pool.query(
          "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$4",
          [req.params.id, nextWeek, nextMonday.toISOString().split("T")[0], JSON.stringify(nextSchedule)]
        );
      }
      await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [req.params.id, nextWeek]);
      res.json({ advanced: true, newWeek: nextWeek, report, weeklyReportGenerated: !existingReport.rows.length });
    } catch (err) {
      console.error("auto-advance error:", err);
      res.status(500).json({ error: err.message || "Failed to auto-advance" });
    }
  });
  app.get("/api/coach/latest-report", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1 AND p.status='active'
         ORDER BY r.generated_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!result.rows.length) {
        res.json(null);
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) res.json({ ok: true });
    else res.status(401).json({ error: "Invalid credentials" });
  });
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, email,
              CASE WHEN password_hash IS NOT NULL THEN TRUE ELSE FALSE END AS has_password,
              is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  });
  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { name, email, password } = req.body;
    if (password?.length) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        "UPDATE users SET name=$2,email=$3,display_name=$2,password_hash=$4,updated_at=NOW() WHERE id=$1",
        [req.params.id, name, email, hash]
      );
    } else {
      await pool.query(
        "UPDATE users SET name=$2,email=$3,display_name=$2,updated_at=NOW() WHERE id=$1",
        [req.params.id, name, email]
      );
    }
    res.json({ ok: true });
  });
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  const PORT = parseInt(process.env.PORT || "3000");
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\u{1F680} VRTX server \u2192 http://localhost:${PORT}`);
    console.log(`\u{1F510} Admin panel \u2192 http://localhost:${PORT}/admin`);
  });
}
startServer().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ultimate Food Database – 1000+ items
 */
