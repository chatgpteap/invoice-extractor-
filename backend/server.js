--- 📁 backend/server.js ---

const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const cors = require("cors");
const g4f = require("g4f");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

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

        const response = await g4f.chatCompletion({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }]
        });

        console.log("🧠 Raw AI response:", response);

        let jsonResponse;
        try {
            jsonResponse = JSON.parse(response);
        } catch (parseErr) {
            return res.status(500).json({ error: "AI response not in JSON format", raw: response });
        }

        res.json(jsonResponse);
    } catch (err) {
        console.error("🔥 Server error:", err);
        res.status(500).json({ error: "Server failed", details: err.message });
    } finally {
        fs.unlinkSync(filePath);
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
