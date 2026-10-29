
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import admin from "firebase-admin";

const app = express();

app.use(cors({
  origin: "https://d69barrion-web.github.io",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "20kb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Firebase Admin: para mapatunayan ng server ang Google sign-in.
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!rawServiceAccount) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
}

const serviceAccount = JSON.parse(rawServiceAccount);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Firebase UID ng user na napatunayan ng server.
async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer (.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: "Mag-sign in muna sa Google para makapag-chat."
    });
  }

  try {
    req.user = await admin.auth().verifyIdToken(match[1]);
    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid or expired sign-in. Mag-sign in ulit."
    });
  }
}


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
  res.json({ status: "ok" });
});

app.post("/chat", requireAuth, async (req, res) => {
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
