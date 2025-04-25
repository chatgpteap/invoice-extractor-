const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const cors = require("cors");
const { ask } = require("puter.js");

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
Extract the following from this invoice:
- Date
- Description
- Tax Amount

Text:
${extractedText}

Reply in JSON format:
{
  "date": "...",
  "description": "...",
  "tax_amount": "..."
}
        `.trim();

        const response = await ask(prompt, { model: "gpt-4o-mini" });
        res.json(JSON.parse(response.text));
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Failed to extract." });
    } finally {
        fs.unlinkSync(filePath);
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});

