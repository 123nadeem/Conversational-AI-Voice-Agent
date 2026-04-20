from flask import Flask, request, jsonify, render_template, Response
from openai import OpenAI

app = Flask(__name__)

# ── YOUR OPENAI KEY ──
client = OpenAI(api_key="")

SYSTEM = (
    "You are a helpful, friendly AI voice assistant. "
    "Give clear, concise answers in 2-4 sentences. "
    "No markdown, no bullet points — plain conversational speech only."
)

conversation = []


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/transcribe", methods=["POST"])
def transcribe():
    audio = request.files["audio"]
    audio_bytes = audio.read()

    if len(audio_bytes) < 3200:
        return jsonify({"text": ""})

    result = client.audio.transcriptions.create(
        model="whisper-1",
        file=("audio.wav", audio_bytes, "audio/wav"),
    )
    return jsonify({"text": result.text})


@app.route("/chat", methods=["POST"])
def chat():
    global conversation
    user_text = request.json["text"]

    conversation.append({"role": "user", "content": user_text})
    messages = [{"role": "system", "content": SYSTEM}] + conversation[-10:]

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=200,
    )
    reply = response.choices[0].message.content
    conversation.append({"role": "assistant", "content": reply})
    return jsonify({"reply": reply})


@app.route("/speak", methods=["POST"])
def speak():
    text = request.json["text"]
    response = client.audio.speech.create(
        model="tts-1",
        voice="alloy",
        input=text,
        response_format="mp3",
    )
    return Response(response.content, mimetype="audio/mpeg")


@app.route("/reset", methods=["POST"])
def reset():
    global conversation
    conversation = []
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)