import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import fs from "fs";
import cors from "cors";
import axios from "axios";
import path from "path";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "tesseract.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());

app.get("/", (req, res) => {
  res.send("✅ Invoice Extractor Backend is running.");
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
      } catch {
        console.warn("⚠️ pdf-parse failed, will try OCR fallback");
      }
    }

    if (!extractedText) {
      const imageDir = path.join(__dirname, "uploads", `pdf_images_${uuidv4()}`);
      fs.mkdirSync(imageDir);

      try {
        execSync(`pdftoppm "${filePath}" "${path.join(imageDir, "page")}" -png`);
        const imageFiles = fs.readdirSync(imageDir).filter(f => f.endsWith(".png"));
        const imagePaths = imageFiles.map(f => path.join(imageDir, f));

        const ocrResults = await Promise.all(
          imagePaths.map(imgPath =>
            Tesseract.recognize(imgPath, "eng").then(result => result.data.text)
          )
        );

        extractedText = ocrResults.join("\n").trim();

        imagePaths.forEach(p => fs.unlinkSync(p));
        fs.rmdirSync(imageDir);
      } catch (ocrErr) {
        console.error("❌ OCR processing failed:", ocrErr);
        return res.status(500).json({ error: "OCR processing failed", details: ocrErr.message });
      }
    }

    if (!extractedText) {
      return res.status(400).json({ error: "Could not extract text from PDF. Please upload a text-based or clear scanned file." });
    }

    const prompt = `You are an invoice parser. Extract:
- date (format: YYYY-MM-DD)
- description
- tax_amount (number only)
Respond as JSON:
{ "date": "...", "description": "...", "tax_amount": "..." }
If missing, return empty string. 
INVOICE TEXT: 
${extractedText}`;

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
      return res.status(500).json({ error: "AI response was not valid JSON", raw: resultText });
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
  console.log(`🚀 Server listening on port ${PORT}`);
});
