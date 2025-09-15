from setuptools import setup, find_packages

setup(
    name="dots_ocr_plugin",
    version="1.0.0",
    packages=find_packages(),
    description="vLLM plugin for DotsOCR model",
    install_requires=[
        "vllm>=0.5.0",
    ],
)