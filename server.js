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
// Normal chat → fast model (higher rate limits, no 429)
// Image/PDF upload → vision model
const TEXT_MODEL   = "Meta-Llama-3.3-70B-Instruct";       // high rate limit ✅
const VISION_MODEL = "Llama-4-Maverick-17B-128E-Instruct"; // for images only

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get("/", (req, res) => {
  res.json({ message: "🚀 Deva AI backend running!", textModel: TEXT_MODEL, visionModel: VISION_MODEL });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", textModel: TEXT_MODEL, visionModel: VISION_MODEL });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { systemPrompt, messages, hasImages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // ✅ Choose model — only use vision model if images present
    const MODEL = hasImages ? VISION_MODEL : TEXT_MODEL;

    // Build messages
    const chatMessages = [];

    if (systemPrompt) {
      chatMessages.push({ role: "system", content: systemPrompt });
    }

    messages.forEach((m) => {
      if (Array.isArray(m.content)) {
        const contentParts = m.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          if (part.type === "image") return {
            type: "image_url",
            image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
          };
          if (part.type === "document") return {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${part.source.data}` },
          };
          return part;
        });
        chatMessages.push({ role: m.role, content: contentParts });
      } else {
        chatMessages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        });
      }
    });

    console.log(`📡 Model: ${MODEL} | Messages: ${chatMessages.length} | Images: ${!!hasImages}`);

    // ✅ Retry loop — handles 429 automatically
    const maxRetries = 4;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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

      if (response.status === 429) {
        const waitSec = attempt * 5; // 5s → 10s → 15s → 20s
        console.log(`⚠️ 429 Rate limit. Attempt ${attempt}/${maxRetries}. Waiting ${waitSec}s...`);
        if (attempt < maxRetries) {
          await sleep(waitSec * 1000);
          continue;
        } else {
          console.error("❌ All retries failed.");
          return res.status(429).json({
            error: "🙏 Our divine servers are meditating. Please wait a moment and try again.",
          });
        }
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error("❌ API Error:", errText);
        return res.status(response.status).json({ error: "API error: " + errText });
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "No response received.";
      console.log(`✅ Success on attempt ${attempt}`);
      return res.json({ reply });
    }

  } catch (error) {
    console.error("❌ Server Error:", error.message);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Deva AI backend running on port ${PORT}`);
  console.log(`✅ Text model : ${TEXT_MODEL}`);
  console.log(`✅ Vision model: ${VISION_MODEL}`);
  console.log(`✅ Auto-retry on 429: enabled`);
});
