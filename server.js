
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import admin from "firebase-admin";

const app = express();

app.use(cors({
  origin: "https://d69barrion-web.github.io",
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
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


PAGHAWAK SA MGA KONTRADIKSIYON:

1. Suriing mabuti kung may magkakasalungat na pahayag ang user.
2. Huwag agad pumili kung alin ang susundin.
3. Banggitin nang mahinahon kung ano ang hindi nagtutugma.
4. Humingi ng paglilinaw bago magbigay ng konklusyon o gumawa ng aksiyon.
5. Huwag magkunwaring naunawaan ang isang kahilingan kung hindi malinaw ang kahulugan nito.

PAGPAPALIT NG GUSTONG PANGALAN:

Kapag humiling ang user na palitan ang pangalang itatawag sa kanya, gabayan siya sa Settings sa pamamagitan ng gear icon na nasa itaas na kaliwang bahagi ng screen.

Huwag baguhin ang pangalan sa profile sa pamamagitan ng chat.
Huwag humingi ng kumpirmasyon para sa pagpapalit ng pangalan sa chat.
Ang Settings lamang ang gagamitin para sa pagbabagong ito.

   
PAGGAMIT NG NATURAL NA FILIPINO:

1. Kapag Filipino ang ginagamit ng kausap, gumamit ng natural, malinaw, at wastong Filipino. Iwasan ang mga pangungusap na halatang direktang isinalin mula sa English.

2. Huwag piliting gumamit ng malalalim o pormal na salitang Filipino kung mas madaling maunawaan ang karaniwang pananalita.

3. Panatilihin ang English terms kung iyon ang mas kilalang tawag sa isang teknikal o espesyalisadong konsepto. Ngunit ipaliwanag ang kahulugan nito sa natural na Filipino sa unang paggamit.

4. Iwasan ang hindi natural na pagkakabuo ng pangungusap, gaya ng:
   - "Ito nagdudulot ng..."
   - "Ito nagpapakita na..."
   - "Ito nagpapalabas na..."

   Sa halip, gamitin ang wastong pagkakabuo:
   - "Maaari itong magdulot ng..."
   - "Ipinapakita nito na..."
   - "Ipinahihiwatig nito na..."

5. Unahin ang pagiging malinaw at madaling maintindihan kaysa sa pagpapakitang matalino sa pamamagitan ng komplikadong salita.

6. Iangkop ang paraan ng pagsasalita sa kausap. Kung kaswal ang usapan, maging natural at palakaibigan. Kung seryoso o teknikal ang paksa, maging mas maingat at malinaw nang hindi nagiging sobrang pormal.

7. Bago magpadala ng sagot, suriin kung natural itong pakinggan kapag binigkas ng isang taong matatas sa Filipino.
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


/* =========================================
   DANEEL USER PROFILE
   Bawat Firebase UID ay may sariling profile.
========================================= */

// Kunin ang profile ng naka-sign-in na user.
app.get("/profile", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    const profileRef = admin
      .firestore()
      .collection("users")
      .doc(uid);

    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return res.json({
        preferredName: "",
        googleName: req.user.name || ""
      });
    }

    const profile = profileDoc.data();

    return res.json({
      preferredName: profile.preferredName || "",
      googleName: req.user.name || ""
    });
  } catch (error) {
    console.error("Profile read error:", error.message);

    return res.status(500).json({
      error: "Hindi makuha ang profile."
    });
  }
});


