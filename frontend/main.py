import streamlit as st
import requests
import pandas as pd
from io import StringIO

BACKEND_URL = "https://invoice-extractor-o6es.onrender.com/extract"  # Replace with actual Render backend URL

st.set_page_config(page_title="Invoice Extractor", layout="centered")
st.title("📄 Free Invoice Data Extractor (AI Powered)")

st.markdown("""
Upload an **invoice PDF or image**, and this app will extract:
- 🗓 **Date**
- 📝 **Description**
- 💰 **Tax Amount**

All for free – no API keys needed.
""")

uploaded_file = st.file_uploader("Upload Invoice File (PDF/JPG/PNG)", type=["pdf", "jpg", "jpeg", "png"])

if uploaded_file:
    if st.button("🚀 Extract Data"):
        with st.spinner("Extracting using AI..."):
            try:
                files = {"invoice": uploaded_file.getvalue()}
                response = requests.post(BACKEND_URL, files=files)

                if response.status_code == 200:
                    data = response.json()
                    df = pd.DataFrame([data])
                    st.success("✅ Extraction Complete!")
                    st.dataframe(df)

                    csv_buffer = StringIO()
                    df.to_csv(csv_buffer, index=False)
                    st.download_button("⬇️ Download as CSV", data=csv_buffer.getvalue(), file_name="invoice_data.csv", mime="text/csv")

                else:
                    st.error(f"❌ Backend Error {response.status_code}: {response.text}")
            except Exception as e:
                st.error(f"⚠️ Failed to extract data: {e}")
else:
    st.info("Please upload a PDF or image to begin.")
