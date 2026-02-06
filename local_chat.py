import os
import sys
import tkinter as tk
from tkinter import scrolledtext, messagebox
import traceback
from openai import OpenAI

# Ensure UTF-8 for stdio to avoid Windows codepage issues
try:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY is not set. Set it and reopen CMD.")

try:
    api_key.encode("ascii")
except UnicodeEncodeError:
    raise RuntimeError("OPENAI_API_KEY contains non-ASCII characters. Paste a real key (sk-...).")

client = OpenAI()

def send_message():
    user_text = entry.get().strip()
    if not user_text:
        return

    chat_box.config(state="normal")
    chat_box.insert(tk.END, f"You: {user_text}\n")
    chat_box.config(state="disabled")
    entry.delete(0, tk.END)

    try:
        resp = client.responses.create(
            model="gpt-4o-mini",
            input=[{
                "role": "user",
                "content": [{"type": "input_text", "text": user_text}]
            }]
        )
        bot_text = resp.output_text.strip()
    except Exception:
        err = traceback.format_exc()
        try:
            with open("error.log", "w", encoding="utf-8") as f:
                f.write(err)
        except Exception:
            pass
        messagebox.showerror("Error", "Request failed. See error.log for details.")
        return

    chat_box.config(state="normal")
    chat_box.insert(tk.END, f"Bot: {bot_text}\n\n")
    chat_box.config(state="disabled")
    chat_box.see(tk.END)

root = tk.Tk()
root.title("Local Chat")

chat_box = scrolledtext.ScrolledText(root, wrap=tk.WORD, width=60, height=20, state="disabled")
chat_box.pack(padx=10, pady=10)

entry = tk.Entry(root, width=60)
entry.pack(padx=10, pady=(0, 10))
entry.bind("<Return>", lambda e: send_message())

send_btn = tk.Button(root, text="Send", command=send_message)
send_btn.pack(padx=10, pady=(0, 10))

root.mainloop()
