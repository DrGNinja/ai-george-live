# Training a custom voice for free

The live coach speaks with **Kokoro-82M**, which describes a voice as a "style table" (510 × 256 numbers). The Studio can already blend Kokoro's stock voices. A custom style table fitted to your recordings gets closer to your real voice, still runs in every student's browser, and costs nothing.

You need the dataset from **Studio → Voice → Export recordings** (`my-voice-dataset.zip`: 22,050 Hz WAV clips plus `metadata.csv`). Keep it private: it's enough to clone your voice.

## Path A: fit a Kokoro voice style (CPU only, no GPU)

[KVoiceWalk](https://github.com/RobViren/kvoicewalk) (Apache-2.0) searches for a Kokoro style table that sounds like a target recording, using only a CPU. Expect it to run for a few hours on a laptop or a lab machine.

1. Install Python 3.10+ and follow KVoiceWalk's README to set it up.
2. Choose one or two of your cleanest clips (15–30 seconds combined, natural pace) and their exact transcript from `metadata.csv`, and give them to KVoiceWalk as the target.
3. Let it run. It saves the best voice as a PyTorch `.pt` tensor.
4. Convert that file for the browser:
   ```
   pip install torch numpy
   python tools/pt_to_bin.py best_voice.pt george.bin
   ```
5. In **Studio → Voice**, choose `george.bin` under *Custom voice style*, press **Preview**, then **Save voice** and **Publish**.

Check KVoiceWalk's README for its exact options. This guide doesn't pin them because the project changes.

## Path B: a fully trained voice (free GPU, closest likeness)

Training a dedicated text-to-speech model on 30–60 minutes of your recordings gives the closest clone. Two free routes:

- **Piper**: fine-tune from an English Piper checkpoint on a free Google Colab GPU or a lab machine with an NVIDIA GPU, using the exported dataset (it is already in the LJSpeech layout Piper expects). See [TextyMcSpeechy](https://github.com/domesticatedviking/TextyMcSpeechy) or the [Piper training guide](https://github.com/ZachB100/Piper-Training-Guide-with-Screen-Reader). The result is an `.onnx` voice.
- **Kokoro fine-tuning**: community scripts can fine-tune Kokoro itself; results vary.

The live room speaks Kokoro voices today. Running a trained Piper `.onnx` voice in the browser is the next planned addition. Until then, Path A is the way to get your own voice into the live room.

## Responsible use

- The published voice is encrypted with the class passphrase, but anyone with the passphrase could extract it. Don't use the clone where a voice is trusted for identity (phone approvals, voicemail authorization).
- Students always see "AI CLONE · NOT LIVE PERSON" on screen, and the coach introduces itself as an AI.
- To retire the voice, publish again without it (or with a new passphrase) and delete the dataset.
