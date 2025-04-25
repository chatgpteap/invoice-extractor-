// --- 📁 backend/server.js ---

const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const Tesseract = require("tesseract.js");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

app.get("/", (req, res) => {
  res.send("✅ Invoice Extractor Backend is live");
});

app.post("/extract", upload.single("invoice"), async (req, res) => {
  const filePath = req.file.path;
  let extractedText = "";

  try {
    const dataBuffer = fs.readFileSync(filePath);

    if (req.file.mimetype === "application/pdf") {
      try {
        console.log("🔍 Attempting pdf-parse...");
        const data = await pdfParse(dataBuffer);
        extractedText = data.text.trim();
        console.log("✅ Extracted text length:", extractedText.length);
      } catch (err) {
        console.warn("⚠️ pdf-parse failed:", err.message);
      }
    }

    if (!extractedText) {
      console.log("📸 Running OCR fallback...");

      const imageDir = path.join("uploads", `pdf_images_${uuidv4()}`);
      fs.mkdirSync(imageDir);

      try {
        execSync(`pdftoppm "${filePath}" "${path.join(imageDir, 'page')}" -png`);
        const imageFiles = fs.readdirSync(imageDir).filter(f => f.endsWith(".png"));

        const imagePaths = imageFiles.map(f => path.join(imageDir, f));

        const ocrResults = await Promise.all(
          imagePaths.map(imgPath =>
            Tesseract.recognize(imgPath, "eng")
              .then(result => result.data.text)
              .catch(err => {
                console.error("❌ OCR error:", err.message);
                return "";
              })
          )
        );

        extractedText = ocrResults.join("\n").trim();

        imagePaths.forEach(p => fs.unlinkSync(p));
        fs.rmdirSync(imageDir);
        console.log("✅ OCR complete");
      } catch (ocrErr) {
        console.error("🔥 OCR conversion failed:", ocrErr.message);
        return res.status(500).json({ error: "OCR processing failed", details: ocrErr.message });
      }
    }

    if (!extractedText) {
      return res.status(400).json({ error: "Could not extract text from PDF. Please upload a text-based PDF." });
    }

    const prompt = `You are an intelligent invoice parsing assistant. \nFrom the invoice text below, extract the following details accurately:\n\n- "date": Invoice issue date (format: YYYY-MM-DD)\n- "description": A short summary of what the invoice is about\n- "tax_amount": The total tax amount mentioned (in numbers only)\n\nReturn ONLY in the following JSON format:\n{\n  "date": "...",\n  "description": "...",\n  "tax_amount": "..." \n}\n\nIf any field is missing, return an empty string.\n\nINVOICE TEXT:\n${extractedText}`;

    console.log("🧠 Sending to Groq AI...");

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
        timeout: 20000,
      }
    );

    const resultText = response.data.choices[0]?.message?.content;

    try {
      const jsonResponse = JSON.parse(resultText);
      return res.json(jsonResponse);
    } catch {
      return res.status(500).json({ error: "AI response not JSON", raw: resultText });
    }

  } catch (err) {
    console.error("🔥 Server error:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
