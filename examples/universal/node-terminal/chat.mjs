const baseUrl = process.env.OPENAI_BASE_URL || "http://127.0.0.1:3001/v1";
const apiKey = process.env.OPENAI_API_KEY || "local-not-needed";
const model = process.env.HTLM_MODEL || "local";
const prompt = process.argv.slice(2).join(" ") || "Say hi in one sentence.";

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2
  })
});

if (!response.ok) {
  throw new Error(`Local model request failed: ${response.status} ${await response.text()}`);
}

const payload = await response.json();
const text = payload.choices?.[0]?.message?.content || JSON.stringify(payload);
console.log(text);
