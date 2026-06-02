const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

if (!process.env.SAMBANOVA_API_KEY) {
  console.error("❌ SAMBANOVA_API_KEY is missing!");
  process.exit(1);
}

const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY;
const SAMBANOVA_URL = "https://api.sambanova.ai/v1/chat/completions";

// ✅ SMART MODEL SWITCHING
const TEXT_MODEL = "Meta-Llama-3.3-70B-Instruct";
const VISION_MODEL = "Llama-4-Maverick-17B-128E-Instruct";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get("/", (req, res) => {
  res.json({
    message: "🚀 Deva AI backend running!",
    textModel: TEXT_MODEL,
    visionModel: VISION_MODEL,
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    textModel: TEXT_MODEL,
    visionModel: VISION_MODEL,
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    console.log("\n==============================");
    console.log("📥 NEW REQUEST RECEIVED");
    console.log("⏰ Time:", new Date().toISOString());
    console.log("==============================");

    const { systemPrompt, messages, hasImages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log("❌ Invalid messages array");
      return res.status(400).json({
        error: "Messages array is required",
      });
    }

    const MODEL = hasImages ? VISION_MODEL : TEXT_MODEL;

    const chatMessages = [];

    if (systemPrompt) {
      chatMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    messages.forEach((m) => {
      if (Array.isArray(m.content)) {
        const contentParts = m.content.map((part) => {
          if (part.type === "text") {
            return {
              type: "text",
              text: part.text,
            };
          }

          if (part.type === "image") {
            return {
              type: "image_url",
              image_url: {
                url: `data:${part.source.media_type};base64,${part.source.data}`,
              },
            };
          }

          if (part.type === "document") {
            return {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${part.source.data}`,
              },
            };
          }

          return part;
        });

        chatMessages.push({
          role: m.role,
          content: contentParts,
        });
      } else {
        chatMessages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        });
      }
    });

    console.log("📡 MODEL:", MODEL);
    console.log("📡 MESSAGE COUNT:", chatMessages.length);
    console.log("📡 HAS IMAGES:", !!hasImages);
    console.log("📡 API KEY EXISTS:", !!SAMBANOVA_API_KEY);

    const maxRetries = 4;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log("\n--------------------------");
      console.log(`📤 ATTEMPT ${attempt}/${maxRetries}`);
      console.log("📤 Sending request to SambaNova...");
      console.log("--------------------------");

      const response = await fetch(SAMBANOVA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SAMBANOVA_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: chatMessages,
          max_tokens: 4000,
          temperature: 0.9,
          stream: false,
        }),
      });

      console.log("📥 Response Status:", response.status);
      console.log("📥 Response Status Text:", response.statusText);

      if (response.status === 429) {
        const waitSec = attempt * 5;

        console.log("⚠️ RATE LIMIT HIT");
        console.log(`⚠️ Waiting ${waitSec} seconds`);

        if (attempt < maxRetries) {
          await sleep(waitSec * 1000);
          continue;
        }

        console.log("❌ All retries exhausted");

        return res.status(429).json({
          error:
            "🙏 Our divine servers are meditating. Please wait a moment and try again.",
        });
      }

      if (!response.ok) {
        const errText = await response.text();

        console.log("\n==============================");
        console.log("❌ SAMBANOVA API ERROR");
        console.log("❌ STATUS:", response.status);
        console.log("❌ STATUS TEXT:", response.statusText);
        console.log("❌ RESPONSE BODY:");
        console.log(errText);
        console.log("==============================\n");

        return res.status(response.status).json({
          error: errText,
        });
      }

      const data = await response.json();

      console.log("✅ SUCCESS");
      console.log(
        "✅ Reply Length:",
        data?.choices?.[0]?.message?.content?.length || 0
      );

      const reply =
        data?.choices?.[0]?.message?.content ||
        "No response received.";

      return res.json({
        reply,
      });
    }
  } catch (error) {
    console.log("\n==============================");
    console.log("❌ SERVER ERROR");
    console.log("❌ Time:", new Date().toISOString());
    console.log("❌ Message:", error.message);
    console.log("❌ Name:", error.name);
    console.log("❌ Stack:");
    console.log(error.stack);
    console.log("==============================\n");

    res.status(500).json({
      error: error.message || "Internal Server Error",
    });
  }
});

const PORT = process.env.PORT || 3001;

console.log("==================================");
console.log("🚀 STARTUP DIAGNOSTICS");
console.log("Node Version:", process.version);
console.log("PORT:", PORT);
console.log("API Key Loaded:", !!process.env.SAMBANOVA_API_KEY);
console.log("Text Model:", TEXT_MODEL);
console.log("Vision Model:", VISION_MODEL);
console.log("==================================");

app.listen(PORT, () => {
  console.log(`🚀 Deva AI backend running on port ${PORT}`);
  console.log(`✅ Text model: ${TEXT_MODEL}`);
  console.log(`✅ Vision model: ${VISION_MODEL}`);
  console.log(`✅ Auto-retry on 429: enabled`);
});
