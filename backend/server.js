const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

// Health check route
app.get("/", (req, res) => {
  res.send("Invoice Extractor Backend is running ✅");
});

app.post("/extract", upload.single("invoice"), async (req, res) => {
    const filePath = req.file.path;
    let extractedText = "";

    try {
        if (req.file.mimetype === "application/pdf") {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            extractedText = data.text;
        } else {
            const { data: { text } } = await Tesseract.recognize(filePath, "eng");
            extractedText = text;
        }

        const prompt = `Extract the following from this invoice text:\n- Date\n- Description\n- Tax Amount\n\nReply ONLY in this JSON format:\n{\n  \"date\": \"...\",\n  \"description\": \"...\",\n  \"tax_amount\": \"...\"\n}\n\nText:\n${extractedText}`;

        const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "mixtral-8x7b-32768",
                messages: [
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const resultText = response.data.choices[0].message.content;

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(resultText);
        } catch (parseErr) {
            return res.status(500).json({ error: "AI response not in JSON format", raw: resultText });
        }

        res.json(jsonResponse);
    } catch (err) {
        console.error("🔥 Server error:", err);
        res.status(500).json({ error: "Server failed", details: err.message });
    } finally {
        fs.unlinkSync(filePath);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});
