const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const { fromPath } = require("pdf2pic");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

app.get("/", (req, res) => {
  res.send("Invoice Extractor Backend is running ✅");
});

app.post("/extract", upload.single("invoice"), async (req, res) => {
  const filePath = req.file.path;
  let extractedText = "";

  try {
    const dataBuffer = fs.readFileSync(filePath);

    if (req.file.mimetype === "application/pdf") {
      try {
        const data = await pdfParse(dataBuffer);
        extractedText = data.text.trim();
      } catch (err) {
        console.warn("⚠️ pdf-parse failed, will try OCR");
      }
    }

    if (!extractedText) {
      const imagePaths = [];

      if (req.file.mimetype === "application/pdf") {
        const pdf2pic = fromPath(filePath, {
          density: 150,
          saveFilename: "ocr_page",
          savePath: path.join(__dirname, "tmp"),
          format: "png",
          width: 1000,
          height: 1000,
        });

        const meta = await pdfParse(dataBuffer);
        for (let i = 1; i <= meta.numpages; i++) {
          const result = await pdf2pic(i);
          if (result.path) imagePaths.push(result.path);
        }
      } else {
        imagePaths.push(filePath);
      }

      for (const imgPath of imagePaths) {
        const { data: { text } } = await Tesseract.recognize(imgPath, "eng");
        extractedText += `\n${text.trim()}`;
      }
    }

    const prompt = `You are an intelligent invoice parsing assistant. \nFrom the invoice text below, extract the following details accurately:\n\n- \"date\": Invoice issue date (format: YYYY-MM-DD)\n- \"description\": A short summary of what the invoice is about\n- \"tax_amount\": The total tax amount mentioned (in numbers only)\n\nReturn ONLY in the following JSON format:\n{\n  \"date\": \"...\",\n  \"description\": \"...\",\n  \"tax_amount\": \"...\"\n}\n\nIf any field is missing, return an empty string for it.\n\nINVOICE TEXT:\n${extractedText}`;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "mixtral-8x7b-32768",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const resultText = response.data.choices[0]?.message?.content;

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(resultText);
    } catch {
      return res.status(500).json({ error: "AI response not JSON", raw: resultText });
    }

    res.json(jsonResponse);
  } catch (err) {
    console.error("🔥 Server error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
