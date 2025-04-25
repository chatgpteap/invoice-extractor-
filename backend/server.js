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

        const prompt = `
Extract the following from this invoice text:
- Date
- Description
- Tax Amount

Reply ONLY in this JSON format:
{
  "date": "...",
  "description": "...",
  "tax_amount": "..."
}

Text:
${extractedText}
        `.trim();

        const response = await g4f.chatCompletion({
            model: "gpt-4", // or "gpt-3.5-turbo"
            messages: [
                { role: "user", content: prompt }
            ]
        });

        res.json(JSON.parse(response));
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Failed to extract invoice data." });
    } finally {
        fs.unlinkSync(filePath);
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
