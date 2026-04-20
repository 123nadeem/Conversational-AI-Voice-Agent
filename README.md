```markdown
# Moon — Conversational AI Voice Agent

A hands-free AI voice assistant powered by OpenAI GPT-4o, Whisper, and TTS.

## How It Works
Activate once → speak naturally → Moon listens, thinks, and replies in voice.  
No button presses required after activation.

## Tech Stack
- **Backend:** Python, Flask
- **STT:** OpenAI Whisper
- **LLM:** OpenAI GPT-4o
- **TTS:** OpenAI TTS (Nova voice)
- **Frontend:** HTML, CSS, JavaScript (Web Audio API)

## Setup

1. Clone the repo and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Add your OpenAI key in `app.py`:
   ```python
   client = OpenAI(api_key="sk-...")
   ```

3. Run:
   ```bash
   python app.py
   ```

4. Open `http://localhost:5000` in Chrome

## Usage
- Click **Activate** to wake the assistant
- Say **"Hey Moon"** to start a conversation
- Speak naturally — it auto-detects when you stop (2s silence)
- Say anything and Moon will respond in voice
- Click **Put to sleep** to deactivate

## Requirements
- Python 3.8+
- OpenAI API key with billing enabled
- Chrome or Edge browser (for Web Audio API)
```
