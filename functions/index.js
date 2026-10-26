const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

exports.askJinoAI = onCall(
  {
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 60
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Mag-login muna para magamit ang Jino AI."
      );
    }

    const message = request.data?.message;

    if (typeof message !== "string" || !message.trim()) {
      throw new HttpsError("invalid-argument", "Walang mensaheng natanggap.");
    }

    if (message.length > 4000) {
      throw new HttpsError("invalid-argument", "Masyadong mahaba ang mensahe.");
    }

    const apiKey = GEMINI_API_KEY.value();

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: message.trim() }]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        console.error("Gemini API error:", response.status);
        throw new HttpsError("internal", "Hindi sumagot ang AI service.");
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        throw new HttpsError("internal", "Walang sagot na natanggap mula sa AI.");
      }

      return { reply };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Jino AI error:", error);
      throw new HttpsError("internal", "May problema sa AI service.");
    }
  }
);
