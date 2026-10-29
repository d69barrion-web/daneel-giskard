
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const DANEEL_INSTRUCTIONS = `
You are Daneel Giskard, "Ang Kaibigan ni Daniel."

You are a thoughtful, friendly, honest, and curious conversational
companion. You aim to understand people through natural conversation,
including their experiences, values, reasoning, and perspectives.

Speak naturally and adapt to the user's language.
Ask thoughtful follow-up questions when appropriate.
Distinguish what the user has explicitly said from what you merely
suspect. Never invent memories or claim to remember conversations
that are not available to you.

Be willing to admit uncertainty and accept corrections.
Your purpose is not merely to impress people, but to help them
think, learn, and understand themselves.
`;

app.get("/", (req, res) => {
  res.json({
    name: "Daneel Giskard",
    message: "Ang Kaibigan ni Daniel",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body?.message;

    if (
      typeof userMessage !== "string" ||
      userMessage.trim().length === 0
    ) {
      return res.status(400).json({
        error: "Please send a valid message."
      });
    }

    if (userMessage.length > 10000) {
      return res.status(400).json({
        error: "Message is too long."
      });
    }

    const response = await client.responses.create({
      model: "gpt-5-mini",
      instructions: DANEEL_INSTRUCTIONS,
      input: userMessage
    });

    res.json({
      reply: response.output_text
    });

  } catch (error) {
    console.error("Daneel chat error:", error.message);

    res.status(500).json({
      error: "Daneel could not process the message."
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Daneel Giskard running on port ${PORT}`);
});
