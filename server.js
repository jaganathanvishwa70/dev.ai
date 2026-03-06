const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // ✅ supports large image/PDF uploads

// ✅ Check API key
if (!process.env.SAMBANOVA_API_KEY) {
  console.error("❌ SAMBANOVA_API_KEY is missing!");
  process.exit(1);
}

const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY;
const SAMBANOVA_URL = "https://api.sambanova.ai/v1/chat/completions";

// ✅ ONE MODEL for BOTH text and image/PDF
const MODEL = "Llama-4-Maverick-17B-128E-Instruct";

// ✅ Health check
app.get("/", (req, res) => {
  res.json({ message: "🚀 Deva AI backend is running!", model: MODEL });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", model: MODEL });
});

// ✅ Chat route — handles BOTH text and image/PDF
app.post("/api/chat", async (req, res) => {
  try {
    const { systemPrompt, messages, hasImages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Build messages array
    const chatMessages = [];

    // Add system prompt
    if (systemPrompt) {
      chatMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // Add conversation messages
    messages.forEach((m) => {
      if (Array.isArray(m.content)) {
        // ✅ Message contains images or PDFs
        const contentParts = m.content.map((part) => {
          if (part.type === "text") {
            return { type: "text", text: part.text };
          } else if (part.type === "image") {
            // ✅ Image as base64
            return {
              type: "image_url",
              image_url: {
                url: `data:${part.source.media_type};base64,${part.source.data}`,
              },
            };
          } else if (part.type === "document") {
            // ✅ PDF as base64
            return {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${part.source.data}`,
              },
            };
          }
          return part;
        });
        chatMessages.push({ role: m.role, content: contentParts });
      } else {
        // ✅ Plain text message
        chatMessages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        });
      }
    });

    console.log(`📡 Model: ${MODEL} | Messages: ${chatMessages.length} | Has images: ${!!hasImages}`);

    // ✅ SambaNova API call
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ SambaNova API Error:", errText);
      return res.status(response.status).json({ error: "SambaNova API error: " + errText });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No response received.";

    res.json({ reply });

  } catch (error) {
    console.error("❌ Server Error:", error.message);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Deva AI backend running on port ${PORT}`);
  console.log(`✅ Model: ${MODEL} (text + image + PDF)`);
});