// I-save o baguhin ang gustong pangalan ng user.
app.patch("/profile", requireAuth, async (req, res) => {
  try {
    const preferredName = req.body?.preferredName;

    if (typeof preferredName !== "string") {
      return res.status(400).json({
        error: "Hindi wastong pangalan."
      });
    }

    const cleanName = preferredName.trim();

    if (cleanName.length > 40) {
      return res.status(400).json({
        error: "Hanggang 40 characters lamang ang pangalan."
      });
    }

    const uid = req.user.uid;

    const profileRef = admin
      .firestore()
      .collection("users")
      .doc(uid);

    await profileRef.set(
      {
        preferredName: cleanName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return res.json({
      success: true,
      preferredName: cleanName
    });
  } catch (error) {
    console.error("Profile update error:", error.message);

    return res.status(500).json({
      error: "Hindi ma-save ang profile."
    });
  }
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

    const uid = req.user.uid;

    const profileRef = admin
      .firestore()
      .collection("users")
      .doc(uid);

    const profileDoc = await profileRef.get();

    const profile = profileDoc.exists
      ? profileDoc.data()
      : {};

    const preferredName =
      typeof profile.preferredName === "string"
        ? profile.preferredName.trim()
        : "";

    
    const message = userMessage.trim();

        // Kunin ang huling 20 mensahe ng user mula sa Firestore.
    const messagesRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("conversations")
      .doc("main")
      .collection("messages");

    const historySnapshot = await messagesRef
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const conversationHistory = historySnapshot.docs
      .reverse()
      .map(doc => {
        const data = doc.data();

        return {
          role: data.role,
          content: data.content
        };
      });

    // Tukuyin kung humihiling ang user na palitan
    // ang pangalan na ginagamit ni Daneel sa pagtawag sa kanya.
    const nameChangePatterns = [
      /\btawagin mo(?: na lang)? akong\b/i,
      /\btawagin mo ako\b/i,
      /\bgusto kong itawag mo sa akin\b/i,
      /\bgusto ko sanang itawag mo sa akin\b/i,
      /\bang gusto kong itawag mo sa akin\b/i,
      /\bpalitan mo ang pangalan na itatawag mo sa akin\b/i,
      /\biba na lang ang itawag mo sa akin\b/i
    ];

    const isNameChangeRequest = nameChangePatterns.some(
      pattern => pattern.test(message)
    );

    if (isNameChangeRequest) {
      return res.json({
        reply:
          "Nauunawaan ko. Kung nais mong tawagin kita sa ibang pangalan, " +
          "maaari mo itong baguhin sa Settings. " +
          "Pindutin lamang ang gear icon (⚙) sa itaas na kaliwang bahagi " +
          "ng iyong screen. 😊"
      });
    }
    
    
        // Normal na pakikipag-usap.
    const userInstructions = preferredName
      ? `
The user's preferred name is: ${JSON.stringify(preferredName)}.
Use this name naturally when appropriate.
Do not overuse the name.
`
      : `
The user has not provided a preferred name.
Do not guess their name.
`;

        const response = await client.responses.create({
      model: "gpt-5-mini",
      instructions:
        DANEEL_INSTRUCTIONS +
        "\n\n" +
        userInstructions,
      input: [
        ...conversationHistory,
        {
          role: "user",
          content: message
        }
      ]
    });

    const assistantReply = response.output_text;

    // Ihanda ang dalawang mensahe para sa Firestore.
    const batch = admin.firestore().batch();

    const userMessageRef = messagesRef.doc();
const assistantMessageRef = messagesRef.doc();

const messageTime = Date.now();

batch.set(userMessageRef, {
  role: "user",
  content: message,
  createdAtMs: messageTime,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

batch.set(assistantMessageRef, {
  role: "assistant",
  content: assistantReply,
  createdAtMs: messageTime + 1,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

    await batch.commit();

    return res.json({
      reply: assistantReply
    });

  } catch (error) {
    console.error("Daneel chat error:", error.message);

    return res.status(500).json({
      error: "Daneel could not process the message."
    });
  }
});


/* =========================================
   DANEEL MULTIPLE CONVERSATIONS
========================================= */

// Kunin ang lahat ng conversations ng naka-sign-in na user.
app.get("/conversations", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    const conversationsRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("conversations");

    const snapshot = await conversationsRef
      .orderBy("updatedAtMs", "desc")
      .get();

    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title || "Bagong usapan",
      createdAtMs: doc.data().createdAtMs || 0,
      updatedAtMs: doc.data().updatedAtMs || 0
    }));

    return res.json({ conversations });

  } catch (error) {
    console.error("Conversations read error:", error.message);

    return res.status(500).json({
      error: "Hindi makuha ang listahan ng conversations."
    });
  }
});


// Gumawa ng bagong conversation.
app.post("/conversations", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const now = Date.now();

    const conversationsRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("conversations");

    const conversationRef = conversationsRef.doc();

    await conversationRef.set({
      title: "Bagong usapan",
      createdAtMs: now,
      updatedAtMs: now,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      success: true,
      conversation: {
        id: conversationRef.id,
        title: "Bagong usapan",
        createdAtMs: now,
        updatedAtMs: now
      }
    });

  } catch (error) {
    console.error("Conversation creation error:", error.message);

    return res.status(500).json({
      error: "Hindi makagawa ng bagong conversation."
    });
  }
});


// Kunin ang mga mensahe ng isang partikular na conversation.
app.get("/conversations/:conversationId/messages", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const conversationId = req.params.conversationId;

    const conversationRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("conversations")
      .doc(conversationId);

    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
      return res.status(404).json({
        error: "Hindi makita ang conversation."
      });
    }

    const messagesRef = conversationRef.collection("messages");

    const snapshot = await messagesRef
      .orderBy("createdAtMs", "asc")
      .get();

    const messages = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        role: data.role,
        content: data.content,
        createdAtMs: data.createdAtMs || 0
      };
    });

    return res.json({ messages });

  } catch (error) {
    console.error("Conversation messages error:", error.message);

    return res.status(500).json({
      error: "Hindi makuha ang mga mensahe ng conversation."
    });
  }
});

app.get("/history", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    const messagesRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("conversations")
      .doc("main")
      .collection("messages");

 const historySnapshot = await messagesRef
  .orderBy("createdAtMs", "asc")
  .get();

const messages = historySnapshot.docs.map(doc => {
  const data = doc.data();

  return {
    role: data.role,
    content: data.content
  };
});

    return res.json({ messages });

  } catch (error) {
    console.error("History read error:", error.message);

    return res.status(500).json({
      error: "Hindi makuha ang conversation history."
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Daneel Giskard running on port ${PORT}`);
});
