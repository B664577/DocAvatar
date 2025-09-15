import json
import io
import base64
import math
from PIL import Image
import requests
from dots_ocr.utils.image_utils import PILimage_to_base64
from openai import OpenAI
import os


def inference_with_vllm(
        image,
        prompt,
        ip="localhost",
        port=8000,
        temperature=0.1,
        top_p=0.9,
        max_completion_tokens=32768,
        model_name='model',
        user_hint: str | None = None,
        ):
    
    addr = f"http://{ip}:{port}/v1"
    client = OpenAI(api_key="{}".format(os.environ.get("API_KEY", "0")), base_url=addr)
    messages = []
    if user_hint:
        hint = str(user_hint).strip()
        if hint:
            messages.append({
                "role": "system",
                "content": hint,
            })
    messages.append({
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {"url":  PILimage_to_base64(image)},
            },
            {"type": "text", "text": f"<|img|><|imgpad|><|endofimg|>{prompt}"}
        ],
    })
    try:
        response = client.chat.completions.create(
            messages=messages, 
            model=model_name, 
            max_completion_tokens=max_completion_tokens,
            temperature=temperature,
            top_p=top_p)
        response = response.choices[0].message.content
        return response
    except requests.exceptions.RequestException as e:
        print(f"request error: {e}")
        return None


def inference_with_stepfun(
        image,
        prompt,
        api_key,
        base_url="https://api.stepfun.com/v1",
        model_name="step-1o-turbo-vision",
        temperature=0.1,
        top_p=0.9,
        max_tokens=32768,
    ):
    """
    Call StepFun (阶跃星辰) OpenAI-compatible chat completions API with vision input.
    """
    # Ensure base_url has no trailing spaces
    base_url = (base_url or "https://api.stepfun.com/v1").strip()
    client = OpenAI(api_key=api_key, base_url=base_url)

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": PILimage_to_base64(image)},
                },
                {"type": "text", "text": prompt},
            ],
        }
    ]

    try:
        response = client.chat.completions.create(
            messages=messages,
            model=model_name,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
        )
        response = response.choices[0].message.content
        return response
    except requests.exceptions.RequestException as e:
        print(f"request error: {e}")
        return None

